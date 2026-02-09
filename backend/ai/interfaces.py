from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from pydantic import BaseModel

class ReferenceImage(BaseModel):
    image_data: str # base64 or URL
    label: str
    role: str
    description: str

class TextGenerator(ABC):
    @abstractmethod
    async def generate(self, prompt: str, schema: Optional[Dict[str, Any]] = None, **kwargs) -> Any:
        pass

class ImageGenerator(ABC):
    @abstractmethod
    async def generate_image(
        self, 
        prompt: str, 
        reference_images: Optional[List[ReferenceImage]] = None,
        **kwargs
    ) -> Any:
        pass

class VideoGenerator(ABC):
    @abstractmethod
    async def generate_video(
        self,
        prompt: str,
        image_url: str,
        duration: int = 5,
        **kwargs
    ) -> Any:
        pass
