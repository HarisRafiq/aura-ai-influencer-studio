"""
Creation Session Model for multi-step influencer creation flow.
Persists session state in MongoDB for resumable flows and background task tracking.
"""
from enum import Enum
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime


class CreationSessionStatus(str, Enum):
    PENDING = "pending"
    GENERATING_IMAGES = "generating_images"
    IMAGES_READY = "images_ready"
    GENERATING_PERSONA = "generating_persona"
    PERSONA_READY = "persona_ready"
    COMPLETE = "complete"
    FAILED = "failed"


class CreationSessionCreate(BaseModel):
    """Request model for starting a new creation session."""
    location: str
    prompt: str


class CreationSessionSelect(BaseModel):
    """Request model for selecting an avatar."""
    avatar_url: str


class CreationSessionUpdate(BaseModel):
    """Request model for updating persona before confirmation."""
    name: Optional[str] = None
    bio: Optional[str] = None
    niches: Optional[List[str]] = None
    handle: Optional[str] = None


class GeneratedPersona(BaseModel):
    """Generated persona data."""
    name: str
    handle: str
    bio: str
    niches: List[str]
    traits: List[str] = []
    timezone: str = "America/New_York"
    tone: str = "Professional"
    visualDescription: str = ""
    platformFocus: str = "Instagram"


class CreationSession(BaseModel):
    """Full creation session state."""
    id: str
    owner_id: str
    status: CreationSessionStatus = CreationSessionStatus.PENDING
    location: str
    prompt: str
    avatar_urls: List[str] = []
    selected_avatar_url: Optional[str] = None
    generated_persona: Optional[GeneratedPersona] = None
    influencer_id: Optional[str] = None
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


def session_helper(session: dict) -> dict:
    """Convert MongoDB document to API response."""
    return {
        "id": str(session["_id"]),
        "owner_id": session.get("owner_id"),
        "status": session.get("status"),
        "location": session.get("location"),
        "prompt": session.get("prompt"),
        "avatar_urls": session.get("avatar_urls", []),
        "selected_avatar_url": session.get("selected_avatar_url"),
        "generated_persona": session.get("generated_persona"),
        "influencer_id": session.get("influencer_id"),
        "error": session.get("error"),
        "created_at": session.get("created_at"),
        "updated_at": session.get("updated_at"),
    }
