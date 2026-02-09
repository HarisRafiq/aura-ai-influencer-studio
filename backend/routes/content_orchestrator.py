"""
Content Orchestrator Routes - API endpoints for orchestrated post creation
"""
from fastapi import APIRouter, BackgroundTasks, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from bson import ObjectId

from backend.auth import get_current_user
from backend.database import entities_collection
from backend.models import (
    OrchestratorSessionData, OrchestratorPhase, SubTask,
    SubTaskResults, UserSelections, GeneratedPost
)
from backend.ai.content_orchestrator import ContentOrchestrator
from backend.ai.post_generator import generate_post_from_selections
from backend.sse_manager import sse_manager
import uuid
import base64

router = APIRouter()

# In-memory session storage (could be moved to MongoDB)
orchestrator_sessions: Dict[str, OrchestratorSessionData] = {}


class StartOrchestratorRequest(BaseModel):
    influencer_id: str
    query: str
    post_type_hint: Optional[str] = None
    session_id: Optional[str] = None  # Client-provided persistent session ID


class EditPlanRequest(BaseModel):
    research_plan: List[Dict[str, Any]]


class SelectionsRequest(BaseModel):
    web_item_ids: List[str]
    image_ids: List[str]


class RetrySubTaskRequest(BaseModel):
    custom_query: Optional[str] = None


async def planning_background_task(session_id: str, query: str, post_type_hint: Optional[str], influencer_data: Dict[str, Any]):
    """Background task for creating research plan"""
    try:
        channel = f"orchestrator:{session_id}"
        
        await sse_manager.broadcast(channel, "orch_planning", {
            "message": "Creating research plan..."
        })
        
        orchestrator = ContentOrchestrator()
        sub_tasks = await orchestrator.create_research_plan(query, post_type_hint, influencer_data)
        
        # Update session
        if session_id in orchestrator_sessions:
            session = orchestrator_sessions[session_id]
            session.research_plan = sub_tasks
            session.phase = OrchestratorPhase.PLAN_REVIEW
        
        await sse_manager.broadcast(channel, "orch_plan_ready", {
            "message": "Research plan ready for review",
            "sub_tasks": [{"id": st.id, "name": st.name, "queries": st.queries} for st in sub_tasks]
        })
        
    except Exception as e:
        print(f"[OrchestratorRoutes] Planning failed: {e}")
        if session_id in orchestrator_sessions:
            orchestrator_sessions[session_id].phase = OrchestratorPhase.ERROR
            orchestrator_sessions[session_id].error = str(e)
        
        await sse_manager.broadcast(f"orchestrator:{session_id}", "orch_error", {
            "message": f"Planning failed: {str(e)}"
        })


async def research_background_task(session_id: str):
    """Background task for executing research"""
    try:
        channel = f"orchestrator:{session_id}"
        session = orchestrator_sessions.get(session_id)
        
        if not session:
            return
        
        session.phase = OrchestratorPhase.RESEARCH
        orchestrator = ContentOrchestrator()
        
        await sse_manager.broadcast(channel, "orch_researching", {
            "message": f"Researching {len(session.research_plan)} sub-tasks..."
        })
        
        # Execute each sub-task
        for i, sub_task in enumerate(session.research_plan):
            sub_task.status = "in_progress"
            
            await sse_manager.broadcast(channel, "orch_researching", {
                "message": f"Researching: {sub_task.name}",
                "current": i + 1,
                "total": len(session.research_plan)
            })
            
            results = await orchestrator.execute_subtask_research(sub_task)
            
            # Store results
            session.research_results[sub_task.id] = results
            
            # Check if results are too few
            if len(results.web_items) < 2 and len(results.images) < 2:
                sub_task.status = "failed"
                sub_task.error = "Insufficient results found"
                
                await sse_manager.broadcast(channel, "orch_question", {
                    "message": f"Found few results for '{sub_task.name}'. Provide a broader query or skip?",
                    "sub_task_id": sub_task.id,
                    "options": ["skip", "retry"]
                })
            else:
                sub_task.status = "complete"
        
        session.phase = OrchestratorPhase.SELECTION
        
        await sse_manager.broadcast(channel, "orch_research_ready", {
            "message": "Research complete! Select items to include.",
            "results_summary": {
                sub_task.id: {
                    "web_count": len(session.research_results.get(sub_task.id, SubTaskResults(web_items=[], images=[])).web_items),
                    "image_count": len(session.research_results.get(sub_task.id, SubTaskResults(web_items=[], images=[])).images)
                }
                for sub_task in session.research_plan
            }
        })
        
    except Exception as e:
        print(f"[OrchestratorRoutes] Research failed: {e}")
        if session_id in orchestrator_sessions:
            orchestrator_sessions[session_id].phase = OrchestratorPhase.ERROR
            orchestrator_sessions[session_id].error = str(e)
        
        await sse_manager.broadcast(f"orchestrator:{session_id}", "orch_error", {
            "message": f"Research failed: {str(e)}"
        })


