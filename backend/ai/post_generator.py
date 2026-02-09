"""
Post Generator - LLM-driven image strategy and slide generation
"""
import asyncio
import httpx
from io import BytesIO
from typing import List, Dict, Any, Optional
from pydantic import BaseModel

from backend.ai.factory import get_text_provider, get_image_provider, get_r2_utils
from backend.ai.interfaces import ReferenceImage
from backend.image_utils import split_grid_flexible
import uuid
import base64


# Plain dict schemas for Gemini (no additionalProperties)
IMAGE_STRATEGY_SCHEMA = {
    "type": "object",
    "properties": {
        "image_usage_plan": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "selected_image_url": {"type": "string"},
                    "usage_type": {"type": "string", "enum": ["reference", "prompt_only"]},
                    "reference_label": {"type": "string", "description": "e.g. [2], [3]"},
                    "role": {"type": "string", "description": "product, location, object"},
                    "description": {"type": "string"},
                    "reasoning": {"type": "string"}
                },
                "required": ["selected_image_url", "usage_type", "reasoning"]
            }
        }
    },
    "required": ["image_usage_plan"]
}

SLIDE_STRUCTURE_SCHEMA = {
    "type": "object",
    "properties": {
        "slide_count": {"type": "integer", "enum": [2, 4, 6]},
        "grid_layout": {"type": "string", "enum": ["1x2", "2x1", "2x2", "2x3", "3x2"]},
        "caption": {"type": "string", "description": "Instagram caption with hashtags"},
        "slides": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "panel_number": {"type": "integer"},
                    "panel_description": {"type": "string"},
                    "uses_images": {
                        "type": "array",
                        "items": {"type": "string"}
                    }
                },
                "required": ["panel_number", "panel_description"]
            }
        }
    },
    "required": ["slide_count", "grid_layout", "caption", "slides"]
}


class PostGenerationResult(BaseModel):
    """Final result of post generation"""
    slide_count: int
    grid_layout: str
    slide_urls: List[str]
    grid_url: str
    caption: str
    image_usage_plan: List[Dict[str, Any]]


async def download_image_as_base64(url: str) -> Optional[str]:
    """Download image and convert to base64 data URI"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            image_bytes = response.content
            raw_b64 = base64.b64encode(image_bytes).decode('utf-8')
            # Gemini expects data URI format: data:mime;base64,...
            content_type = response.headers.get('content-type', 'image/jpeg').split(';')[0]
            return f"data:{content_type};base64,{raw_b64}"
    except Exception as e:
        print(f"[PostGenerator] Failed to download image {url}: {e}")
        return None


async def generate_post_from_selections(
    influencer_avatar_b64: str,
    influencer_data: Dict[str, Any],
    selected_web_items: List[Dict[str, Any]],
    selected_images: List[Dict[str, Any]],
    user_query: str
) -> PostGenerationResult:
    """
    Generate a post from user selections using LLM-driven strategy.
    
    Args:
        influencer_avatar_b64: Base64 encoded influencer avatar
        influencer_data: Influencer profile data (name, niches, etc.)
        selected_web_items: List of selected web search results
        selected_images: List of selected image results
        user_query: Original user query
    
    Returns:
        PostGenerationResult with slide URLs and metadata
    """
    text_provider = get_text_provider()
    image_provider = get_image_provider()
    r2 = get_r2_utils()
    
    print(f"[PostGenerator] Starting generation with {len(selected_images)} images, {len(selected_web_items)} web items")
    
    # Step 1: Image Strategy - LLM decides how to use selected images
    image_strategy_prompt = f"""Analyze the selected images and decide how to use each one for creating a social media post.

USER QUERY: {user_query}

INFLUENCER PROFILE:
- Name: {influencer_data.get('name', 'Unknown')}
- Niches: {', '.join(influencer_data.get('niches', []))}
- Style: {influencer_data.get('tone', 'Professional')}

SELECTED IMAGES ({len(selected_images)}):
{chr(10).join([f"{i+1}. {img.get('title', 'Image')} - {img.get('image_url', '')}" for i, img in enumerate(selected_images)])}

For each image, decide:
1. usage_type: "reference" (use as reference image with label) or "prompt_only" (just mention in prompt)
2. If "reference": assign label like "[2]", "[3]" (note: [1] is reserved for influencer avatar)
3. role: "product", "location", "object", or "character"
4. description: Brief description for the LLM to understand
5. reasoning: Why this usage type?

