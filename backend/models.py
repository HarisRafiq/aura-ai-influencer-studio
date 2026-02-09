from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class PostCreationStatus(str, Enum):
    PENDING = "pending"
    GENERATING_STORY = "generating_story"
    GENERATING_IMAGES = "generating_images"
    GENERATING_VIDEO = "generating_video"
    VIDEO_READY = "video_ready"
    VIDEO_FAILED = "video_failed"
    READY = "ready"
    PUBLISHED = "published"
    FAILED = "failed"

class InfluencerData(BaseModel):
    name: str
    niches: List[str]
    bio: str
    avatar_url: Optional[str] = None
    tone: Optional[str] = "Professional"
    location: Optional[str] = "New York, USA"
    coordinates: Optional[Dict[str, float]] = None # {"lat": 0.0, "lng": 0.0}

class ChatSessionData(BaseModel):
    influencer_id: str
    action_type: str # promotion, explore, travel, idea, content creation
    context: Optional[Dict[str, Any]] = None
    conversation: List[Dict[str, Any]] = []


class AgentSessionPhase(str, Enum):
    """Phase of agent conversation session"""
    CATEGORY_SELECTION = "category_selection"
    CONVERSATION = "conversation"
    GENERATING = "generating"
    COMPLETE = "complete"
    # Autonomous agent phases
    AUTONOMOUS = "autonomous"  # Agent is running autonomously
    WAITING_INPUT = "waiting_input"  # Agent needs user input


class AgentSessionData(BaseModel):
    """Data model for agent conversation sessions"""
    influencer_id: str
    phase: AgentSessionPhase = AgentSessionPhase.CATEGORY_SELECTION
    category: Optional[str] = None  # news, guide, review, event, travel, product
    conversation_history: List[Dict[str, Any]] = []  # [{"role": "assistant|user", "content": str, "timestamp": datetime}]
    current_options: List[str] = []  # Current 4 options being presented
    current_question: Optional[str] = None
    can_generate: bool = False
    search_data: Optional[Dict[str, Any]] = None  # Cached search results
    discovery_answers: Dict[str, Any] = {}  # User's accumulated choices
    generated_post_id: Optional[str] = None  # Post ID after generation
    error: Optional[str] = None


class AutonomousSessionData(BaseModel):
    """Data model for autonomous agent sessions"""
    influencer_id: str
    goal: str  # What the user wants to create (free-form)
    phase: AgentSessionPhase = AgentSessionPhase.AUTONOMOUS
    context: List[Dict[str, Any]] = []  # Accumulated research/findings
    pending_question: Optional[str] = None  # Question waiting for user response
    generated_post_id: Optional[str] = None
    error: Optional[str] = None


class OrchestratorPhase(str, Enum):
    """Phase of orchestrator session"""
    PLANNING = "planning"
    PLAN_REVIEW = "plan_review"
    RESEARCH = "research"
    SELECTION = "selection"
    GENERATION = "generation"
    COMPLETE = "complete"
    ERROR = "error"


class SubTask(BaseModel):
    """Single research sub-task"""
    id: str
    name: str
    queries: List[str]
    status: str = "pending"  # pending, in_progress, complete, failed
    error: Optional[str] = None


class WebItem(BaseModel):
    """Web search result item"""
    id: str
    title: str
    snippet: str
    url: str


class ImageItem(BaseModel):
    """Image search result item"""
    id: str
    thumbnail: str
    image_url: str
    title: str


class SubTaskResults(BaseModel):
    """Results for a single sub-task"""
    web_items: List[WebItem] = []
    images: List[ImageItem] = []


class UserSelections(BaseModel):
    """User's selected items"""
    web_item_ids: List[str] = []
    image_ids: List[str] = []


class GeneratedPost(BaseModel):
    """Final generated post data"""
    slide_count: int
    grid_layout: str
    slide_urls: List[str]
    caption: str
    posting_id: Optional[str] = None


class OrchestratorSessionData(BaseModel):
    """Data model for orchestrator sessions"""
    session_id: str
    influencer_id: str
    query: str
    post_type_hint: Optional[str] = None
    phase: OrchestratorPhase = OrchestratorPhase.PLANNING
    research_plan: List[SubTask] = []
    research_results: Dict[str, SubTaskResults] = {}
    user_selections: Optional[UserSelections] = None
    image_usage_plan: Optional[List[Dict[str, Any]]] = None
    generated_post: Optional[GeneratedPost] = None
    error: Optional[str] = None
    owner_id: Optional[str] = None


class StorySlide(BaseModel):
    caption: str
    visual_scene: str


class GeneratedPostContent(BaseModel):
    caption: str
    slides: List[StorySlide]


class PostingData(BaseModel):
    influencer_id: str
    content: str
    status: PostCreationStatus = PostCreationStatus.READY
    prompt: Optional[str] = None
    platform: str = "Instagram"
    reference_image_url: Optional[str] = None
    generated_content: Optional[GeneratedPostContent] = None
    image_urls: List[str] = []
    error: Optional[str] = None
    image_slides: Optional[List[Dict[str, Any]]] = None
    video_urls: Optional[List[str]] = None


class PostingCreateRequest(BaseModel):
    influencer_id: str
    prompt: str
    platform: str = "Instagram"
    reference_image_url: Optional[str] = None
    reference_images: Optional[List[Dict[str, str]]] = None # [{"url": "...", "role": "product", "description": "..."}]

class SuggestionData(BaseModel):
    influencer_id: str
    type: str # travel, content, style
    title: str
    description: str
    metadata: Dict[str, Any] = {}

class LocationData(BaseModel):
    name: str
    description: Optional[str] = None
    coordinates: Dict[str, float]
    category: Optional[str] = None # restaurant, park, etc.

class EntitySchema(BaseModel):
    kind: str = Field(..., example="influencer") # influencer, posting, suggestion, location
    data: Dict[str, Any] = Field(...)
    owner_id: Optional[str] = None # For multi-user support
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class UpdateEntitySchema(BaseModel):
    data: Optional[Dict[str, Any]]
    updated_at: datetime = Field(default_factory=datetime.utcnow)

def ResponseModel(data, message):
    return {
        "data": data,
        "code": 200,
        "message": message,
    }

def ErrorResponseModel(error, code, message):
    return {"error": error, "code": code, "message": message}
