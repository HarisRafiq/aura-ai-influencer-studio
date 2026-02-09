import os
import io
import json
import base64
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from google.genai import types 
from backend.models import EntitySchema
from backend.r2_utils import R2Utils
from backend.ai.factory import get_text_provider, get_image_provider, get_r2_utils
from backend.ai.interfaces import ReferenceImage
from backend.cache_service import cache_service
from backend.database import collection
from bson.objectid import ObjectId
from dotenv import load_dotenv

load_dotenv()

router = APIRouter()

def clean_json_string(s: str) -> str:
    return s.replace("```json\n", "").replace("\n```", "").replace("```", "").strip()

class GeneratePersonaRequest(BaseModel):
    category: str = Field(..., alias="vibe")
    gender: Optional[str] = None
    age_range: Optional[str] = None
    ethnicity: Optional[str] = None
    location: Optional[str] = None
    # Support traits passed from image selection
    visualDescription: Optional[str] = None 
    name: Optional[str] = None

    class Config:
        allow_population_by_field_name = True

class InitiateCreationRequest(BaseModel):
    category: str = Field(..., alias="vibe")
    location: Optional[str] = None

    class Config:
        allow_population_by_field_name = True

class AvatarOption(BaseModel):
    imageUrl: str
    gender: str
    age_range: str
    ethnicity: str
    visualSummary: str
    # You might want to pass more diverse traits here to seed the persona generation later

class InitiateCreationResponse(BaseModel):
    options: List[AvatarOption]


class GenerateAvatarOptionsRequest(BaseModel):
    visualDescription: str

# DEPRECATED - No longer used
# class GenerateImageRequest(BaseModel):
#     prompt: str
#     reference_image: Optional[str] = Field(None, alias="referenceImage")

# DEPRECATED - No longer used
# class GenerateContentRequest(BaseModel):
#     entity: EntitySchema
#     topic: str
#     referenceImage: Optional[str] = None

class EntityContextRequest(BaseModel):
    entity: EntitySchema

class CurrentNewsRequest(BaseModel):
    entity: EntitySchema
    scope: str = 'local'

class GeocodeRequest(BaseModel):
    locations: List[str]

# DEPRECATED - No longer used, use DirectorModal flow instead
# class StorySetupRequest(BaseModel):
#     entity: EntitySchema
#     topic: str

class StoryGenerateRequest(BaseModel):
    entity: EntitySchema
    topic: str
    setup_context: str
    choice: str
    reference_images: Optional[List[dict]] = None  # Future: [{"image_url": "...", "role": "product", "description": "..."}, ...]

class LocationPOIsRequest(BaseModel):
    location: str  # e.g., "New York City, USA"
    radius: int = 1500  # meters

# Routes

@router.post("/location-pois")
async def get_location_pois(req: LocationPOIsRequest):
    """
    Fetches ALL points of interest for a location using Google Places API.
    Returns POIs with photos, ratings, and coordinates. Results are cached.
    """
    from .places_service import get_places_service
    
    try:
        # 1. Check cache first
        cached = await cache_service.get_location_pois(req.location)
        if cached:
            print(f"[POI Cache HIT] Location: {req.location}")
            return cached
        
        print(f"[POI Cache MISS] Fetching POIs via Places API for: {req.location}")
        
        # 2. Use Places API to fetch POIs with photos
        places_service = get_places_service()
        result = await places_service.get_all_pois(req.location, req.radius)
        
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        
        # 3. Cache the result
        await cache_service.set_location_pois(req.location, result)
        print(f"[POI Cache SET] Cached {len(result.get('pois', []))} POIs for {req.location}")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/geocode")
