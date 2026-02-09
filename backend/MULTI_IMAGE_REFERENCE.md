# Multi-Image Reference System

## Overview

The system now supports multiple labeled reference images for consistent character generation, product placement, and scene composition.

## Architecture

### ReferenceImage Model

```python
class ReferenceImage(BaseModel):
    image_data: str      # base64 data URL (data:image/jpeg;base64,...)
    label: str          # Identifier: "[1]", "[2]", "[3]"
    role: str           # "character", "product", "location", "person", "object"
    description: str    # Human-readable: "Main influencer", "Nike shoes", etc.
```

### Supported Roles

1. **character** - Main influencer/character to maintain consistency
   - AI keeps: facial features, hair, eye color, skin tone, body build
   - AI changes: outfit, background, pose as described

2. **product** - Products to showcase
   - AI keeps: brand details, colors, design, logos
   - AI places: in scene as described

3. **person** - Additional people (friends, other influencers)
   - AI keeps: facial features, hair, build
   - AI changes: outfit, context as described

4. **location** - Reference locations/backgrounds
   - AI keeps: architectural style, atmosphere
   - AI uses: as setting/background

5. **object** - Generic objects to include
   - AI includes: the object in scene as described

## Usage Examples

### Scenario A: Two Different Characters Together

```python
from backend.ai.interfaces import ReferenceImage
from backend.ai.factory import get_image_provider

reference_images = [
    ReferenceImage(
        image_data="data:image/jpeg;base64,...",
        label="[1]",
        role="character",
        description="Male influencer wearing casual clothes"
    ),
    ReferenceImage(
        image_data="data:image/jpeg;base64,...",
        label="[2]",
        role="person",
        description="Female friend in athletic wear"
    )
]

prompt = (
    "Create a hyper-realistic image of the man in image [1] and the woman in image [2] "
    "sitting together in a cozy cafe, drinking coffee. They should be looking at each other "
    "laughing. Shot on iPhone, candid, warm lighting."
)

image_provider = get_image_provider()
result = await image_provider.generate_image(
    prompt=prompt,
    reference_images=reference_images
)
```

### Scenario B: Character with Product Placement

```python
reference_images = [
    ReferenceImage(
        image_data="data:image/jpeg;base64,...",
        label="[1]",
        role="character",
        description="Fitness influencer, athletic build"
    ),
    ReferenceImage(
        image_data="data:image/jpeg;base64,...",
        label="[2]",
        role="product",
        description="Nike Air Max sneakers, white and blue colorway"
    )
]

prompt = (
    "Using the character from image [1], show them running in Central Park at sunrise, "
    "wearing the sneakers from image [2]. Close-up shot focusing on the shoes and their movement. "
    "Shot on iPhone, motion blur, golden hour lighting."
)
```

### Scenario C: Changing Context for One Character

```python
reference_images = [
    ReferenceImage(
        image_data="data:image/jpeg;base64,...",
        label="[1]",
        role="character",
        description="Travel influencer at the beach"
    )
]

prompt = (
    "Using the character from image [1], place them walking on the Brooklyn Bridge at sunset, "
    "wearing a blue denim jacket and white sneakers (NOT their current outfit from the reference). "
    "Keep the exact facial structure and hair from image [1]. "
    "Shot on iPhone, candid street photography style."
)
```

### Scenario D: Multi-Panel Story with Product

```python
reference_images = [
    ReferenceImage(
        image_data="data:image/jpeg;base64,...",
        label="[1]",
        role="character",
        description="Beauty influencer"
    ),
    ReferenceImage(
        image_data="data:image/jpeg;base64,...",
        label="[2]",
        role="product",
        description="Glossier Cloud Paint blush, beam shade"
    )
]

prompt = (
    "Create a 2x2 grid showing a morning makeup routine:\n"
    "Panel 1: Character from image [1] in bathroom, bare face, natural morning light\n"
    "Panel 2: Same character applying the product from image [2] to their cheek\n"
    "Panel 3: Character blending the product with fingers, close-up\n"
    "Panel 4: Character's finished look with natural glowy makeup\n"
    "All panels: same character from [1], include product [2] where applicable. "
    "Shot on iPhone, authentic beauty content style."
)
```

## How It Works

### 1. AI Provider Processing

The `GeminiProvider` (or other providers) receives the reference images and:

1. Parses each reference image and adds it to the request
2. Builds context about what each image represents
3. Creates role-specific usage instructions
4. Combines everything into a structured prompt

### 2. Prompt Construction

For each reference image, specific instructions are added:

```
REFERENCE IMAGES PROVIDED:
Image [1]: Main influencer character (Role: character)
Image [2]: Nike Air Max shoes (Role: product)

HOW TO USE REFERENCE IMAGES:
- Image [1] (Main influencer): Use EXACT facial features, hair, eye color...
- Image [2] (Nike Air Max shoes): Include this exact product in the scene...

SCENE TO CREATE:
[Your prompt here]
```

### 3. LLM Processing

The LLM receives:

- All reference images as visual input
- Clear labels for each image
- Role-specific instructions
- Your scene description referencing images by label

## Benefits

✅ **Consistency** - Same character/product across multiple images
✅ **Flexibility** - Mix and match different elements
✅ **Clarity** - Explicit labeling prevents confusion
✅ **Scalability** - Easy to add more reference types
✅ **Context-Aware** - LLM understands what to keep vs. change

## Frontend Integration

To use from the frontend, extend `StoryGenerateRequest`:

```typescript
interface ReferenceImageInput {
  image_url: string; // URL or base64
  role: "character" | "product" | "location" | "person" | "object";
  description: string;
}

// When calling generateStoryCarousel:
const result = await fetch(`${API_URL}/story-generate`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    entity: { kind: "influencer", data: influencer },
    topic,
    setup_context: setupContext,
    choice,
    reference_images: [
      {
        image_url: influencer.avatarUrl,
        role: "character",
        description: `Main character: ${influencer.name}`,
      },
      {
        image_url: "https://..../product.jpg",
        role: "product",
        description: "Nike sneakers to showcase",
      },
    ],
  }),
});
```

## Current Implementation Status

✅ **Backend Infrastructure** - Complete

- `ReferenceImage` model defined
- `ImageGenerator` interface updated
- `GeminiProvider` supports multi-image references
- Role-specific prompt generation

✅ **Story Generation** - Implemented

- Avatar automatically added as reference [1]
- Support for additional references (commented for future use)
- Clear image labeling in prompts

🔄 **Frontend** - Ready for extension

- Can pass `reference_images` array in API calls
- Backend will process and use them

## Future Enhancements

1. **Auto-fetching** - Automatically fetch and process product images from URLs
2. **Image preprocessing** - Consistent resizing, format conversion
3. **Reference library** - Save commonly used references (products, locations)
4. **Multi-story consistency** - Track references across multiple story generations
5. **Advanced roles** - Support for "style", "lighting", "composition" references
