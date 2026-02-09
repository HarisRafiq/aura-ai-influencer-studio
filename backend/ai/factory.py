import os
from typing import Optional, Dict, Any
from backend.ai.interfaces import TextGenerator, ImageGenerator, VideoGenerator
from backend.ai.gemini_provider import GeminiProvider
from backend.ai.fal_provider import FalProvider
from backend.r2_utils import R2Utils

_providers: Dict[str, Any] = {}

def get_r2_utils() -> Optional[R2Utils]:
    if "r2" in _providers:
        return _providers["r2"]
        
    bucket = os.getenv("R2_BUCKET_NAME")
    account_id = os.getenv("R2_ACCOUNT_ID")
    access_key = os.getenv("R2_ACCESS_KEY_ID")
    secret_key = os.getenv("R2_SECRET_ACCESS_KEY")
    public_url = os.getenv("R2_PUBLIC_ENDPOINT")
    
    if all([bucket, account_id, access_key, secret_key]):
        _providers["r2"] = R2Utils(bucket, account_id, access_key, secret_key, public_url)
        return _providers["r2"]
    return None

def get_provider(type: str) -> Any:
    """Generic provider getter with caching."""
    provider_name = os.getenv(f"AI_{type.upper()}_PROVIDER", "gemini").lower()
    cache_key = f"{type}_{provider_name}"
    
    if cache_key in _providers:
        return _providers[cache_key]
    
    r2 = get_r2_utils()
    
    if provider_name == "gemini":
        api_key = os.getenv("API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not found")
        instance = GeminiProvider(api_key=api_key, r2_utils=r2)
    elif provider_name == "fal":
        api_key = os.getenv("FAL_KEY")
        if not api_key:
            raise ValueError("FAL_KEY not found")
        instance = FalProvider(api_key=api_key, r2_utils=r2)
    else:
        raise ValueError(f"Unsupported provider: {provider_name}")
        
    _providers[cache_key] = instance
    return instance

def get_text_provider() -> TextGenerator:
    return get_provider("text")

def get_image_provider() -> ImageGenerator:
    return get_provider("image")

def get_video_provider() -> VideoGenerator:
    return get_provider("video")