async def geocode(req: GeocodeRequest):
    try:
        if not req.locations: return []
        unique = list(set([loc for loc in req.locations if loc]))
        
        prompt = f"""
            I need the approximate geographic coordinates for the following locations:
            {", ".join(unique)}
            
            Return a valid JSON array of objects with location, lat, lng.
        """
        
        provider = get_text_provider()
        response = await provider.generate(
            prompt=prompt,
            schema={
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "location": {"type": "STRING"},
                        "lat": {"type": "NUMBER"},
                        "lng": {"type": "NUMBER"}
                    },
                    "required": ["location", "lat", "lng"]
                }
            }
        )
        return response
    except Exception as e:
        print(f"Geocoding error: {e}")
        return []


@router.post("/generate-persona", response_model=EntitySchema)
async def generate_persona(req: GeneratePersonaRequest):
    try:
        # Build prompt with optional constraints
        constraints = []
        if req.gender: constraints.append(f"Gender: {req.gender}")
        if req.age_range: constraints.append(f"Age Range: {req.age_range}")
        if req.ethnicity: constraints.append(f"Ethnicity: {req.ethnicity}")
        if req.location: 
            constraints.append(f"Location: {req.location} (use this EXACT location)")
        
        constraints_text = "\n".join(constraints) if constraints else "No specific constraints"
        
        # If location is provided, emphasize it heavily in the prompt
        location_instruction = ""
        if req.location:
            location_instruction = f"\n\nIMPORTANT: The influencer MUST be based in {req.location}. Use this exact location string in the 'location' field. Also provide the correct IANA timezone for this location."
        
        prompt = f"""
          Create a detailed persona for a digital social media influencer who is a "{req.category}".
          
          Specific Constraints (Must Follow):
          {constraints_text}{location_instruction}
          
          The output must be a valid JSON object.
          
          Fields required:
          - name: Creative name.
          - handle: Social media handle (e.g. @name).
          - niche: A one-word label for their area of influence (e.g. "Fitness", "Tech", "Fashion", "AI", "Gaming").
          - bio: Short, punchy bio (max 150 chars).
          - traits: Array of 3-4 personality adjectives.
          - visualDescription: Detailed physical appearance and aesthetic description only. Do NOT format as a specific scene/action. Example: "A 20-year-old skater boy with messy blonde hair, wearing oversized hoodies, retro VHS aesthetic, warm skin tone". This will be used to generate them in various situations.
          - platformFocus: The main platform they use (instagram, twitter, or linkedin).
          - location: {f'MUST be exactly "{req.location}"' if req.location else 'A specific, real city and country that fits their vibe (e.g. "Tokyo, Japan", "Berlin, Germany", "Los Angeles, USA")'}.
          - timezone: The IANA timezone string for that location (e.g. "Asia/Tokyo", "Europe/Berlin").
          
          Ensure all these fields are present in the JSON.
        """

        provider = get_text_provider()
        data = await provider.generate(prompt=prompt)
        
        return EntitySchema(kind="influencer", data=data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/initiate-creation", response_model=InitiateCreationResponse)
async def initiate_creation(req: InitiateCreationRequest):
    try:
        from backend.image_utils import split_grid_image
        
        # 1. Generate 4 Diverse Concept Options using LLM
        location_context = f" based in {req.location}" if req.location else ""
        concept_prompt = f"""
        Generate 4 distinct character concepts for a digital influencer who specializes as a "{req.category}"{location_context}.
        Ensure high diversity in gender, ethnicity, and style.
        The characters should feel like professional or aspiring "{req.category}" influencers authentic to the location "{req.location if req.location else 'their environment'}".
        
        Return JSON array of 4 objects:
        - gender: e.g. Female, Male, Non-binary
        - age_range: e.g. 20-25
        - ethnicity: e.g. Korean, Black, White, Latino
        - visualSummary: A concise visual description of this specific character's appearance (face, hair, style). Max 20 words.
        """
        
        text_provider = get_text_provider()
        concepts_response = await text_provider.generate(
            prompt=concept_prompt,
            schema={
                "type": "ARRAY",
                "items": {
                    "type": "OBJECT",
                    "properties": {
                        "gender": {"type": "STRING"},
                        "age_range": {"type": "STRING"},
                        "ethnicity": {"type": "STRING"},
                        "visualSummary": {"type": "STRING"}
                    },
                    "required": ["gender", "age_range", "ethnicity", "visualSummary"]
                }
            }
        )
        
        concepts = []
        if isinstance(concepts_response, list):
             concepts = concepts_response
        else:
             # Fallback if structure is weird, though generate usually handles it
             concepts = [{"visualSummary": req.vibe, "gender": "Any", "age_range": "Any", "ethnicity": "Any"}] * 4
             
        # Ensure we have 4 concepts
        if len(concepts) < 4:
            concepts = (concepts * 4)[:4]

        # 2. Generate Grid Image
        # Construct a composed prompt
        location_str = f" in {req.location}" if req.location else ""
        grid_prompt = (
            f"Split into a 2x2 grid. Four REALISTIC SMARTPHONE photos of digital influencers who are experts in: {req.category}{location_str}. "
            f"Show them in environments relevant to being a {req.category}. "
            "Style: Shot on iPhone, flash photography, candid, grainy, amateur composition, social media quality. "
            "Distinct characters in each panel:\n"
        )
        for idx, c in enumerate(concepts):
            grid_prompt += f"Panel {idx+1}: {c['gender']}, {c['ethnicity']}, {c['visualSummary']}. "
        
        image_provider = get_image_provider()
        grid_image_result = await image_provider.generate_image(prompt=grid_prompt)
        grid_image_url = grid_image_result.get('url') if isinstance(grid_image_result, dict) else grid_image_result

        if not grid_image_url:
             raise Exception("Failed to generate grid image")
             
        # 3. Split using helper
        image_urls = split_grid_image(grid_image_url)
        
        # 4. Map back to options
        options = []
        for i, url in enumerate(image_urls):
            if i >= len(concepts): break
            c = concepts[i]
            options.append(AvatarOption(
                imageUrl=url,
                gender=c.get('gender', 'Any'),
                age_range=c.get('age_range', 'Any'),
                ethnicity=c.get('ethnicity', 'Any'),
                visualSummary=c.get('visualSummary', '')
            ))
            
        return InitiateCreationResponse(options=options)

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# DEPRECATED: Use DirectorModal with /director/start and /director/turn instead
# @router.post("/generate-image")
# async def generate_image(req: GenerateImageRequest):

# DEPRECATED: Use DirectorModal with /director/start and /director/turn instead  
# @router.post("/generate-post-content")
# async def generate_post_content(req: GenerateContentRequest):

@router.post("/trending-ideas")
async def get_trending_ideas(req: EntityContextRequest):
    try:
        data = req.entity.data
        traits = data.get("traits", [])
        if isinstance(traits, list): traits = ", ".join(traits)

        prompt = f"""
            Generate 5 trending post ideas for influencer:
            Name: {data.get('name')}
            Bio: {data.get('bio')}
            Traits: {traits}
            Platform: {data.get('platformFocus')}
            
            Return a valid JSON array of strings.
        """
        
        provider = get_text_provider()
        response = await provider.generate(
            prompt=prompt,
            schema={"type": "ARRAY", "items": {"type": "STRING"}}
        )
        return response
    except Exception:
        return []

@router.post("/current-news")
async def current_news(req: CurrentNewsRequest):
    try:
        data = req.entity.data
        context = f"in {data.get('location')}" if req.scope == 'local' else "globally"
        traits = data.get("traits", [])
        if isinstance(traits, list): traits = ", ".join(traits)

        location = data.get('location')
        niche = data.get('niche') or (traits.split(",")[0] if traits else "General")
        cache_key_type = f"news_{req.scope}" # Distinguish between local and global news
        
        # Check cache
        cached = await cache_service.get_content(location, niche, cache_key_type)
        if cached:
            return cached

        prompt = f"""
            Find 4 trending news stories RIGHT NOW {context} relevant to a {traits} influencer.
            Output JSON array of objects with title, source, summary, url.
        """
        
        provider = get_text_provider()
        response = await provider.generate(
            prompt=prompt,
            tools=[types.Tool(google_search=types.GoogleSearchRetrieval)],
            return_raw=True
        )
        
        text = clean_json_string(response.text or "[]")
        news = []
        try:
             news = json.loads(text)
        except: pass

        sources = []
        if response.candidates and response.candidates[0].grounding_metadata and response.candidates[0].grounding_metadata.grounding_chunks:
             for chunk in response.candidates[0].grounding_metadata.grounding_chunks:
                if chunk.web:
                    sources.append({"title": chunk.web.title, "uri": chunk.web.uri})

        unique_sources = list({s['uri']: s for s in sources}.values())
        result = {"news": news, "sources": unique_sources}
        
        # Update cache
        await cache_service.set_content(location, niche, cache_key_type, result)
        
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    r2 = get_r2_utils()
    if not r2:
        raise HTTPException(status_code=503, detail="Storage service unavailable")
    try:
        import uuid
        ext = file.filename.split('.')[-1] if '.' in file.filename else 'bin'
        filename = f"uploads/{uuid.uuid4()}.{ext}"
        content = await file.read()
        url = r2.upload_file_to_r2(filename, content, content_type=file.content_type)
        return {"url": url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# DEPRECATED: Use DirectorModal with /director/start and /director/turn then /story-generate instead
# @router.post("/story-setup")
# async def story_setup(req: StorySetupRequest):

@router.post("/story-generate")
async def story_generate(req: StoryGenerateRequest):
    try:
        data = req.entity.data
        
        # Check if event beats are available (from Event Orchestrator)
        event_beats = getattr(req, 'event_beats', None)
        
        if event_beats and len(event_beats) >= 4:
            # Use Event Orchestrator beats for structured story generation
            print(f"[Story Gen] Using {len(event_beats)} event beats for structured generation")
            
            beats_section = "\n".join([
                f"Panel {i+1} - {b['scene'].upper()} ({b['mood']}): {b['visual_prompts'][0]}"
                for i, b in enumerate(event_beats[:4])
            ])
            
            prompt = f"""
            Act as a Creative Director for influencer "{data.get('name')}".
            
            STORY BEATS (follow this exact narrative arc):
            {beats_section}
            
            ENVIRONMENT & CONTEXT:
            {req.setup_context}
            
            INFLUENCER PERSONA:
            {data.get('bio')}
            
            TASK:
            Generate 4 visual chapters following the EXACT story beats above.
            Each chapter corresponds to one beat - maintain the scene, mood, and visual direction specified.

            Output JSON array of 4 objects (one for each beat):
            - caption: Short storytelling caption matching the beat's mood.
                - Style: Authentic, first-person POV, casual, "content creator" voice. 
                - Format: Lowercase/casual grammar is okay. Emojis.
            - visual_scene: Detailed description for image generation.
                - FOLLOW the visual direction from the story beat
                - aesthetic: REALISTIC, SMARTPHONE PHOTOGRAPHY.
                - keywords: "shot on iPhone", "flash photography", "candid", "grainy", "imperfect framing", "social media story".
                - DESCRIBE: What they're wearing, where they are, what they're doing.
                - DO NOT describe facial features, hair color, or body type - those come from the reference image.
            """
        else:
            # Fallback to original prompt (for backwards compatibility)
            print(f"[Story Gen] No event beats, using creative brief approach")
            
            prompt = f"""
            Act as a Creative Director for influencer "{data.get('name')}".
            
            CREATIVE BRIEF AND PLOT:
            {req.topic}
            
            ENVIRONMENT & CONTEXT:
            {req.setup_context}
            
            INFLUENCER PERSONA:
            {data.get('bio')}
            
            TASK:
            Generate 4 distinct visual chapters based STRICTLY on the CREATIVE BRIEF above.
            Each chapter must advance the plot described in the brief.

            Output JSON array of 4 objects (one for each chapter):
            - caption: Short storytelling caption. 
                - Style: Authentic, first-person POV, casual, "content creator" voice. 
                - Format: Lowercase/casual grammar is okay. Emojis.
            - visual_scene: Detailed description for image generation.
                - MUST include the specific lighting and weather from Context ({req.setup_context}).
                - MUST include specific visual details from the Creative Brief (props, outfit, mood).
                - aesthetic: REALISTIC, SMARTPHONE PHOTOGRAPHY.
                - keywords: "shot on iPhone", "flash photography", "candid", "grainy", "imperfect framing", "social media story".
                - IMPORTANT: Describe outfit, setting/background, lighting, pose, and mood for each panel.
                - OUTFIT CONSISTENCY: Decide based on story context:
                  * If it's a single continuous moment/location (e.g., "gym session"), keep the SAME outfit across panels
                  * IF the Brief mentions an outfit change, describe it. Otherwise assume consistent outfit.
                  * Be explicit: say "still wearing the [same outfit]" OR "now wearing [new outfit description]"
                - DESCRIBE: What they're wearing (be specific about continuity), where they are, what they're doing.
                - DO NOT describe facial features, hair color, or body type - those come from the reference image.
            """

        provider = get_text_provider()
        text_response = await provider.generate(
            prompt=prompt,
             schema={
                "type": "OBJECT",
                "properties": {
                    "slides": {
                        "type": "ARRAY",
                        "items": {
                            "type": "OBJECT",
                            "properties": {
                                "caption": {"type": "STRING"},
                                "visual_scene": {"type": "STRING"}
                            },
                             "required": ["caption", "visual_scene"]
                        }
                    }
                },
                "required": ["slides"]
            }
        )
        
        slides_text = text_response.get('slides', [])
        # Ensure we have exactly 4 slides or handle otherwise. 
        if len(slides_text) < 4:
            pass # Or duplicate
        slides_text = slides_text[:4] # Limit to 4

        # 2. Fetch and prepare reference images
        reference_images_list = []
        
        # Always include the influencer's avatar as reference [1]
        avatar_url = data.get('avatarUrl', '')
        if avatar_url:
            try:
                import httpx
                from PIL import Image
                import io
                
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(avatar_url)
                    if response.status_code == 200:
                        # Resize image to reduce token usage
                        image_bytes = response.content
                        img = Image.open(io.BytesIO(image_bytes))
                        
                        # Resize to max 512px on longest side
                        max_size = 512
                        ratio = min(max_size / img.width, max_size / img.height)
                        if ratio < 1:
                            new_size = (int(img.width * ratio), int(img.height * ratio))
                            img = img.resize(new_size, Image.Resampling.LANCZOS)
                            print(f"[Story Gen] Resized avatar from {len(image_bytes)} to {new_size}")
                        
                        # Convert to JPEG and encode
                        buffer = io.BytesIO()
                        img.convert('RGB').save(buffer, format='JPEG', quality=85)
                        resized_bytes = buffer.getvalue()
                        
                        encoded = base64.b64encode(resized_bytes).decode('utf-8')
                        reference_image_b64 = f"data:image/jpeg;base64,{encoded}"
                        
                        # Create ReferenceImage object
                        ref_img = ReferenceImage(
                            image_data=reference_image_b64,
                            label="[1]",
                            role="character",
                            description=f"Main character: {data.get('name')} ({data.get('visualDescription', 'influencer')})"
                        )
                        reference_images_list.append(ref_img)
                        print(f"[Story Gen] Added reference [1]: Main character ({len(resized_bytes)} bytes)")
                    else:
                        print(f"[Story Gen] Failed to fetch avatar: {response.status_code}")
            except Exception as e:
                print(f"[Story Gen] Error fetching avatar: {e}")
        
        # Future: Add additional reference images from request
        # if req.reference_images:
        #     for idx, ref_data in enumerate(req.reference_images):
        #         # Process product images, location images, other people, etc.
        #         # label them as [2], [3], etc.
        #         pass

        # 3. Generate ONE Grid Image with reference
        # Use best practices: explicit character referencing with image labels
        character_desc = data.get('visualDescription', 'person')
        
        # Build reference context for prompt
        if reference_images_list:
            ref_context = "REFERENCE IMAGES:\n"
            for ref in reference_images_list:
                ref_context += f"Image {ref.label}: {ref.description}\n"
            ref_context += "\n"
        else:
            ref_context = ""
        
        grid_prompt = (
            f"{ref_context}"
            f"Create a 2x2 grid of four REALISTIC SMARTPHONE photos telling a story. "
            f"CHARACTER CONSISTENCY RULES:\n"
        )
        
        if reference_images_list:
            # Use image labels in instructions
            grid_prompt += (
                f"- Use the EXACT character from image [1] in ALL four panels\n"
                f"- Keep EXACT facial structure, hair style, hair color, eye color, skin tone, and body build from image [1]\n"
                f"- For outfit, background, and pose: follow each panel's description exactly\n"
                f"- If a panel says 'same outfit', keep it consistent; if it describes a new outfit, show the change\n"
                f"- Each panel shows THE SAME PERSON from image [1]\n\n"
            )
        else:
            grid_prompt += (
                f"- Create ONE specific person and use them in ALL four panels\n"
                f"- Character: {character_desc}\n"
                f"- Keep EXACT facial structure, hair style, hair color, eye color, skin tone, and body build consistent\n"
                f"- For outfit, background, and pose: follow each panel's description exactly\n"
                f"- Outfit consistency should match the story context described in each panel\n\n"
            )
        
        grid_prompt += (
            f"Style: Shot on iPhone, flash photography, candid, grainy, imperfect framing, social media story quality. "
            f"AVOID: Professional lighting, studio quality, bokeh, 3D render, cinematic.\n\n"
        )
        
        for idx, slide in enumerate(slides_text):
            if reference_images_list:
                grid_prompt += (
                    f"Panel {idx + 1}: Using the character from image [1], "
                    f"place them in this scene (keep exact facial features and hair from image [1]): "
                    f"{slide['visual_scene']}. "
                )
            else:
                grid_prompt += (
                    f"Panel {idx + 1}: Same character as described above, "
                    f"in this scene: {slide['visual_scene']}. "
                )
        
        print(f"[Story Gen] Generating grid image with {len(reference_images_list)} reference image(s)")
        print(f"[Story Gen] Prompt: {grid_prompt[:200]}...")
        
        image_provider = get_image_provider()
        
        # Use new multi-image reference system if available
        if reference_images_list:
            grid_image_result = await image_provider.generate_image(
                prompt=grid_prompt,
                reference_images=reference_images_list
            )
        else:
            # Fallback to text-based description if no avatar
            character_desc = data.get('visualDescription', 'person')
            grid_prompt_fallback = (
                f"Create a 2x2 grid of four REALISTIC SMARTPHONE photos telling a story. "
                f"CRITICAL CHARACTER CONSISTENCY RULES:\n"
                f"- Create ONE specific person and use them in ALL four panels\n"
                f"- Keep EXACT facial structure, hair style, hair color, eye color, skin tone, and body build consistent\n"
                f"- Character description: {character_desc}\n"
                f"- ONLY change: outfit, background/setting, pose, and context as described for each panel\n"
                f"- This is THE SAME PERSON in different situations\n\n"
                f"Style: Shot on iPhone, flash photography, candid, grainy, imperfect framing, social media story quality. "
                f"AVOID: Professional lighting, studio quality, bokeh, 3D render, cinematic.\n\n"
            )
            for idx, slide in enumerate(slides_text):
                grid_prompt_fallback += (
                    f"Panel {idx + 1}: The same character as described above, "
                    f"in this scene (maintain exact facial features and build): "
                    f"{slide['visual_scene']}. "
                )
            
            grid_image_result = await image_provider.generate_image(prompt=grid_prompt_fallback)
        
        grid_image_url = grid_image_result.get('url') if isinstance(grid_image_result, dict) else grid_image_result
        grid_image_data = grid_image_result.get('data') if isinstance(grid_image_result, dict) else None
        
        if not grid_image_url:
            raise Exception("Failed to generate grid image")

        # 4. Split the Image
        # Use raw data if available to avoid DNS issues with R2 URLs
        if grid_image_data:
            from backend.image_utils import split_grid_image_from_bytes
            print(f"[Story Gen] Splitting grid from raw data ({len(grid_image_data)} bytes)")
            local_urls = split_grid_image_from_bytes(grid_image_data)
        else:
            from backend.image_utils import split_grid_image
            print(f"[Story Gen] Splitting grid from URL: {grid_image_url}")
            local_urls = split_grid_image(grid_image_url)

        
        final_slides = []
        for i, url in enumerate(local_urls):
            if i >= len(slides_text): break
            final_slides.append({
                "caption": slides_text[i]['caption'],
                "imagePrompt": slides_text[i]['visual_scene'], 
                "imageUrl": url
            })

        # --- AUTO-SAVE POST TO DB ---
        from datetime import datetime
        
        # Ensure we have an ID
        influencer_id = data.get('id')
        if not influencer_id:
            # Try to find ID if not passed in data?
            # Ideally the frontend should ensure 'data' has 'id'
            pass

        new_post_data = {
            "influencerId": influencer_id,
            "content": final_slides[0]['caption'] if final_slides else "New Story",
            "imageUrl": final_slides[0]['imageUrl'] if final_slides else "",
            "platform": data.get('platformFocus', 'Instagram'),
            "likes": 0,
            "comments": 0,
            "timestamp": datetime.utcnow().isoformat(),
            "hashtags": ["#story", "#" + req.topic.replace(" ", "")],
            "location": data.get('location'),
            "slides": final_slides
        }
        
        # Insert into DB
        new_entity = {
            "kind": "post",
            "data": new_post_data
        }
        
        saved_entity = await collection.insert_one(new_entity)
        
        # Add ID to returned data so frontend can use it
        new_post_data['id'] = str(saved_entity.inserted_id)

        return {"slides": final_slides, "post": new_post_data}

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


async def generate_story_internal(
    influencer_data: dict,
    influencer_id: str,
    topic: str,
    setup_context: str,
    choice: str = "",
    event_beats: list = None  # NEW: Event Orchestrator story beats
) -> dict:
    """
    Internal helper for story generation, called by session_routes.py.
    Returns dict with 'slides' and 'post' keys.
    
    When event_beats are provided, the story generation uses them
    to create a coherent narrative that follows the real-world progression.
    """
    # Create a mock request to reuse the existing logic
    class MockEntity:
        def __init__(self, data):
            self.kind = "influencer"
            self.data = data
    
    class MockRequest:
        def __init__(self, entity, topic, setup_context, choice, event_beats=None):
            self.entity = entity
            self.topic = topic
            self.setup_context = setup_context
            self.choice = choice
            self.reference_images = None
            self.event_beats = event_beats  # NEW
    
    # Add the ID to the data so it can be used in post creation
    data_with_id = {**influencer_data, "id": influencer_id}
    mock_entity = MockEntity(data_with_id)
    mock_req = MockRequest(mock_entity, topic, setup_context, choice, event_beats)
    
    # Call the existing endpoint logic
    result = await story_generate(mock_req)
    return result
