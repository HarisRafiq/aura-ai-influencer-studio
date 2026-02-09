"""
Example: Using Multi-Image References for Story Generation

This example shows how to extend the story generation to include
product placement, multiple characters, or location references.
"""

from backend.ai.interfaces import ReferenceImage
from backend.ai.factory import get_image_provider
import base64
import httpx


async def fetch_and_encode_image(url: str) -> str:
    """Helper to fetch and encode an image as base64."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url)
        if response.status_code == 200:
            image_bytes = response.content
            encoded = base64.b64encode(image_bytes).decode('utf-8')
            return f"data:image/jpeg;base64,{encoded}"
    raise Exception(f"Failed to fetch image: {url}")


async def example_single_character():
    """Example 1: Single character in different contexts (current implementation)"""
    
    # This is what happens now in story generation
    avatar_b64 = await fetch_and_encode_image("https://example.com/influencer.jpg")
    
    reference_images = [
        ReferenceImage(
            image_data=avatar_b64,
            label="[1]",
            role="character",
            description="Main influencer: fitness enthusiast"
        )
    ]
    
    prompt = (
        "Create a 2x2 grid of four photos:\n"
        "Panel 1: Character from image [1] at gym, wearing workout clothes, lifting weights\n"
        "Panel 2: Same character from [1] having protein shake, kitchen background\n"
        "Panel 3: Character from [1] stretching outdoors, yoga mat, park setting\n"
        "Panel 4: Character from [1] relaxing at home, casual loungewear, evening\n"
        "Keep exact facial features from image [1]. Shot on iPhone, candid style."
    )
    
    image_provider = get_image_provider()
    result = await image_provider.generate_image(
        prompt=prompt,
        reference_images=reference_images
    )
    
    return result


async def example_character_with_product():
    """Example 2: Character showcasing a product"""
    
    avatar_b64 = await fetch_and_encode_image("https://example.com/influencer.jpg")
    product_b64 = await fetch_and_encode_image("https://example.com/nike-shoes.jpg")
    
    reference_images = [
        ReferenceImage(
            image_data=avatar_b64,
            label="[1]",
            role="character",
            description="Running influencer, athletic build, energetic"
        ),
        ReferenceImage(
            image_data=product_b64,
            label="[2]",
            role="product",
            description="Nike Air Zoom Pegasus running shoes, blue and white"
        )
    ]
    
    prompt = (
        "Create a 2x2 grid showcasing a product review:\n"
        "Panel 1: Character from [1] unboxing the shoes from [2], excited expression\n"
        "Panel 2: Close-up of character from [1] wearing shoes from [2], detail shot\n"
        "Panel 3: Character from [1] running in park wearing shoes from [2], action shot\n"
        "Panel 4: Character from [1] sitting after run, shoes from [2] visible, satisfied look\n"
        "Maintain character from [1] and product from [2] in all panels. iPhone photography."
    )
    
    image_provider = get_image_provider()
    result = await image_provider.generate_image(
        prompt=prompt,
        reference_images=reference_images
    )
    
    return result


async def example_two_characters():
    """Example 3: Two different people together (collaboration content)"""
    
    influencer1_b64 = await fetch_and_encode_image("https://example.com/influencer1.jpg")
    influencer2_b64 = await fetch_and_encode_image("https://example.com/influencer2.jpg")
    
    reference_images = [
        ReferenceImage(
            image_data=influencer1_b64,
            label="[1]",
            role="character",
            description="Main influencer: fashion content creator"
        ),
        ReferenceImage(
            image_data=influencer2_b64,
            label="[2]",
            role="person",
            description="Collaborator: beauty influencer friend"
        )
    ]
    
    prompt = (
        "Create a hyper-realistic image of the person in image [1] and the person in image [2] "
        "sitting together at a trendy cafe, having coffee and laughing. Both should be looking "
        "at each other, casual outfits, natural lighting through window. "
        "Keep exact facial features from both images. Shot on iPhone, candid moment."
    )
    
    image_provider = get_image_provider()
    result = await image_provider.generate_image(
        prompt=prompt,
        reference_images=reference_images
    )
    
    return result


async def example_character_at_location():
    """Example 4: Character at a specific reference location"""
    
    avatar_b64 = await fetch_and_encode_image("https://example.com/influencer.jpg")
    location_b64 = await fetch_and_encode_image("https://example.com/santorini.jpg")
    
    reference_images = [
        ReferenceImage(
            image_data=avatar_b64,
            label="[1]",
            role="character",
            description="Travel influencer"
        ),
        ReferenceImage(
            image_data=location_b64,
            label="[2]",
            role="location",
            description="Santorini, Greece - white buildings with blue domes"
        )
    ]
    
    prompt = (
        "Create a 2x2 grid of travel content:\n"
        "Panel 1: Character from [1] at location from [2], wide shot showing architecture\n"
        "Panel 2: Character from [1] enjoying sunset at location [2], golden hour\n"
        "Panel 3: Character from [1] having breakfast at location [2], cafe terrace\n"
        "Panel 4: Character from [1] exploring streets at location [2], candid walking shot\n"
        "Use character from [1], setting from [2]. iPhone travel photography style."
    )
    
    image_provider = get_image_provider()
    result = await image_provider.generate_image(
        prompt=prompt,
        reference_images=reference_images
    )
    
    return result


async def example_complex_scene():
    """Example 5: Complex scene with character, product, and specific location"""
    
    avatar_b64 = await fetch_and_encode_image("https://example.com/influencer.jpg")
    product_b64 = await fetch_and_encode_image("https://example.com/camera.jpg")
    location_b64 = await fetch_and_encode_image("https://example.com/brooklyn-bridge.jpg")
    
    reference_images = [
        ReferenceImage(
            image_data=avatar_b64,
            label="[1]",
            role="character",
            description="Photography influencer, creative professional"
        ),
        ReferenceImage(
            image_data=product_b64,
            label="[2]",
            role="product",
            description="Sony A7IV camera with lens"
        ),
        ReferenceImage(
            image_data=location_b64,
            label="[3]",
            role="location",
            description="Brooklyn Bridge, New York City"
        )
    ]
    
    prompt = (
        "Create a realistic image of the person in image [1] photographing at the location "
        "in image [3] using the camera from image [2]. They should be setting up a shot, "
        "holding camera [2], with the iconic architecture of location [3] in the background. "
        "Sunset lighting, other tourists visible, wearing casual photographer outfit "
        "(different from reference). Keep exact facial features from [1], show product [2] "
        "clearly, capture atmosphere of location [3]. Shot on iPhone, behind-the-scenes style."
    )
    
    image_provider = get_image_provider()
    result = await image_provider.generate_image(
        prompt=prompt,
        reference_images=reference_images
    )
    
    return result


# Integration with story generation endpoint
async def story_with_product_placement(
    influencer_data: dict,
    story_context: str,
    product_url: str,
    product_description: str
):
    """
    Example of how to modify /story-generate endpoint to include product placement.
    This would be called from the frontend when user selects a product to feature.
    """
    
    # Fetch influencer avatar
    avatar_b64 = await fetch_and_encode_image(influencer_data['avatarUrl'])
    
    # Fetch product image
    product_b64 = await fetch_and_encode_image(product_url)
    
    # Create reference images
    reference_images = [
        ReferenceImage(
            image_data=avatar_b64,
            label="[1]",
            role="character",
            description=f"Main character: {influencer_data['name']}"
        ),
        ReferenceImage(
            image_data=product_b64,
            label="[2]",
            role="product",
            description=product_description
        )
    ]
    
    # Generate text for 4 slides (would use actual LLM here)
    slides = [
        {"caption": "found something amazing ✨", "visual_scene": "Character from [1] discovering product [2], excited expression"},
        {"caption": "first impressions 💭", "visual_scene": "Character from [1] unboxing/examining product [2], detail shot"},
        {"caption": "trying it out 🔥", "visual_scene": "Character from [1] using product [2], action shot"},
        {"caption": "absolutely love it! 😍", "visual_scene": "Character from [1] with product [2], satisfied and happy"},
    ]
    
    # Build grid prompt with image references
    grid_prompt = (
        "REFERENCE IMAGES:\n"
        "Image [1]: Main influencer character\n"
        "Image [2]: Product to showcase\n\n"
        "Create a 2x2 grid of four REALISTIC SMARTPHONE photos:\n"
    )
    
    for idx, slide in enumerate(slides):
        grid_prompt += (
            f"Panel {idx + 1}: Using character from [1] and including product from [2]: "
            f"{slide['visual_scene']}. "
        )
    
    grid_prompt += (
        "\nKeep exact facial features from image [1]. "
        "Show product from image [2] clearly in relevant panels. "
        "Shot on iPhone, candid social media style."
    )
    
    # Generate image
    image_provider = get_image_provider()
    result = await image_provider.generate_image(
        prompt=grid_prompt,
        reference_images=reference_images
    )
    
    return result
