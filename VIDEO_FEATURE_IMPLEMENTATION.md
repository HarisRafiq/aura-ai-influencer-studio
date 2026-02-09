# Video Generation Feature Implementation

## Overview

Added video generation capability that converts multi-slide (2x2 grid) posts into videos. Each slide image can be transformed into a short video clip using AI image-to-video generation.

## Changes Made

### Backend Changes

#### 1. AI Provider Interface Extensions

**File:** [backend/ai/interfaces.py](backend/ai/interfaces.py)

- Added `VideoGenerator` abstract base class with `generate_video()` method
- Supports image-to-video conversion with configurable duration (5 or 10 seconds)

#### 2. Video Provider Implementation

**File:** [backend/ai/gemini_provider.py](backend/ai/gemini_provider.py)

- Extended `GeminiProvider` to implement `VideoGenerator` interface
- Added `generate_video()` method using **Google Gemini Veo 3.1 Fast**: `veo-3.1-flash-001`
- Supports image-to-video conversion with 5-10 second duration
- Returns video as MP4 with natural motion and scene consistency

#### 3. Video Splitting Utility

**File:** [backend/image_utils.py](backend/image_utils.py)

- Added `split_2x2_grid_video()` function using **moviepy** (pure Python library)
- Downloads 2x2 grid video and splits into 4 quadrant video clips
- Mirrors the existing `split_2x2_grid_image()` functionality for videos
- **No system dependencies required** - moviepy bundles ffmpeg binaries automatically

#### 4. Video Generation Endpoint

**File:** [backend/ai_routes.py](backend/ai_routes.py)

- Added `/ai/generate-video-from-story` POST endpoint
- Takes post ID and slides array (with imageUrls and captions)
- Generates video for each slide image using motion prompts
- Uses **Gemini Veo 3.1 Fast** (configurable via `AI_VIDEO_PROVIDER` env var)
- Updates post in database with video URLs and status
- Returns array of video URLs with metadata

**Request Schema:**

```python
{
  "post_id": "string",
  "slides": [
    {"imageUrl": "...", "caption": "...", "slideIndex": 0}
  ],
  "duration": 5  # or 10
}
```

**Response Schema:**

```python
{
  "success": true,
  "videoUrls": [
    {
      "slideIndex": 0,
      "videoUrl": "...",
      "imageUrl": "...",
      "caption": "..."
    }
  ],
  "post_id": "..."
}
```

### Frontend Changes

#### 5. TypeScript Type Definitions

**File:** [types.ts](types.ts)

- Added `VideoSlide` interface with slideIndex, videoUrl, imageUrl, caption
- Extended `Post` interface with:
  - `videoUrls?: VideoSlide[]` - array of generated video clips
  - `videoStatus?: 'pending' | 'processing' | 'ready' | 'failed'` - generation status
- Extended `StorySlide` interface with optional `videoUrl?: string`

#### 6. Feed Component Updates

**File:** [components/Feed.tsx](components/Feed.tsx)

**New Features:**

- **Video Generation Button**: Film icon button appears on multi-slide posts
  - Only shows if post has 2+ slides and no existing videos
  - Calls `/ai/generate-video-from-story` endpoint
  - Shows loading spinner during generation
- **Video Toggle Button**: Switch between image and video view
  - Only shows if post has generated videos
  - Toggles between showing images or videos in carousel
- **Video Playback**: Carousel now supports video elements
  - Detects if slide has video URL
  - Renders `<video>` element with controls, autoplay, loop, muted
  - Maintains caption overlay on videos
  - Autoplay only active slide for performance

**UI Flow:**

1. User sees Film icon on multi-slide posts
2. Clicks to generate videos → Shows loading spinner
3. Backend generates videos for each slide
4. Film icon changes to toggle button with pink highlight
5. User clicks toggle to switch between images/videos
6. Videos play in carousel with controls

## Technical Details

### Video Generation Process

1. Frontend sends post slides to `/ai/generate-video-from-story`
2. Backend iterates through each slide image
3. For each image:
   - Downloads the image from URL
   - Creates motion prompt from slide caption
   - Calls Gemini Veo 3.1 Fast API with image data
   - Receives generated video data
4. Uploads videos to R2 (or returns data URLs)
5. Updates post in MongoDB with video URLs array
6. Returns video URLs to frontend
7. Frontend updates UI to show toggle button

### Video Model: Gemini Veo 3.1 Fast

