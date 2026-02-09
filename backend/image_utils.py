import requests
from PIL import Image, ImageFilter
from io import BytesIO
import uuid
import os
from typing import List, Optional, Tuple

# Ensure upload directory exists
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
from moviepy import VideoFileClip


def fit_image_to_panel(
    image: Image.Image,
    target_width: int,
    target_height: int,
    fit_mode: str = "contain",
    background_color: Tuple[int, int, int] = (0, 0, 0),
    background_style: Optional[str] = None
) -> Image.Image:
    """
    Fits an image to target dimensions without distortion, maximizing size.
    
    Args:
        image: Source PIL Image
        target_width: Target panel width in pixels
        target_height: Target panel height in pixels
        fit_mode: 
            - "contain": Scale to fit inside (letterbox/pillarbox), NO CROPPING
            - "cover": Scale to fill entirely (crop excess)
        background_color: Fill color for letterbox bars (RGB tuple)
        background_style: Background treatment for letterbox bars:
            - None/"solid": Use background_color
            - "blur": Blurred version of source image as background
    
    Returns:
        PIL Image at exact target dimensions
    """
    # Calculate aspect ratios
    source_aspect = image.width / image.height
    target_aspect = target_width / target_height
    
    if fit_mode == "contain":
        # Scale to fit INSIDE panel (no cropping, may add letterbox/pillarbox)
        scale = min(target_width / image.width, target_height / image.height)
        new_width = int(image.width * scale)
        new_height = int(image.height * scale)
        
        # Resize image maintaining aspect ratio
        resized = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Create background canvas
        if background_style == "blur":
            # Create blurred background from stretched source image
            canvas = image.resize((target_width, target_height), Image.Resampling.LANCZOS)
            canvas = canvas.filter(ImageFilter.GaussianBlur(radius=20))
            # Optional: darken the background for better contrast
            from PIL import ImageEnhance
            enhancer = ImageEnhance.Brightness(canvas)
            canvas = enhancer.enhance(0.5)  # 50% brightness
        else:
            # Solid color background
            canvas = Image.new('RGB', (target_width, target_height), background_color)
        
        # Paste resized image centered on canvas
        paste_x = (target_width - new_width) // 2
        paste_y = (target_height - new_height) // 2
        canvas.paste(resized, (paste_x, paste_y))
        
        return canvas
    
    elif fit_mode == "cover":
        # Scale to COVER panel (fill completely, may crop)
        scale = max(target_width / image.width, target_height / image.height)
        new_width = int(image.width * scale)
        new_height = int(image.height * scale)
        
        # Resize image
        resized = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Center crop to exact target size
        left = (new_width - target_width) // 2
        top = (new_height - target_height) // 2
        cropped = resized.crop((left, top, left + target_width, top + target_height))
        
        return cropped
    
    else:
        raise ValueError(f"Invalid fit_mode: {fit_mode}. Use 'contain' or 'cover'.")

def split_grid_image(image_url: str) -> List[str]:
    """
    Downloads a 2x2 grid image from the given URL, splits it into 4 quadrants,
    saves them locally, and returns the list of local URLs (relative paths).
    """
    try:
        # Download image
        response = requests.get(image_url)
        response.raise_for_status()
        img = Image.open(BytesIO(response.content))
        
        width, height = img.size
        mid_x = width // 2
        mid_y = height // 2
        
        # Define 4 quadrants: Top-Left, Top-Right, Bottom-Left, Bottom-Right
        quadrants = [
            (0, 0, mid_x, mid_y), 
            (mid_x, 0, width, mid_y),
            (0, mid_y, mid_x, height),
            (mid_x, mid_y, width, height)
        ]
        
        saved_urls = []
        
        for i, box in enumerate(quadrants):
            crop = img.crop(box)
            
            # Save to buffer
            buf = BytesIO()
            crop.save(buf, format="PNG")
            buf.seek(0)
            
            filename = f"split_{uuid.uuid4()}.png"
            save_path = os.path.join(UPLOAD_DIR, filename)
            
            with open(save_path, "wb") as f:
                f.write(buf.getvalue())
            
            # Construct URL
            # Ideally this should be an absolute URL or relative handled by frontend
            # For now returning relative path to be served by static mount
            slide_url = f"http://localhost:8000/{UPLOAD_DIR}/{filename}"
            saved_urls.append(slide_url)
            
        return saved_urls

    except Exception as e:
        print(f"Error splitting image: {e}")
        raise e


def split_grid_image_from_bytes(image_data: bytes) -> List[str]:
    """
    Splits a 2x2 grid image from raw bytes into 4 quadrants,
    saves them locally, and returns the list of local URLs.
    This avoids network issues when the R2 URL isn't accessible.
    """
    try:
        img = Image.open(BytesIO(image_data))
        
        width, height = img.size
        mid_x = width // 2
        mid_y = height // 2
        
        # Define 4 quadrants: Top-Left, Top-Right, Bottom-Left, Bottom-Right
        quadrants = [
            (0, 0, mid_x, mid_y), 
            (mid_x, 0, width, mid_y),
            (0, mid_y, mid_x, height),
            (mid_x, mid_y, width, height)
        ]
        
        saved_urls = []
        
        for i, box in enumerate(quadrants):
            crop = img.crop(box)
            
            # Save to buffer
            buf = BytesIO()
            crop.save(buf, format="PNG")
            buf.seek(0)
            
            filename = f"split_{uuid.uuid4()}.png"
            save_path = os.path.join(UPLOAD_DIR, filename)
            
            with open(save_path, "wb") as f:
                f.write(buf.getvalue())
            
            # Construct URL
            slide_url = f"http://localhost:8000/{UPLOAD_DIR}/{filename}"
            saved_urls.append(slide_url)
            
        print(f"[Image Utils] Split grid into {len(saved_urls)} quadrants")
        return saved_urls

    except Exception as e:
        print(f"Error splitting image from bytes: {e}")
        raise e