async def generation_background_task(session_id: str, influencer_data: Dict[str, Any]):
    """Background task for generating post"""
    try:
        channel = f"orchestrator:{session_id}"
        session = orchestrator_sessions.get(session_id)
        
        if not session or not session.user_selections:
            return
        
        session.phase = OrchestratorPhase.GENERATION
        
        await sse_manager.broadcast(channel, "orch_generating", {
            "message": "Analyzing selections and generating post..."
        })
        
        # Gather selected items
        selected_web_items = []
        selected_images = []
        
        for sub_task_id, results in session.research_results.items():
            for item in results.web_items:
                if item.id in session.user_selections.web_item_ids:
                    selected_web_items.append(item.dict())
            
            for item in results.images:
                if item.id in session.user_selections.image_ids:
                    selected_images.append(item.dict())
        
        print(f"[OrchestratorRoutes] Selected {len(selected_web_items)} web items, {len(selected_images)} images")
        
        # Get influencer avatar
        influencer = await entities_collection.find_one({
            "_id": ObjectId(session.influencer_id),
            "kind": "influencer"
        })
        
        if not influencer:
            raise Exception("Influencer not found")
        
        avatar_url = influencer.get("data", {}).get("avatarUrl")
        if not avatar_url:
            raise Exception("Influencer has no avatar")
        
        # Download avatar as base64 with data URI prefix (Gemini needs it)
        import httpx
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(avatar_url)
            response.raise_for_status()
            raw_b64 = base64.b64encode(response.content).decode('utf-8')
            avatar_b64 = f"data:image/jpeg;base64,{raw_b64}"
        
        await sse_manager.broadcast(channel, "orch_generating", {
            "message": "Determining image usage strategy..."
        })
        
        # Generate post
        result = await generate_post_from_selections(
            influencer_avatar_b64=avatar_b64,
            influencer_data=influencer.get("data", {}),
            selected_web_items=selected_web_items,
            selected_images=selected_images,
            user_query=session.query
        )
        
        # Store result
        session.generated_post = GeneratedPost(
            slide_count=result.slide_count,
            grid_layout=result.grid_layout,
            slide_urls=result.slide_urls,
            caption=result.caption
        )
        session.image_usage_plan = result.image_usage_plan
        session.phase = OrchestratorPhase.COMPLETE
        
        # Save post to database so it appears in the influencer feed
        image_slides = [
            {"imageUrl": url, "caption": f"Slide {i+1}"}
            for i, url in enumerate(result.slide_urls)
        ]
        
        posting_data = {
            "influencer_id": session.influencer_id,
            "content": result.caption,
            "status": "ready",
            "prompt": session.query,
            "platform": "instagram",
            "generated_content": result.caption,
            "image_urls": result.slide_urls,
            "image_slides": image_slides,
            "grid_image_url": result.grid_url,
            "source": "orchestrator",
        }
        
        new_entity = {
            "kind": "posting",
            "data": posting_data,
            "owner_id": session.owner_id,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        
        db_result = await entities_collection.insert_one(new_entity)
        posting_id = str(db_result.inserted_id)
        print(f"[OrchestratorRoutes] Saved post {posting_id} to database")
        
        # Broadcast to influencer feed so UI updates
        await sse_manager.broadcast(
            f"influencer:{session.influencer_id}",
            "post_update",
            {
                "post_id": posting_id,
                "status": "ready",
                "image_urls": result.slide_urls,
                "image_slides": image_slides,
            }
        )
        
        await sse_manager.broadcast(channel, "orch_post_ready", {
            "message": "Post generated successfully!",
            "post_id": posting_id,
            "slide_count": result.slide_count,
            "grid_layout": result.grid_layout,
            "caption": result.caption,
            "slide_urls": result.slide_urls
        })
        
    except Exception as e:
        print(f"[OrchestratorRoutes] Generation failed: {e}")
        if session_id in orchestrator_sessions:
            orchestrator_sessions[session_id].phase = OrchestratorPhase.ERROR
            orchestrator_sessions[session_id].error = str(e)
        
        await sse_manager.broadcast(f"orchestrator:{session_id}", "orch_error", {
            "message": f"Generation failed: {str(e)}"
        })


@router.post("/orchestrator/start")
async def start_orchestrator(request: StartOrchestratorRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):
    """Start a new orchestrator session"""
    
    # Verify influencer exists
    influencer = await entities_collection.find_one({
        "_id": ObjectId(request.influencer_id),
        "kind": "influencer"
    })
    
    if not influencer:
        raise HTTPException(status_code=404, detail="Influencer not found")
    
    # Use client-provided session_id or generate one
    session_id = request.session_id or str(uuid.uuid4())
    
    # Clear any previous session with this ID (fresh start)
    orchestrator_sessions.pop(session_id, None)
    
    session = OrchestratorSessionData(
        session_id=session_id,
        influencer_id=request.influencer_id,
        query=request.query,
        post_type_hint=request.post_type_hint,
        phase=OrchestratorPhase.PLANNING,
        owner_id=user_id
    )
    
    orchestrator_sessions[session_id] = session
    
    # Start planning in background
    background_tasks.add_task(
        planning_background_task,
        session_id,
        request.query,
        request.post_type_hint,
        influencer.get("data", {})
    )
    
    return {
        "session_id": session_id,
        "message": "Orchestrator started"
    }


@router.get("/orchestrator/{session_id}")
async def get_orchestrator_session(session_id: str):
    """Get current session state"""
    
    session = orchestrator_sessions.get(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    return session.dict()


@router.patch("/orchestrator/{session_id}/plan")
async def edit_plan(session_id: str, request: EditPlanRequest, background_tasks: BackgroundTasks):
    """Edit research plan and start research"""
    
    session = orchestrator_sessions.get(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Update plan
    session.research_plan = [
        SubTask(
            id=task.get("id", str(uuid.uuid4())),
            name=task.get("name", ""),
            queries=task.get("queries", []),
            status="pending"
        )
        for task in request.research_plan
    ]
    
    # Start research
    background_tasks.add_task(research_background_task, session_id)
    
    return {"message": "Research started"}


@router.post("/orchestrator/{session_id}/selections")
async def submit_selections(session_id: str, request: SelectionsRequest, background_tasks: BackgroundTasks):
    """Submit user selections and start generation"""
    
    session = orchestrator_sessions.get(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Store selections
    session.user_selections = UserSelections(
        web_item_ids=request.web_item_ids,
        image_ids=request.image_ids
    )
    
    # Get influencer data
    influencer = await entities_collection.find_one({
        "_id": ObjectId(session.influencer_id),
        "kind": "influencer"
    })
    
    # Start generation
    background_tasks.add_task(
        generation_background_task,
        session_id,
        influencer.get("data", {}) if influencer else {}
    )
    
    return {"message": "Generation started"}


def _entity_helper(entity) -> dict:
    """Convert MongoDB entity to JSON-safe dict"""
    entity["id"] = str(entity["_id"])
    del entity["_id"]
    return entity


@router.post("/orchestrator/{session_id}/retry-subtask/{subtask_id}")
async def retry_subtask(session_id: str, subtask_id: str, request: RetrySubTaskRequest):
    """Retry a failed sub-task with custom or broader query"""
    
    session = orchestrator_sessions.get(session_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Find sub-task
    sub_task = None
    for st in session.research_plan:
        if st.id == subtask_id:
            sub_task = st
            break
    
    if not sub_task:
        raise HTTPException(status_code=404, detail="Sub-task not found")
    
    # Update queries
    if request.custom_query:
        sub_task.queries = [request.custom_query]
    else:
        # Broaden existing query
        orchestrator = ContentOrchestrator()
        broader = await orchestrator.broaden_query_and_retry(sub_task.queries[0] if sub_task.queries else sub_task.name)
        sub_task.queries = [broader]
    
    # Re-execute research
    orchestrator = ContentOrchestrator()
    results = await orchestrator.execute_subtask_research(sub_task)
    
    session.research_results[sub_task.id] = results
    
    if len(results.web_items) > 0 or len(results.images) > 0:
        sub_task.status = "complete"
        sub_task.error = None
    else:
        sub_task.status = "failed"
        sub_task.error = "Still no results found"
    
    return {
        "message": "Retry complete",
        "web_count": len(results.web_items),
        "image_count": len(results.images)
    }


@router.delete("/orchestrator/{session_id}")
async def delete_orchestrator_session(session_id: str):
    """Delete/reset an orchestrator session"""
    orchestrator_sessions.pop(session_id, None)
    return {"message": "Session deleted"}