Guidelines:
- Use "reference" for images that should be replicated consistently (products, specific locations, objects)
- Use "prompt_only" for images that just inspire the style/mood
- Limit references to max 3 images (including influencer avatar)
- Choose the most important/relevant images as references

Return a JSON object with "image_usage_plan" array."""

    try:
        image_strategy_response = await text_provider.generate(
            prompt=image_strategy_prompt,
            schema=IMAGE_STRATEGY_SCHEMA
        )
        
        if isinstance(image_strategy_response, str):
            import json
            image_strategy_data = json.loads(image_strategy_response)
        else:
            image_strategy_data = image_strategy_response
        
        image_usage_plan = image_strategy_data.get("image_usage_plan", [])
        print(f"[PostGenerator] Image strategy determined: {len(image_usage_plan)} images analyzed")
        
    except Exception as e:
        print(f"[PostGenerator] Image strategy generation failed: {e}, using default strategy")
        # Fallback: Use first 2 selected images as references
        image_usage_plan = []
        for i, img in enumerate(selected_images[:2]):
            image_usage_plan.append({
                "selected_image_url": img.get("image_url", ""),
                "usage_type": "reference",
                "reference_label": f"[{i+2}]",
                "role": "object",
                "description": img.get("title", "Selected image"),
                "reasoning": "Auto-assigned as reference"
            })
    
    # Step 2: Slide Structure - Determine slide count and layout
    web_context = "\n".join([
        f"- {item.get('title', '')}: {item.get('snippet', '')}"
        for item in selected_web_items[:10]
    ])
    
    image_context = "\n".join([
        f"- {usage.get('reference_label', 'Image')}: {usage.get('description', '')}"
        for usage in image_usage_plan
    ])
    
    slide_structure_prompt = f"""Create a slide structure for a social media post.

USER QUERY: {user_query}

INFLUENCER: {influencer_data.get('name', 'Unknown')} - {', '.join(influencer_data.get('niches', []))}

SELECTED WEB FACTS:
{web_context}

AVAILABLE IMAGES:
{image_context}

Decide:
1. slide_count: How many slides? Choose 2 (brief), 4 (standard), or 6 (detailed)
2. grid_layout: Choose based on slide_count:
   - 2 slides: "1x2" (vertical stack) or "2x1" (horizontal)
   - 4 slides: "2x2" (square grid)
   - 6 slides: "2x3" (landscape) or "3x2" (portrait)
3. caption: Instagram-style caption with key facts and hashtags
4. slides: Array of slide descriptions

Each slide should have:
- panel_number: 1, 2, 3, etc.
- panel_description: What should be in this panel (1-2 sentences)
- uses_images: Which image labels are used (e.g., ["[1]", "[2]"])

Return JSON object."""

    try:
        slide_structure_response = await text_provider.generate(
            prompt=slide_structure_prompt,
            schema=SLIDE_STRUCTURE_SCHEMA
        )
        
        if isinstance(slide_structure_response, str):
            import json
            slide_data = json.loads(slide_structure_response)
        else:
            slide_data = slide_structure_response
        
        slide_count = slide_data.get("slide_count", 4)
        grid_layout = slide_data.get("grid_layout", "2x2")
        caption = slide_data.get("caption", "")
        slides = slide_data.get("slides", [])
        
        print(f"[PostGenerator] Slide structure: {slide_count} slides in {grid_layout} grid")
        
    except Exception as e:
        print(f"[PostGenerator] Slide structure generation failed: {e}, using defaults")
        slide_count = 4
        grid_layout = "2x2"
        caption = f"Check out this amazing content! {user_query}"
        slides = [
            {"panel_number": i+1, "panel_description": f"Panel {i+1} content", "uses_images": ["[1]"]}
            for i in range(4)
        ]
    
    # Step 3: Generate Grid Prompt
    rows, cols = map(int, grid_layout.split("x"))
    
    panel_positions = []
    position_names = ["TOP-LEFT", "TOP-RIGHT", "MIDDLE-LEFT", "MIDDLE-RIGHT", "BOTTOM-LEFT", "BOTTOM-RIGHT"]
    for row in range(rows):
        for col in range(cols):
            if rows == 1:
                pos = "LEFT" if col == 0 else "RIGHT"
            elif rows == 2:
                pos = position_names[row * 2 + col] if row * 2 + col < len(position_names) else f"R{row}C{col}"
            else:
                pos = f"R{row+1}C{col+1}"
            panel_positions.append(pos)
    
    grid_prompt = f"""Create a {grid_layout} grid of {slide_count} ultra-realistic smartphone photos for a social media post.

