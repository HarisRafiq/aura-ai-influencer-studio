import os
import json
import base64
import asyncio
from typing import Dict, Any, Optional, List
from google import genai
from google.genai import types
from backend.ai.interfaces import TextGenerator, ImageGenerator, VideoGenerator, ReferenceImage
from backend.ai.utils import clean_json_string
from backend.r2_utils import R2Utils

class GeminiProvider(TextGenerator, ImageGenerator, VideoGenerator):
    def __init__(self, api_key: str, r2_utils: Optional[R2Utils] = None):
        self.client = genai.Client(api_key=api_key)
        self.r2 = r2_utils
        self.text_model = "gemini-2.5-flash"
        self.image_model = "gemini-2.5-flash-image"
        self.video_model = "veo-3.1-fast-generate-preview"

    async def generate(self, prompt: str, schema: Optional[Dict[str, Any]] = None, **kwargs) -> Any:
        config_args = {"response_mime_type": "application/json"} if schema else {}
        if schema:
            config_args["response_schema"] = schema
        
        # Handle tools if passed (e.g. google_search)
        if "tools" in kwargs:
            config_args["tools"] = kwargs["tools"]

        # Handle tool_config if passed
        if "tool_config" in kwargs:
            config_args["tool_config"] = kwargs["tool_config"]

        # Handle contents structure if complex parts are passed
        contents = kwargs.get("contents", prompt)

        response = self.client.models.generate_content(
            model=self.text_model,
            contents=contents,
            config=types.GenerateContentConfig(**config_args)
        )
        
        # If raw response requested or tools used returning complex data
        if kwargs.get("return_raw", False):
            return response

        try:
            return json.loads(clean_json_string(response.text))
        except:
            return response.text

    async def generate_image(
        self, 
        prompt: str, 
        reference_image: Optional[str] = None,
        reference_images: Optional[List[ReferenceImage]] = None,
        **kwargs
    ) -> Any:
        parts = []
        
        # Handle new multi-image reference system
        if reference_images:
            print(f"[Gemini Image] Processing {len(reference_images)} reference images")
            
            # Build reference context explanation
            ref_context = "REFERENCE IMAGES PROVIDED:\n"
            for ref in reference_images:
                ref_context += f"Image {ref.label}: {ref.description} (Role: {ref.role})\n"
            ref_context += "\n"
            
            # Add each reference image as a part
            for ref in reference_images:
                try:
                    header, data = ref.image_data.split(',')
                    mime_type = header.split(':')[1].split(';')[0]
                    image_bytes = base64.b64decode(data)
                    parts.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
                    print(f"[Gemini Image] Added reference image {ref.label}: {ref.role} ({len(image_bytes)} bytes)")
                except Exception as e:
                    print(f"[Gemini Image] Failed to parse reference image {ref.label}: {e}")
            
            # Build usage instructions based on roles
            usage_instructions = "HOW TO USE REFERENCE IMAGES:\n"
            for ref in reference_images:
                if ref.role == "character":
                    usage_instructions += (
                        f"- Image {ref.label} ({ref.description}): Use EXACT facial features, hair style, hair color, eye color, skin tone, and body build from this image. "
                        f"For outfit, background, and pose: follow the scene description exactly - if the scene says same outfit, keep it; if it describes a new outfit, apply it.\n"
                    )
                elif ref.role == "product":
                    usage_instructions += (
                        f"- Image {ref.label} ({ref.description}): Include this exact product in the scene. "
                        f"Maintain brand details, colors, and design. Place it as described in the scene.\n"
                    )
                elif ref.role == "person":
                    usage_instructions += (
                        f"- Image {ref.label} ({ref.description}): Use this person's EXACT facial features, hair, and build. "
                        f"For outfit/context: follow the scene description exactly.\n"
                    )
                elif ref.role == "location":
                    usage_instructions += (
                        f"- Image {ref.label} ({ref.description}): Use this location/background as the setting. "
                        f"Match the architectural style and atmosphere. Apply any scene-specific variations as described.\n"
                    )
                else:  # generic object
                    usage_instructions += (
                        f"- Image {ref.label} ({ref.description}): Include this object/element in the scene as described.\n"
                    )
            
            style_suffix = ", photorealistic, 8k, highly detailed, raw photo, shot on fujifilm, grainy texture"
            full_prompt = f"{ref_context}{usage_instructions}\nSCENE TO CREATE:\n{prompt}{style_suffix}"
            
        # Legacy: single reference image (backward compatibility)
        elif reference_image:
            try:
                header, data = reference_image.split(',')
                mime_type = header.split(':')[1].split(';')[0]
                image_bytes = base64.b64decode(data)
                parts.append(types.Part.from_bytes(data=image_bytes, mime_type=mime_type))
                print(f"[Gemini Image] Added legacy reference image ({len(image_bytes)} bytes)")
            except Exception as e:
                print(f"[Gemini Image] Failed to parse reference image: {e}")
            
            # Explicit instructions following best practices for character consistency
            style_suffix = ", photorealistic, 8k, highly detailed, raw photo, shot on fujifilm, grainy texture"
            full_prompt = (
                f"REFERENCE IMAGE USAGE:\n"
                f"- Use the EXACT person from the reference image (facial structure, facial features, hair style, hair color, eye color, skin tone, body build)\n"
                f"- For outfit, background, and setting: follow the scene description below exactly\n"
                f"- If the scene says 'same outfit', keep it; if it describes a specific outfit, apply it\n"
                f"- If multiple panels, each panel description determines its own outfit/setting\n\n"
                f"SCENE TO CREATE:\n{prompt}{style_suffix}"
            )
        else:
            # No reference images
            style_suffix = ", photorealistic, 8k, highly detailed, raw photo, shot on fujifilm, grainy texture"
            full_prompt = prompt + style_suffix
        
        parts.append(types.Part.from_text(text=full_prompt))

        has_references = reference_images is not None or reference_image is not None
        ref_count = len(reference_images) if reference_images else (1 if reference_image else 0)
        print(f"[Gemini Image] Generating with {len(parts)} parts (references: {ref_count})")
        
        try:
            # Use response_modalities=['IMAGE'] for correct 2.0+ image generation
            response = self.client.models.generate_content(
                model=self.image_model,
                contents=[types.Content(parts=parts)],
                config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(
                    aspect_ratio="16:9",
                )
    )
            )
            
            print(f"[Gemini Image] Response received")
            
            image_data = None
            mime_type = "image/jpeg"
            
            # Preferred way in new SDK: use as_image() on the part
            if response.parts:
                for part in response.parts:
                    try:
                        image_obj = part.as_image()
                        if image_obj:
                            image_data = image_obj.data
                            # Try to get mime type, default to jpeg
                            mime_type = getattr(image_obj, 'mime_type', 'image/jpeg') 
                            print(f"[Gemini Image] Found image via as_image(): {len(image_data)} bytes")
                            break
                    except Exception as e:
                        print(f"[Gemini Image] as_image() failed: {e}, falling back to inline_data")
                        if part.inline_data:
                            image_data = part.inline_data.data
                            mime_type = part.inline_data.mime_type
                            print(f"[Gemini Image] Found inline_data: {len(image_data)} bytes, type: {mime_type}")
                            break
            
            if not image_data:
                # Check candidates manually as a last resort
                if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                    for part in response.candidates[0].content.parts:
                        if part.inline_data:
                            image_data = part.inline_data.data
                            mime_type = part.inline_data.mime_type
                            print(f"[Gemini Image] Found inline_data in candidates: {len(image_data)} bytes")
                            break
            
            if not image_data:
                print(f"[Gemini Image] ERROR - No image data found in response")
                # Fallback: Try without reference images
                if reference_images or reference_image:
                    print(f"[Gemini Image] Retrying without reference images...")
                    return await self.generate_image(prompt, reference_image=None, reference_images=None, **kwargs)
                raise Exception("No image generated")
                
            if self.r2:
                import uuid
                filename = f"generated/{uuid.uuid4()}.{mime_type.split('/')[-1]}"
                url = self.r2.upload_file_to_r2(filename, image_data, content_type=mime_type)
                print(f"[Gemini Image] Uploaded to R2: {url}")
                # Return both URL and raw data for local processing
                return {"url": url, "data": image_data, "mime_type": mime_type}
            else:
                b64_img = base64.b64encode(image_data).decode('utf-8')
                return {"url": f"data:{mime_type};base64,{b64_img}", "data": image_data, "mime_type": mime_type}

        
        except Exception as e:
            print(f"[Gemini Image] Exception during generation: {type(e).__name__}: {e}")
            # If reference images failed, try without them
            if reference_images or reference_image:
                print(f"[Gemini Image] Retrying without reference images...")
                return await self.generate_image(prompt, reference_image=None, reference_images=None, **kwargs)
            raise

    async def generate_video(
        self,
        prompt: str,
        image_url: str,
        duration: int = 5,        aspect_ratio: str = "16:9",        **kwargs
    ) -> Any:
        """
        Generate video from image using Gemini Veo.
        Follows the latest SDK patterns for video generation.
        """
        try:
            import httpx
            import time
            import uuid
            
            # 1. Get the input image (handle data URIs vs HTTP URLs)
            print(f"[Gemini Video] Processing source image: {image_url[:60]}...")
            
            if image_url.startswith('data:'):
                # Handle data URI - extract and decode base64 directly
                try:
                    header, data = image_url.split(',', 1)
                    image_bytes = base64.b64decode(data)
                    print(f"[Gemini Video] Decoded data URI: {len(image_bytes)} bytes")
                except Exception as e:
                    raise Exception(f"Failed to decode data URI: {e}")
            else:
                # Handle HTTP URL - fetch the image
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(image_url)
                    if response.status_code != 200:
                        raise Exception(f"Failed to download image: HTTP {response.status_code}")
                    image_bytes = response.content
                    print(f"[Gemini Video] Downloaded: {len(image_bytes)} bytes")
            
            # 2. Determine mime type from image bytes
            mime_type = 'image/jpeg'
            if image_bytes.startswith(b'\x89PNG'): mime_type = 'image/png'
            elif len(image_bytes) > 12 and image_bytes[8:12] == b'WEBP': mime_type = 'image/webp'
            
            # 3. Start video generation with image bytes directly
            # Adjust duration to valid values for the preview model
            if duration <= 4: d_sec = 4
            elif duration <= 6: d_sec = 6
            else: d_sec = 8
            
            print(f"[Gemini Video] Generating video with model: {self.video_model}, aspect ratio: {aspect_ratio}")
            operation = await asyncio.to_thread(
                self.client.models.generate_videos,
                model=self.video_model,
                prompt=prompt,
                image=types.Image(image_bytes=image_bytes, mime_type=mime_type),
                config=types.GenerateVideosConfig(
                    duration_seconds=d_sec,
                    aspect_ratio=aspect_ratio
                )
            )
            
            print(f"[Gemini Video] Operation started: {operation.name}")
            
            # 4. Poll for completion
            start_time = time.time()
            max_wait = 600
            while not operation.done:
                if time.time() - start_time > max_wait:
                    raise Exception("Video generation timed out")
                
                print(f"[Gemini Video] Still generating... ({int(time.time() - start_time)}s)")
                await asyncio.sleep(10)
                operation = await asyncio.to_thread(self.client.operations.get, operation)
            
            # 5. Download and save the result
            if not operation.response or not operation.response.generated_videos:
                raise Exception("No video generated in response")
            
            generated_video = operation.response.generated_videos[0]
            
            print(f"[Gemini Video] Downloading video data...")
            await asyncio.to_thread(self.client.files.download, file=generated_video.video)
            
            temp_output_path = os.path.join("uploads", f"output_{uuid.uuid4()}.mp4")
            print(f"[Gemini Video] Saving to {temp_output_path}")
            await asyncio.to_thread(generated_video.video.save, temp_output_path)
            
            # 6. Finalize (R2 or local)
            try:
                with open(temp_output_path, "rb") as f:
                    video_data = f.read()
                
                if self.r2:
                    filename = f"generated/video_{uuid.uuid4()}.mp4"
                    url = self.r2.upload_file_to_r2(filename, video_data, content_type="video/mp4")
                    print(f"[Gemini Video] Uploaded to R2: {url}")
                    return {"url": url}
                else:
                    # Use the local file as the final result
                    final_filename = f"video_{uuid.uuid4()}.mp4"
                    final_path = os.path.join("uploads", final_filename)
                    os.rename(temp_output_path, final_path)
                    print(f"[Gemini Video] Saved locally: {final_path}")
                    return {"url": f"http://localhost:8000/uploads/{final_filename}"}
            finally:
                if os.path.exists(temp_output_path):
                    os.remove(temp_output_path)
                    
        except Exception as e:
            print(f"[Gemini Video] Error: {type(e).__name__}: {e}")
            raise