def split_grid_flexible(image_bytes: bytes, rows: int, cols: int) -> List[bytes]:
    """
    Splits a grid image into panels based on rows and columns.
    Returns list of panel image bytes in reading order (left-to-right, top-to-bottom).
    
    Supports: 1x2, 2x1, 2x2, 2x3, 3x2 layouts.
    
    Args:
        image_bytes: Raw image bytes
        rows: Number of rows in grid
        cols: Number of columns in grid
    
    Returns:
        List of image bytes for each panel in reading order
    """
    try:
        img = Image.open(BytesIO(image_bytes))
        width, height = img.size
        
        panel_width = width // cols
        panel_height = height // rows
        
        panels = []
        
        # Iterate in reading order: top to bottom, left to right
        for row in range(rows):
            for col in range(cols):
                x1 = col * panel_width
                y1 = row * panel_height
                x2 = x1 + panel_width
                y2 = y1 + panel_height
                
                panel = img.crop((x1, y1, x2, y2))
                
                buf = BytesIO()
                panel.save(buf, format="JPEG", quality=90)
                buf.seek(0)
                panels.append(buf.getvalue())
        
        print(f"[Image Utils] Split {rows}x{cols} grid into {len(panels)} panels")
        return panels
        
    except Exception as e:
        print(f"Error splitting grid {rows}x{cols}: {e}")
        raise e


def split_2x2_grid_video(video_url: str, r2_utils=None) -> List[str]:
    """
    Downloads a 2x2 grid video from the given URL, splits it into 4 quadrants using moviepy,
    uploads them to R2 (or saves locally if R2 not available), and returns the list of URLs.
    
    Args:
        video_url: URL of the 2x2 grid video to split
        r2_utils: Optional R2Utils instance for uploading to R2 storage
    
    Requires moviepy package: pip install moviepy
    moviepy will automatically download ffmpeg binaries if needed.
    """
    try:
        
        # Download video
        response = requests.get(video_url)
        response.raise_for_status()
        
        # Save temporary input video
        input_filename = f"temp_grid_{uuid.uuid4()}.mp4"
        input_path = os.path.join(UPLOAD_DIR, input_filename)
        
        with open(input_path, "wb") as f:
            f.write(response.content)
        
        # Load video
        video = VideoFileClip(input_path)
        
        width, height = video.size
        mid_x = width // 2
        mid_y = height // 2
        
        # Define 4 quadrants with crop parameters (x1, y1, x2, y2)
        # Top-Left, Top-Right, Bottom-Left, Bottom-Right
        crops = [
            (0, 0, mid_x, mid_y),
            (mid_x, 0, width, mid_y),
            (0, mid_y, mid_x, height),
            (mid_x, mid_y, width, height)
        ]
        
        saved_urls = []
        temp_files = []  # Track temp files for cleanup
        
        for i, (x1, y1, x2, y2) in enumerate(crops):
            output_filename = f"split_video_{uuid.uuid4()}.mp4"
            output_path = os.path.join(UPLOAD_DIR, output_filename)
            temp_files.append(output_path)
            
            # Crop video
            cropped = video.cropped(x1=x1, y1=y1, x2=x2, y2=y2)
            
            # Write cropped video
            cropped.write_videofile(
                output_path,
                codec='libx264',
                audio_codec='aac',
                temp_audiofile=f'temp-audio-{uuid.uuid4()}.m4a',
                remove_temp=True,
                logger=None  # Suppress moviepy progress bars
            )
            
            # Close clips to free memory
            cropped.close()
            
            # Upload to R2 if available
            if r2_utils:
                try:
                    r2_filename = f"videos/{output_filename}"
                    video_url_result = r2_utils.upload_file_from_filename_to_r2(
                        r2_filename, 
                        output_path,
                        content_type='video/mp4'
                    )
                    saved_urls.append(video_url_result)
                    print(f"[Image Utils] Uploaded split video {i+1}/4 to R2: {video_url_result}")
                except Exception as e:
                    print(f"[Image Utils] Failed to upload to R2, using local URL: {e}")
                    video_url_result = f"http://localhost:8000/{UPLOAD_DIR}/{output_filename}"
                    saved_urls.append(video_url_result)
            else:
                # Fallback to local URL
                video_url_result = f"http://localhost:8000/{UPLOAD_DIR}/{output_filename}"
                saved_urls.append(video_url_result)
        
        # Close original video and clean up
        video.close()
        os.remove(input_path)
        
        # Clean up temp files if uploaded to R2
        if r2_utils:
            for temp_file in temp_files:
                try:
                    if os.path.exists(temp_file):
                        os.remove(temp_file)
                        print(f"[Image Utils] Cleaned up temp file: {temp_file}")
                except Exception as e:
                    print(f"[Image Utils] Failed to cleanup temp file {temp_file}: {e}")
        
        print(f"[Image Utils] Split video into {len(saved_urls)} quadrants")
        return saved_urls
        
    except ImportError:
        raise Exception("moviepy package not installed. Install with: pip install moviepy")
    except Exception as e:
        print(f"Error splitting video: {e}")
        raise e