GRID LAYOUT: {' → '.join(panel_positions)}

INFLUENCER: Use character from image [1] (influencer avatar) in all panels.

"""
    
    # Add panel descriptions
    for i, slide in enumerate(slides[:slide_count]):
        panel_desc = slide.get("panel_description", f"Panel {i+1}")
        grid_prompt += f"Panel {i+1} ({panel_positions[i]}): Character from [1], {panel_desc}\n"
    
    grid_prompt += "\nStyle: Professional, high-quality, Instagram-ready, photorealistic, natural lighting."
    
    print(f"[PostGenerator] Grid prompt generated ({len(grid_prompt)} chars)")
    
    # Prepare reference images
    reference_images = [
        ReferenceImage(
            image_data=influencer_avatar_b64,
            label="[1]",
            role="character",
            description=f"{influencer_data.get('name', 'Influencer')} avatar"
        )
    ]
    
    # Add selected images as references (download and convert to base64)
    for usage in image_usage_plan:
        if usage.get("usage_type") == "reference" and len(reference_images) < 4:
            image_url = usage.get("selected_image_url")
            if image_url:
                img_b64 = await download_image_as_base64(image_url)
                if img_b64:
                    reference_images.append(
                        ReferenceImage(
                            image_data=img_b64,
                            label=usage.get("reference_label", f"[{len(reference_images)+1}]"),
                            role=usage.get("role", "object"),
                            description=usage.get("description", "Reference image")
                        )
                    )
    
    print(f"[PostGenerator] Using {len(reference_images)} reference images")
    
    # Generate grid image
    print(f"[PostGenerator] Generating {grid_layout} grid image...")
    image_result = await image_provider.generate_image(
        prompt=grid_prompt,
        reference_images=reference_images
    )
    
    if not image_result or "url" not in image_result:
        raise Exception("Image generation failed - no URL returned")
    
    grid_image_url = image_result["url"]
    print(f"[PostGenerator] Grid image generated: {grid_image_url}")
    
    # Download grid image
    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(grid_image_url)
        response.raise_for_status()
        grid_image_bytes = response.content
    
    # Split grid into panels
    print(f"[PostGenerator] Splitting grid into {slide_count} panels...")
    panel_bytes_list = split_grid_flexible(grid_image_bytes, rows, cols)
    
    if len(panel_bytes_list) != slide_count:
        print(f"[PostGenerator] Warning: Expected {slide_count} panels but got {len(panel_bytes_list)}")
    
    # Upload panels to R2
    slide_urls = []
    if r2:
        for i, panel_bytes in enumerate(panel_bytes_list):
            filename = f"orchestrator/slides/{uuid.uuid4()}_panel_{i+1}.jpg"
            url = r2.upload_file_to_r2(filename, panel_bytes, content_type="image/jpeg")
            slide_urls.append(url)
            print(f"[PostGenerator] Uploaded panel {i+1}/{len(panel_bytes_list)}")
        
        # Upload full grid
        grid_filename = f"orchestrator/grids/{uuid.uuid4()}_grid.jpg"
        uploaded_grid_url = r2.upload_file_to_r2(grid_filename, grid_image_bytes, content_type="image/jpeg")
        print(f"[PostGenerator] Uploaded grid image")
    else:
        # Fallback: Use original URL
        uploaded_grid_url = grid_image_url
        slide_urls = [grid_image_url] * slide_count
        print(f"[PostGenerator] Warning: No R2 available, using original URLs")
    
    print(f"[PostGenerator] Post generation complete!")
    
    return PostGenerationResult(
        slide_count=slide_count,
        grid_layout=grid_layout,
        slide_urls=slide_urls,
        grid_url=uploaded_grid_url,
        caption=caption,
        image_usage_plan=[u if isinstance(u, dict) else dict(u) for u in image_usage_plan]
    )