- **Model:** `veo-3.1-flash-001`
- **Provider:** Google Gemini
- **Input:** Image data + text prompt
- **Output:** MP4 video (uploaded to R2 or returned as base64)
- **Duration:** 5-10 seconds (configurable)
- **Quality:** High-quality with natural motion and scene consistency
- **Use Case:** Animate static images with cinematic motion for social media

### Alternative Considerations

The implementation includes a video splitting utility (`split_2x2_grid_video`) for future use cases where:

- A single 2x2 grid video needs to be split into 4 clips
- Batch processing videos instead of individual generation
- Currently not used but available for optimization

## Usage

### Prerequisites

- **Google API key** configured in backend environment (API_KEY or GOOGLE_API_KEY)
- Gemini API with Veo 3.1 access enabled
- Install Python dependencies: `pip install -r backend/requirements.txt`
  - moviepy (handles video processing with bundled ffmpeg)
  - imageio-ffmpeg (provides ffmpeg binaries as Python package)
  - httpx (for downloading images)

### Environment Variables

```bash
# Use Gemini for video generation (default)
API_KEY=your_google_api_key
AI_VIDEO_PROVIDER=gemini  # Default, can be omitted

# Optional: Switch to Fal for video generation
FAL_KEY=your_fal_api_key
AI_VIDEO_PROVIDER=fal
```

### For Users

1. Create a multi-slide story post using the Director modal
2. Wait for images to generate (4 slides)
3. Click the **Film** icon button below the post
4. Wait for videos to generate (~30-60 seconds per slide)
5. Click the **Film** toggle button to switch between images and videos
6. Videos autoplay in the carousel with controls

### API Usage

```typescript
// Generate videos for a post
const response = await api.post("/ai/generate-video-from-story", {
  post_id: post.id,
  slides: post.slides.map((slide, idx) => ({
    imageUrl: slide.imageUrl,
    caption: slide.caption,
    slideIndex: idx,
  })),
  duration: 5,
});

// Check response
if (response.data.success) {
  const videoUrls = response.data.videoUrls;
  // Update UI with video URLs
}
```

## Future Enhancements

### Potential Improvements

1. **Progress Tracking**: Show per-slide generation progress
2. **Batch Optimization**: Generate all slides in parallel instead of sequentially
3. **Video Splitting**: Use the 2x2 grid video approach for faster/cheaper generation
4. **Download Videos**: Add download button for generated videos
5. **Video Caching**: Store videos in R2 for persistence
6. **Model Selection**: Allow users to choose video generation model
7. **Duration Control**: Let users select 5s or 10s duration
8. **Motion Presets**: Predefined motion styles (zoom, pan, subtle, dramatic)
9. **Background Music**: Add audio tracks to videos
10. **Transitions**: Add transitions between video slides

### Performance Optimizations

- Cache generated videos in R2 for long-term storage
- Implement queue system for video generation
- Add retry logic for failed generations
- Pre-generate videos in background for popular posts

## Testing Checklist

- [ ] Video generation endpoint works with valid post data
- [ ] Video URLs are returned correctly
- [ ] Post is updated in database with video URLs
- [ ] Film button appears on multi-slide posts only
- [ ] Loading state shows during generation
- [ ] Toggle button appears after successful generation
- [ ] Videos play correctly in carousel
- [ ] Caption overlay displays on videos
- [ ] Autoplay works only for active slide
- [ ] Error handling for failed generation
- [ ] ffmpeg splitting utility works (if needed)

## Dependencies

### Python (Backend)

- `google-genai` - Already installed, now used for video generation via Veo 3.1
- `httpx` - For downloading images before sending to Gemini
- `moviepy` - Pure Python video processing library (for future video splitting)
- `imageio-ffmpeg` - Bundled ffmpeg binaries (no system install needed)
- `fal-client` - Optional fallback (set AI_VIDEO_PROVIDER=fal)
- No system dependencies required!

### TypeScript (Frontend)

- `lucide-react` - Already installed, added `Film` and `Loader2` icons
- No new dependencies required

## Notes

- Video generation takes ~10-30 seconds per slide with Gemini Veo 3.1 Fast
- Videos are uploaded to R2 storage (if configured) or returned as base64 data URLs
- Veo 3.1 Fast produces high-quality videos with natural motion
- **moviepy handles all video processing** - no system ffmpeg installation needed
- moviepy will auto-download ffmpeg binaries on first use
- Current implementation generates videos individually (not from 2x2 grid)
- Can switch to Fal provider by setting `AI_VIDEO_PROVIDER=fal` environment variable
