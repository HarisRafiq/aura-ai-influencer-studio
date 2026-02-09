"""
Creation Router - Multi-step influencer creation with background processing.
Handles session-based creation flow with non-blocking LLM/image generation.
"""
import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from bson import ObjectId
from datetime import datetime
from typing import Optional

from backend.database import entities_collection, creation_sessions_collection, entity_helper
from backend.creation_session import (
    CreationSessionCreate, CreationSessionSelect, CreationSessionUpdate,
    CreationSessionStatus, GeneratedPersona, session_helper
)
from backend.auth import get_current_user
from backend.ai.factory import get_image_provider, get_text_provider, get_r2_utils
from backend.image_utils import split_grid_image_from_bytes
from backend.r2_utils import R2Utils
from backend.sse_manager import sse_manager
import uuid

router = APIRouter()


async def generate_avatars_background(session_id: str, location: str, prompt: str):
    """
    Background task: Generate 2x2 grid image, split into 4 quadrants, upload to R2.
    Updates session status as it progresses.
    """
    try:
        # Update status to generating
        await creation_sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"status": CreationSessionStatus.GENERATING_IMAGES, "updated_at": datetime.utcnow()}}
        )
        
        # Broadcast status update via SSE
        await sse_manager.broadcast(
            f"session:{session_id}",
            "status_update",
            {"status": CreationSessionStatus.GENERATING_IMAGES, "message": "Generating avatar images..."}
        )
        
        # Build image prompt for 2x2 grid of diverse headshots
        image_prompt = f"""Create a 2x2 grid of 4 different professional influencer headshots.
Each quadrant should show a DIFFERENT person with unique look.
All should be realistic, photogenic individuals suitable for social media influencing.

Location/Setting context: {location}
Vibe/Style: {prompt}

Requirements:
- 4 distinct individuals in 2x2 grid layout
- Professional headshot style, shoulders up
- Good lighting, high quality
- Diverse appearances (different hair, features, styles)
- Each person should match the vibe: {prompt}
"""
        
        # Generate the 2x2 grid image
        image_provider = get_image_provider()
        result = await image_provider.generate_image(image_prompt)
        
        if not result or "data" not in result:
            raise Exception("Image generation returned no data")
        
        # Split the grid into 4 quadrants
        image_bytes = result["data"]
        
        # Use existing split function - but we need R2 upload
        r2 = get_r2_utils()
        avatar_urls = []
        
        if r2:
            # Split and upload to R2
            from PIL import Image
            from io import BytesIO
            
            img = Image.open(BytesIO(image_bytes))
            width, height = img.size
            mid_x = width // 2
            mid_y = height // 2
            
            quadrants = [
                (0, 0, mid_x, mid_y),
                (mid_x, 0, width, mid_y),
                (0, mid_y, mid_x, height),
                (mid_x, mid_y, width, height)
            ]
            
            for i, box in enumerate(quadrants):
                crop = img.crop(box)
                buf = BytesIO()
                crop.save(buf, format="PNG")
                buf.seek(0)
                
                filename = f"avatars/{session_id}_{i}_{uuid.uuid4()}.png"
                url = r2.upload_file_to_r2(filename, buf.getvalue(), content_type="image/png")
                avatar_urls.append(url)
                print(f"[Creation] Uploaded avatar {i+1}: {url}")
        else:
            # Fallback: use local split function
            avatar_urls = split_grid_image_from_bytes(image_bytes)
        
        # Update session with avatar URLs
        await creation_sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {
                "$set": {
                    "status": CreationSessionStatus.IMAGES_READY,
                    "avatar_urls": avatar_urls,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        print(f"[Creation] Session {session_id} images ready: {len(avatar_urls)} avatars")
        
        # Broadcast success via SSE
        await sse_manager.broadcast(
            f"session:{session_id}",
            "status_update",
            {
                "status": CreationSessionStatus.IMAGES_READY,
                "avatar_urls": avatar_urls,
                "message": "Avatars ready! Choose one to continue."
            }
        )
        
    except Exception as e:
        print(f"[Creation] Background image generation failed: {e}")
        await creation_sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {
                "$set": {
                    "status": CreationSessionStatus.FAILED,
                    "error": str(e),
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Broadcast failure via SSE
        await sse_manager.broadcast(
            f"session:{session_id}",
            "status_update",
            {"status": CreationSessionStatus.FAILED, "error": str(e), "message": "Avatar generation failed"}
        )


async def generate_persona_background(session_id: str, location: str, prompt: str, avatar_url: str):
    """
    Background task: Generate influencer persona using LLM.
    Updates session with generated name, bio, niches, etc.
    """
    try:
        await creation_sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"status": CreationSessionStatus.GENERATING_PERSONA, "updated_at": datetime.utcnow()}}
        )
        
        # Broadcast status update via SSE
        await sse_manager.broadcast(
            f"session:{session_id}",
            "status_update",
            {"status": CreationSessionStatus.GENERATING_PERSONA, "message": "Generating persona..."}
        )
        
        text_provider = get_text_provider()
        
        persona_prompt = f"""Generate a complete influencer persona based on these inputs:

Location: {location}
Vibe/Style Description: {prompt}

Create a realistic, engaging social media influencer profile. Return JSON with these exact fields:
{{
    "name": "Full realistic name",
    "handle": "@username (lowercase, no spaces)",
    "bio": "Engaging 1-2 sentence bio for social media",
    "niches": ["niche1", "niche2", "niche3"],
    "traits": ["personality_trait1", "trait2", "trait3"],
    "tone": "Communication style (e.g., Casual, Professional, Witty)",
    "platformFocus": "Primary platform (Instagram, TikTok, YouTube)",
    "visualDescription": "Brief description of their visual style/aesthetic"
}}

Make it authentic and engaging. The name should match the cultural context of the location."""

        schema = {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "handle": {"type": "string"},
                "bio": {"type": "string"},
                "niches": {"type": "array", "items": {"type": "string"}},
                "traits": {"type": "array", "items": {"type": "string"}},
                "tone": {"type": "string"},
                "platformFocus": {"type": "string"},
                "visualDescription": {"type": "string"}
            },
            "required": ["name", "handle", "bio", "niches"]
        }
        
        result = await text_provider.generate(persona_prompt, schema=schema)
        
        # Build persona object
        persona = {
            "name": result.get("name", "New Influencer"),
            "handle": result.get("handle", "@influencer"),
            "bio": result.get("bio", ""),
            "niches": result.get("niches", []),
            "traits": result.get("traits", []),
            "tone": result.get("tone", "Professional"),
            "platformFocus": result.get("platformFocus", "Instagram"),
            "visualDescription": result.get("visualDescription", ""),
            "timezone": "America/New_York"  # Default, could be derived from location
        }
        
        await creation_sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {
                "$set": {
                    "status": CreationSessionStatus.PERSONA_READY,
                    "generated_persona": persona,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        print(f"[Creation] Session {session_id} persona ready: {persona['name']}")
        
        # Broadcast success via SSE
        await sse_manager.broadcast(
            f"session:{session_id}",
            "status_update",
            {
                "status": CreationSessionStatus.PERSONA_READY,
                "persona": persona,
                "message": f"Meet {persona['name']}! Review and confirm to create."
            }
        )
        
    except Exception as e:
        print(f"[Creation] Background persona generation failed: {e}")
        await creation_sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {
                "$set": {
                    "status": CreationSessionStatus.FAILED,
                    "error": str(e),
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        # Broadcast failure via SSE
        await sse_manager.broadcast(
            f"session:{session_id}",
            "status_update",
            {"status": CreationSessionStatus.FAILED, "error": str(e), "message": "Persona generation failed"}
        )


@router.post("/start", response_description="Start new influencer creation session")
async def start_creation(
    request: CreationSessionCreate,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user)
):
    """
    Initialize a new creation session and start background image generation.
    Returns immediately with session ID for polling.
    """
    session_doc = {
        "owner_id": user_id,
        "status": CreationSessionStatus.PENDING,
        "location": request.location,
        "prompt": request.prompt,
        "avatar_urls": [],
        "selected_avatar_url": None,
        "generated_persona": None,
        "influencer_id": None,
        "error": None,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await creation_sessions_collection.insert_one(session_doc)
    session_id = str(result.inserted_id)
    
    # Start background image generation
    background_tasks.add_task(
        generate_avatars_background,
        session_id,
        request.location,
        request.prompt
    )
    
    session_doc["_id"] = result.inserted_id
    return session_helper(session_doc)


@router.get("/{session_id}", response_description="Get creation session state")
async def get_session(
    session_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Get current session state. Used for polling during background processing.
    """
    session = await creation_sessions_collection.find_one({
        "_id": ObjectId(session_id),
        "owner_id": user_id
    })
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return session_helper(session)


@router.get("/", response_description="Get active creation session")
async def get_active_session(
    user_id: str = Depends(get_current_user)
):
    """
    Get the user's current incomplete creation session, if any.
    Returns the most recent non-complete, non-failed session.
    """
    active_statuses = [
        CreationSessionStatus.PENDING,
        CreationSessionStatus.GENERATING_IMAGES,
        CreationSessionStatus.IMAGES_READY,
        CreationSessionStatus.GENERATING_PERSONA,
        CreationSessionStatus.PERSONA_READY,
    ]
    
    session = await creation_sessions_collection.find_one(
        {
            "owner_id": user_id,
            "status": {"$in": active_statuses}
        },
        sort=[("created_at", -1)]
    )
    
    if not session:
        return {"session": None}
    
    return {"session": session_helper(session)}


@router.delete("/{session_id}", response_description="Discard creation session")
async def discard_session(
    session_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Discard/delete a creation session. Used when user wants to start over.
    """
    result = await creation_sessions_collection.delete_one({
        "_id": ObjectId(session_id),
        "owner_id": user_id
    })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return {"message": "Session discarded successfully"}


@router.post("/{session_id}/select", response_description="Select avatar and generate persona")
async def select_avatar(
    session_id: str,
    request: CreationSessionSelect,
    background_tasks: BackgroundTasks,
    user_id: str = Depends(get_current_user)
):
    """
    User selects an avatar. Triggers background persona generation.
    """
    session = await creation_sessions_collection.find_one({
        "_id": ObjectId(session_id),
        "owner_id": user_id
    })
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session["status"] != CreationSessionStatus.IMAGES_READY:
        raise HTTPException(status_code=400, detail=f"Session not ready for selection. Status: {session['status']}")
    
    if request.avatar_url not in session["avatar_urls"]:
        raise HTTPException(status_code=400, detail="Invalid avatar URL")
    
    # Update selected avatar
    await creation_sessions_collection.update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "selected_avatar_url": request.avatar_url,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    # Start background persona generation
    background_tasks.add_task(
        generate_persona_background,
        session_id,
        session["location"],
        session["prompt"],
        request.avatar_url
    )
    
    # Return updated session
    updated = await creation_sessions_collection.find_one({"_id": ObjectId(session_id)})
    return session_helper(updated)


@router.post("/{session_id}/confirm", response_description="Confirm and create influencer")
async def confirm_creation(
    session_id: str,
    updates: Optional[CreationSessionUpdate] = None,
    user_id: str = Depends(get_current_user)
):
    """
    User confirms the persona. Creates the influencer entity in the database.
    Optionally accepts updates to name/bio/niches before creation.
    """
    session = await creation_sessions_collection.find_one({
        "_id": ObjectId(session_id),
        "owner_id": user_id
    })
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session["status"] != CreationSessionStatus.PERSONA_READY:
        raise HTTPException(status_code=400, detail=f"Session not ready for confirmation. Status: {session['status']}")
    
    persona = session["generated_persona"]
    
    # Apply any user updates
    if updates:
        if updates.name:
            persona["name"] = updates.name
        if updates.bio:
            persona["bio"] = updates.bio
        if updates.niches:
            persona["niches"] = updates.niches
        if updates.handle:
            persona["handle"] = updates.handle
    
    # Create influencer entity
    influencer_data = {
        "name": persona["name"],
        "handle": persona.get("handle", f"@{persona['name'].lower().replace(' ', '')}"),
        "bio": persona["bio"],
        "niches": persona["niches"],
        "niche": persona["niches"][0] if persona["niches"] else "Lifestyle",
        "traits": persona.get("traits", []),
        "tone": persona.get("tone", "Professional"),
        "visualDescription": persona.get("visualDescription", ""),
        "platformFocus": persona.get("platformFocus", "Instagram"),
        "location": session["location"],
        "timezone": persona.get("timezone", "America/New_York"),
        "avatarUrl": session["selected_avatar_url"]
    }
    
    influencer_entity = {
        "kind": "influencer",
        "data": influencer_data,
        "owner_id": user_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    
    result = await entities_collection.insert_one(influencer_entity)
    influencer_id = str(result.inserted_id)
    
    # Update session as complete
    await creation_sessions_collection.update_one(
        {"_id": ObjectId(session_id)},
        {
            "$set": {
                "status": CreationSessionStatus.COMPLETE,
                "influencer_id": influencer_id,
                "updated_at": datetime.utcnow()
            }
        }
    )
    
    # Return created influencer
    created = await entities_collection.find_one({"_id": result.inserted_id})
    return {
        "message": "Influencer created successfully",
        "influencer": entity_helper(created)
    }
