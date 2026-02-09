from fastapi import APIRouter, Body, Depends, HTTPException, BackgroundTasks
from typing import Optional, List
from backend.database import entities_collection, entity_helper
from backend.models import (
    ResponseModel,
    PostingCreateRequest,
    PostCreationStatus,
)
from backend.auth import get_current_user
from backend.ai.factory import get_image_provider, get_text_provider, get_r2_utils, get_video_provider
from backend.sse_manager import sse_manager
from bson import ObjectId
from datetime import datetime
import uuid
from io import BytesIO
from PIL import Image
import httpx
import base64

router = APIRouter()


async def generate_post_content(posting_id: str, influencer_id: str, prompt: str, reference_image_url: Optional[str] = None, reference_images: Optional[List[dict]] = None):
    """Background task to generate post content and images."""
    try:
        # Get influencer details
        influencer = await entities_collection.find_one({"_id": ObjectId(influencer_id), "kind": "influencer"})
        if not influencer:
            raise Exception("Influencer not found")
        
        influencer_data = influencer["data"]
        name = influencer_data.get("name", "Influencer")
        
        # Use influencer avatar if no reference provided
        if not reference_image_url and influencer_data.get("avatarUrl"):
            reference_image_url = influencer_data["avatarUrl"]

        # Update status to generating story
        await entities_collection.update_one(
            {"_id": ObjectId(posting_id)},
            {"$set": {"data.status": PostCreationStatus.GENERATING_STORY, "updated_at": datetime.utcnow()}}
        )
        
        # Broadcast status update via SSE
        await sse_manager.broadcast(
            f"post:{posting_id}",
            "status_update",
            {"status": PostCreationStatus.GENERATING_STORY, "message": "Writing story..."}
        )
        await sse_manager.broadcast(
            f"influencer:{influencer_id}",
            "post_update",
            {"post_id": posting_id, "status": PostCreationStatus.GENERATING_STORY}
        )
        
        # Generate story with AI
        text_provider = get_text_provider()
        
        # Build reference context for the prompt
        ref_context = ""
        if reference_images:
            ref_context = "ADDITIONAL REFERENCES:\n"
            for i, ref in enumerate(reference_images):
                # Adjust index since avatar is usually [1]
                idx = i + 2 
                ref_context += f"- Image [{idx}] ({ref.get('role', 'object')}): {ref.get('description', '')}\n"
            ref_context += "\nINSTRUCTION: Incorporate these references into the visual scenes where appropriate as described.\n"

        story_prompt = f"""
        Act as a Creative Director for influencer "{name}".
        
        CREATIVE BRIEF:
        {prompt}

        {ref_context}
          
        TASK:
        Generate 4 carousel telling the story breifed in the prompt in instagram format.

        Output JSON with:
        - "caption": Main post caption (engaging, authentic, includes relevant hashtags and emojis)
        - "slides": Array of exactly 4 objects, each with:
          * "caption": Short storytelling caption for this slide (casual, first-person, with emojis)
          * "visual_scene": Detailed scene description for image generation
            - Include specific camera angle/framing (POV, portrait, selfie, candid)
            - Include outfit details, setting, lighting, pose, mood unique for this story
            - Keywords: "shot on iPhone", "flash photography", "candid", "grainy"
            - DO NOT describe facial features (comes from avatar)
        
        """
        
        content_schema = {
            "type": "object",
            "properties": {
                "caption": {"type": "string"},
                "slides": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "caption": {"type": "string"},
                            "visual_scene": {"type": "string"}
                        },
                        "required": ["caption", "visual_scene"]
                    },
                    "minItems": 4,
                    "maxItems": 4
                }
            },
            "required": ["caption", "slides"]
        }
        
        text_result = await text_provider.generate(story_prompt, schema=content_schema)
        slides_data = text_result.get("slides", [])[:4]
        
        generated_content = {
            "caption": text_result.get("caption", ""),
            "slides": slides_data
        }
        
        # Update status to generating images
        await entities_collection.update_one(
            {"_id": ObjectId(posting_id)},
            {
                "$set": {
                    "data.status": PostCreationStatus.GENERATING_IMAGES,
                    "data.content": generated_content["caption"],
                    "data.generated_content": generated_content,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Broadcast status update via SSE
        await sse_manager.broadcast(
            f"post:{posting_id}",
            "status_update",
            {"status": PostCreationStatus.GENERATING_IMAGES, "message": "Generating images...", "content": generated_content}
        )
        await sse_manager.broadcast(
            f"influencer:{influencer_id}",
            "post_update",
            {"post_id": posting_id, "status": PostCreationStatus.GENERATING_IMAGES}
        )
        
        # Prepare avatar as reference image
        from backend.ai.interfaces import ReferenceImage
        import httpx
        import base64
        from PIL import Image as PILImage
        from io import BytesIO as IOBytesIO
        
        reference_images_list = []
        
        avatar_url = influencer_data.get("avatarUrl", "") or reference_image_url
        if not avatar_url:
            raise Exception("Influencer must have an avatar image for character consistency")
        
        print(f"[PostGeneration] Fetching avatar: {avatar_url}")
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(avatar_url)
            if response.status_code != 200:
                raise Exception(f"Failed to fetch avatar: HTTP {response.status_code}")
            
            # Resize and encode avatar
            image_bytes = response.content
            img = PILImage.open(IOBytesIO(image_bytes))
            
            max_size = 768
            ratio = min(max_size / img.width, max_size / img.height)
            if ratio < 1:
                new_size = (int(img.width * ratio), int(img.height * ratio))
                img = img.resize(new_size, PILImage.Resampling.LANCZOS)
            
            buffer = IOBytesIO()
            img.convert('RGB').save(buffer, format='JPEG', quality=90)
            resized_bytes = buffer.getvalue()
            
            encoded = base64.b64encode(resized_bytes).decode('utf-8')
            reference_image_b64 = f"data:image/jpeg;base64,{encoded}"
            
            ref_img = ReferenceImage(
                image_data=reference_image_b64,
                label="[1]",
                role="character",
                description=f"Main character: {name} - keep the character consistent but in different outfits, settings, and poses as described in the visual_scene for each slide"
            )
            reference_images_list.append(ref_img)
        
        # Process additional reference images
        if reference_images:
            print(f"[PostGeneration] Processing {len(reference_images)} additional references")
            for i, ref in enumerate(reference_images):
                try:
                    url = ref.get("url")
                    if not url: continue
                    
                    # Handle base64 data URIs directly
                    if url.startswith("data:"):
                        ref_data = url
                    else:
                        # Fetch URL
                        async with httpx.AsyncClient(timeout=30.0) as client:
                            resp = await client.get(url)
                            if resp.status_code == 200:
                                # Encode
                                encoded = base64.b64encode(resp.content).decode('utf-8')
                                ref_data = f"data:image/jpeg;base64,{encoded}"
                            else:
                                print(f"Failed to fetch reference image: {url}")
                                continue
                                
                    # Create reference object
                    # Start labels from [2] since avatar is [1]
                    label = f"[{i + 2}]"
                    ref_obj = ReferenceImage(
                        image_data=ref_data,
                        label=label,
                        role=ref.get("role", "object"),
                        description=ref.get("description", "Reference object")
                    )
                    reference_images_list.append(ref_obj)
                    print(f"Added reference {label}: {ref.get('description')}")
                    
                except Exception as e:
                    print(f"Error processing reference image {i}: {e}")
        
        # Generate 2x2 grid image
        image_provider = get_image_provider()
        
        image_prompt = (
            f"Create a 2x2 grid of four ULTRA-REALISTIC, HIGH-RESOLUTION SMARTPHONE photos telling a story.\n\n"
            f"GRID LAYOUT: TOP ROW: Panel 1 (left) → Panel 2 (right), BOTTOM ROW: Panel 3 (left) → Panel 4 (right)\n\n"
            f"PHOTOGRAPHY STYLE: Generate professional-quality UCG photos with sharp focus, high detail, proper lighting, and photorealistic textures that look like they were shot on a modern iPhone. "
            f"Avoid blur, soft focus, or artificial-looking elements. Each panel should have crystal-clear details and natural appearance."
        )
        
        # Add instructions for additional references
        if len(reference_images_list) > 1:
             image_prompt += "REFERENCE USAGE:\n"
             for ref in reference_images_list[1:]:
                 image_prompt += f"- Use Image {ref.label} ({ref.role}) as: {ref.description}\n"
             image_prompt += "\n"
        
        panel_positions = ["TOP-LEFT", "TOP-RIGHT", "BOTTOM-LEFT", "BOTTOM-RIGHT"]
        for idx, slide in enumerate(slides_data):
            image_prompt += f"Panel {idx + 1} ({panel_positions[idx]}): Same character from image [1], {slide['visual_scene']} "
        
        print(f"[PostGeneration] Generating grid image")
        
        image_result = await image_provider.generate_image(
            prompt=image_prompt,
            reference_images=reference_images_list
        )
        
        if not image_result or "url" not in image_result:
            raise Exception("Image generation failed")
        
        # Download and split the grid
        image_url = image_result["url"]
        async with httpx.AsyncClient() as client:
            resp = await client.get(image_url)
            resp.raise_for_status()
            image_bytes = resp.content
        
        # Split into 4 quadrants and upload
        r2 = get_r2_utils()
        final_urls = []
        
        if r2:
            img = Image.open(BytesIO(image_bytes))
            width, height = img.size
            mid_x = width // 2
            mid_y = height // 2
            
            quadrants = [
                (0, 0, mid_x, mid_y),
                (mid_x, 0, width, mid_y),
                (0, mid_y, mid_x, height),
                (mid_x, mid_y, width, height)
            ]
            
            for i, box in enumerate(quadrants):
                crop = img.crop(box)
                buf = BytesIO()
                crop.save(buf, format="JPEG", quality=90)
                buf.seek(0)
                
                filename = f"posts/{posting_id}_{i}_{uuid.uuid4()}.jpg"
                url = r2.upload_file_to_r2(filename, buf.getvalue(), content_type="image/jpeg")
                final_urls.append(url)

            # Upload the original grid image as well
            grid_filename = f"posts/{posting_id}_grid_{uuid.uuid4()}.jpg"
            img.seek(0)
            # Re-save to buffer to ensure we have the bytes
            grid_buf = BytesIO()
            img.save(grid_buf, format="JPEG", quality=90)
            grid_buf.seek(0)
            grid_image_url = r2.upload_file_to_r2(grid_filename, grid_buf.getvalue(), content_type="image/jpeg")
        else:
            # Local fallback
            from backend.image_utils import split_grid_image_from_bytes
            final_urls = split_grid_image_from_bytes(image_bytes)
        
        # Create image_slides for backward compatibility
        image_slides = [
            {
                "imageUrl": final_urls[i],
                "caption": slides_data[i]["caption"]
            }
            for i in range(len(final_urls))
        ]
        
        # Update posting to ready status
        await entities_collection.update_one(
            {"_id": ObjectId(posting_id)},
            {
                "$set": {
                    "data.status": PostCreationStatus.READY,
                    "data.image_urls": final_urls,
                    "data.image_slides": image_slides,
                    "data.grid_image_url": grid_image_url if 'grid_image_url' in locals() else None,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        print(f"[PostGeneration] Post {posting_id} completed with {len(final_urls)} images")
        
        # Broadcast success via SSE
        await sse_manager.broadcast(
            f"post:{posting_id}",
            "status_update",
            {
                "status": PostCreationStatus.READY,
                "image_urls": final_urls,
                "image_slides": image_slides,
                "message": "Post ready!"
            }
        )
        await sse_manager.broadcast(
            f"influencer:{influencer_id}",
            "post_update",
            {"post_id": posting_id, "status": PostCreationStatus.READY, "image_urls": final_urls, "image_slides": image_slides}
        )

    except Exception as e:
        print(f"[PostGeneration] Failed: {e}")
        import traceback
        traceback.print_exc()
        
        await entities_collection.update_one(
            {"_id": ObjectId(posting_id)},
            {
                "$set": {
                    "data.status": PostCreationStatus.FAILED,
                    "data.error": str(e),
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Broadcast failure via SSE
        await sse_manager.broadcast(
            f"post:{posting_id}",
            "status_update",
            {"status": PostCreationStatus.FAILED, "error": str(e), "message": "Post generation failed"}
        )
        await sse_manager.broadcast(
            f"influencer:{influencer_id}",
            "post_update",
            {"post_id": posting_id, "status": PostCreationStatus.FAILED, "error": str(e)}
        )


async def generate_videos_background(posting_id: str, influencer_id: str, duration: int = 5, aspect_ratio: str = "9:16"):
    """Background task to generate videos from post slides using 2x2 grid method."""
    try:
        # Get post details
        post = await entities_collection.find_one({"_id": ObjectId(posting_id), "kind": "posting"})
        if not post:
            raise Exception("Post not found")
        
        post_data = post["data"]
        image_slides = post_data.get("image_slides", [])
        
        if len(image_slides) != 4:
            raise Exception(f"Post must have exactly 4 slides, found {len(image_slides)}")
        
        # Update status to processing
        await entities_collection.update_one(
            {"_id": ObjectId(posting_id)},
            {"$set": {"data.status": PostCreationStatus.GENERATING_VIDEO, "updated_at": datetime.utcnow()}}
        )
        
        # Broadcast grid creation status
        await sse_manager.broadcast(
            f"post:{posting_id}",
            "status_update",
            {"status": PostCreationStatus.GENERATING_VIDEO, "stage": "creating_grid", "message": "Preparing video grid..."}
        )
        
        # Also broadcast to influencer channel so feed updates
        await sse_manager.broadcast(
            f"influencer:{influencer_id}",
            "post_update",
            {"post_id": posting_id, "status": PostCreationStatus.GENERATING_VIDEO}
        )

        grid_url = ""
        
        # Check if we already have a grid image saved
        existing_grid_url = post_data.get("grid_image_url")
        
        if existing_grid_url:
            print(f"[VideoGeneration] Using existing grid image: {existing_grid_url}")
            grid_url = existing_grid_url
        else:
            # Fallback for old posts: Download slides and recreate grid
            await sse_manager.broadcast(
                f"post:{posting_id}",
                "status_update",
                {"status": PostCreationStatus.GENERATING_VIDEO, "stage": "downloading_images", "message": "Downloading slide images..."}
            )
            
            # Step 1: Download all 4 slide images
            slide_images = []
            async with httpx.AsyncClient(timeout=30.0) as client:
                for idx, slide in enumerate(image_slides):
                    response = await client.get(slide['imageUrl'])
                    if response.status_code == 200:
                        img = Image.open(BytesIO(response.content))
                        slide_images.append(img)
                        print(f"[VideoGeneration] Downloaded slide {idx + 1}: {img.size}")
                    else:
                        raise Exception(f"Failed to download slide {idx + 1}")
            
            # Step 2: Create 2x2 grid image with dynamic aspect ratio
            if aspect_ratio == "9:16":
                GRID_WIDTH = 1080    # Portrait: 9:16
                GRID_HEIGHT = 1920
            else:  # Default to "16:9"
                GRID_WIDTH = 1920    # Landscape: 16:9
                GRID_HEIGHT = 1080
            
            PANEL_WIDTH = GRID_WIDTH // 2
            PANEL_HEIGHT = GRID_HEIGHT // 2
            
            print(f"[VideoGeneration] Using aspect ratio {aspect_ratio}: Grid {GRID_WIDTH}x{GRID_HEIGHT}, Panels {PANEL_WIDTH}x{PANEL_HEIGHT}")
            
            # Import the universal fit utility
            from backend.image_utils import fit_image_to_panel
            
            # Fit each image to panel WITHOUT cropping (contain mode with blurred background)
            resized_panels = []
            for idx, img in enumerate(slide_images):
                fitted = fit_image_to_panel(
                    image=img,
                    target_width=PANEL_WIDTH,
                    target_height=PANEL_HEIGHT,
                    fit_mode="contain",  # NO CROPPING - fits entire image inside
                    background_color=(0, 0, 0),
                    background_style="blur"  # Blurred background for professional look
                )
                resized_panels.append(fitted)
                print(f"[VideoGeneration] Fitted slide {idx + 1}: {img.size} -> {fitted.size} (no cropping)")
            
            # Create grid with calculated dimensions
            grid_img = Image.new('RGB', (GRID_WIDTH, GRID_HEIGHT))
            grid_img.paste(resized_panels[0], (0, 0))                          # Top-left
            grid_img.paste(resized_panels[1], (PANEL_WIDTH, 0))                # Top-right
            grid_img.paste(resized_panels[2], (0, PANEL_HEIGHT))               # Bottom-left
            grid_img.paste(resized_panels[3], (PANEL_WIDTH, PANEL_HEIGHT))     # Bottom-right
            
            # Convert grid image to data URI for AI provider
            grid_buffer = BytesIO()
            grid_img.save(grid_buffer, format='PNG')
            grid_buffer.seek(0)
            grid_bytes = grid_buffer.getvalue()
            
            grid_b64 = base64.b64encode(grid_bytes).decode('utf-8')
            grid_url = f"data:image/png;base64,{grid_b64}"
            
            print(f"[VideoGeneration] Created 2x2 grid image: {grid_img.size}")
        
        # Broadcast video generation status
        await sse_manager.broadcast(
            f"post:{posting_id}",
            "status_update",
            {"status": PostCreationStatus.GENERATING_VIDEO, "stage": "generating_video", "message": "Generating video (this may take 30-60 seconds)..."}
        )
        
        # Step 3: Generate 2x2 grid video
        combined_prompt = (
            "Animate this 2x2 grid image. Keep all 4 panels in their positions. "
            "Add subtle, natural motion to each panel: breathing, blinking, gentle movements. "
            "Maintain the exact scene composition and character appearance in each quadrant. "
            "The motion should feel like a social media story coming to life."
        )
        
        print(f"[VideoGeneration] Generating 2x2 grid video...")
        
        video_provider = get_video_provider()
        
        # Check if provider supports video generation
        if not hasattr(video_provider, 'generate_video'):
            raise Exception("Video generation not supported by current AI provider")
        
        try:
            video_result = await video_provider.generate_video(
                prompt=combined_prompt,
                image_url=grid_url,
                duration=duration,
                aspect_ratio=aspect_ratio
            )
            
            grid_video_url = video_result.get('url') if isinstance(video_result, dict) else video_result
            
            if not grid_video_url:
                raise Exception("No video URL returned from provider")
            
            print(f"[VideoGeneration] Generated 2x2 grid video: {grid_video_url[:80]}...")
            
        except Exception as e:
            print(f"[VideoGeneration] Error generating grid video: {e}")
            raise Exception(f"Video generation failed: {str(e)}")
        
        # Broadcast splitting status
        await sse_manager.broadcast(
            f"post:{posting_id}",
            "status_update",
            {"status": PostCreationStatus.GENERATING_VIDEO, "stage": "splitting_video", "message": "Splitting video into clips..."}
        )
        
        # Step 4: Split the 2x2 grid video into 4 separate videos
        print(f"[VideoGeneration] Splitting 2x2 grid video into 4 clips...")
        
        try:
            from backend.image_utils import split_2x2_grid_video
            
            # Get R2 utils for uploading split videos
            r2_utils = get_r2_utils()
            split_video_urls = split_2x2_grid_video(grid_video_url, r2_utils=r2_utils)
            
            print(f"[VideoGeneration] Split into {len(split_video_urls)} video clips")
            
        except Exception as e:
            print(f"[VideoGeneration] Error splitting video: {e}")
            raise Exception(f"Video splitting failed: {str(e)}")
        
        # Step 5: Build video URLs array
        video_urls = []
        for idx, video_url in enumerate(split_video_urls):
            video_urls.append({
                "slideIndex": idx,
                "videoUrl": video_url,
                "imageUrl": image_slides[idx]['imageUrl'],
                "caption": image_slides[idx]['caption']
            })
        
        # Step 6: Update post with video URLs
        await entities_collection.update_one(
            {"_id": ObjectId(posting_id)},
            {
                "$set": {
                    "data.videoUrls": video_urls,
                    "data.status": PostCreationStatus.VIDEO_READY,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        print(f"[VideoGeneration] Post {posting_id} completed with {len(video_urls)} videos")
        
        # Broadcast success via SSE
        await sse_manager.broadcast(
            f"post:{posting_id}",
            "status_update",
            {
                "status": PostCreationStatus.VIDEO_READY,
                "videoUrls": video_urls,
                "message": "Videos ready!"
            }
        )
        await sse_manager.broadcast(
            f"influencer:{influencer_id}",
            "post_update",
            {"post_id": posting_id, "status": PostCreationStatus.VIDEO_READY, "videoUrls": video_urls}
        )
        
    except Exception as e:
        print(f"[VideoGeneration] Failed: {e}")
        import traceback
        traceback.print_exc()
        
        await entities_collection.update_one(
            {"_id": ObjectId(posting_id)},
            {
                "$set": {
                    "data.status": PostCreationStatus.VIDEO_FAILED,
                    "data.error": str(e),
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Broadcast failure via SSE
        await sse_manager.broadcast(
            f"post:{posting_id}",
            "status_update",
            {"status": PostCreationStatus.VIDEO_FAILED, "error": str(e), "message": "Video generation failed"}
        )
        await sse_manager.broadcast(
            f"influencer:{influencer_id}",
            "post_update",
            {"post_id": posting_id, "status": PostCreationStatus.VIDEO_FAILED, "error": str(e)}
        )


@router.post("/create", response_description="Create new post with AI generation")
async def create_post(
    request: PostingCreateRequest,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user)
):
    """Create a new post and start AI generation in background."""
    posting_data = {
        "influencer_id": request.influencer_id,
        "content": "",
        "status": PostCreationStatus.PENDING,
        "prompt": request.prompt,
        "platform": request.platform,
        "platform": request.platform,
        "reference_image_url": request.reference_image_url,
        "reference_images": request.reference_images,
        "generated_content": None,
        "image_urls": [],
        "image_slides": []
    }
    
    new_entity = {
        "kind": "posting",
        "data": posting_data,
        "owner_id": user_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await entities_collection.insert_one(new_entity)
    posting_id = str(result.inserted_id)
    
    print(f"[PostCreation] Created post {posting_id} for influencer {request.influencer_id}")
    
    # Broadcast initial status via SSE
    print(f"[PostCreation] Broadcasting PENDING status to influencer:{request.influencer_id}")
    await sse_manager.broadcast(
        f"influencer:{request.influencer_id}",
        "post_update",
        {"post_id": posting_id, "status": PostCreationStatus.PENDING, "message": "Post created"}
    )
    print(f"[PostCreation] Broadcast complete")
    
    # Start background generation
    background_tasks.add_task(
        generate_post_content,
        posting_id,
        request.influencer_id,
        request.prompt,
        request.reference_image_url,
        request.reference_images
    )
    
    new_entity["_id"] = result.inserted_id
    return ResponseModel(entity_helper(new_entity), "Post created and generation started")


@router.post("/{posting_id}/generate-videos", response_description="Generate videos for post")
async def generate_videos(
    posting_id: str,
    background_tasks: BackgroundTasks,
    duration: int = 5,
    aspect_ratio: str = "9:16",
    user_id: str = Depends(get_current_user)
):
    """Generate videos for an existing post using 2x2 grid method. Non-blocking with SSE updates."""
    
    # Validate post exists and belongs to user
    post = await entities_collection.find_one({
        "_id": ObjectId(posting_id),
        "kind": "posting",
        "owner_id": user_id
    })
    
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    
    post_data = post["data"]
    image_slides = post_data.get("image_slides", [])
    
    # Validate post has 4 slides
    if len(image_slides) != 4:
        raise HTTPException(
            status_code=400, 
            detail=f"Post must have exactly 4 slides for video generation, found {len(image_slides)}"
        )
    
    # Check if post is ready (not still being generated)
    if post_data.get("status") not in [PostCreationStatus.READY]:
        raise HTTPException(
            status_code=400,
            detail=f"Post must be ready before generating videos. Current status: {post_data.get('status')}"
        )
    
    # Check if already generating
    if post_data.get("videoStatus") == "processing":
        raise HTTPException(
            status_code=409,
            detail="Video generation already in progress for this post"
        )
    
    influencer_id = post_data.get("influencer_id")
    
    # Set initial status to pending
    await entities_collection.update_one(
        {"_id": ObjectId(posting_id)},
        {"$set": {"data.videoStatus": "pending", "updated_at": datetime.utcnow()}}
    )
    
    print(f"[VideoGeneration] Starting video generation for post {posting_id}")
    
    # Broadcast initial status via SSE
    await sse_manager.broadcast(
        f"post:{posting_id}",
        "video_status",
        {"status": "pending", "message": "Video generation queued"}
    )
    
    # Start background generation
    background_tasks.add_task(
        generate_videos_background,
        posting_id,
        influencer_id,
        duration,
        aspect_ratio
    )
    
    return ResponseModel(
        {"post_id": posting_id, "videoStatus": "pending"},
        "Video generation started"
    )


@router.post("/", response_description="Add new posting (manual)")
async def add_posting(user_id: str = Depends(get_current_user), posting: dict = Body(...)):
    """Create a manual posting without AI generation."""
    posting_data = posting.copy()
    if "status" not in posting_data:
        posting_data["status"] = PostCreationStatus.PUBLISHED
        
    new_entity = {
        "kind": "posting",
        "data": posting_data,
        "owner_id": user_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    inserted = await entities_collection.insert_one(new_entity)
    new_posting = await entities_collection.find_one({"_id": inserted.inserted_id})
    return ResponseModel(entity_helper(new_posting), "Posting added successfully")


@router.get("/influencer/{influencer_id}", response_description="List all postings for influencer")
async def get_postings(influencer_id: str, user_id: str = Depends(get_current_user)):
    """Get all postings for an influencer, sorted by most recent."""
    postings = []
    async for posting in entities_collection.find(
        {"kind": "posting", "data.influencer_id": influencer_id, "owner_id": user_id}
    ).sort("created_at", -1):
        postings.append(entity_helper(posting))
    return ResponseModel(postings, "Postings retrieved successfully")


@router.get("/{posting_id}", response_description="Get posting by ID")
async def get_posting(posting_id: str, user_id: str = Depends(get_current_user)):
    """Get a single posting with its current status."""
    posting = await entities_collection.find_one({
        "_id": ObjectId(posting_id),
        "kind": "posting",
        "owner_id": user_id
    })
    
    if not posting:
        raise HTTPException(status_code=404, detail="Posting not found")
    
    return ResponseModel(entity_helper(posting), "Posting retrieved successfully")


@router.delete("/{posting_id}", response_description="Delete posting")
async def delete_posting(posting_id: str, user_id: str = Depends(get_current_user)):
    """Delete a posting."""
    result = await entities_collection.delete_one({
        "_id": ObjectId(posting_id),
        "kind": "posting",
        "owner_id": user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Posting not found")
    
    return ResponseModel(None, "Posting deleted successfully")


@router.post("/generate")
async def generate_posting(influencer_id: str, prompt: str, user_id: str = Depends(get_current_user)):
    """Deprecated: Use /create endpoint instead."""
    raise HTTPException(status_code=410, detail="This endpoint is deprecated. Use POST /postings/create instead")
