from fastapi import FastAPI, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from backend.auth import router as AuthRouter
from backend.sse_manager import sse_manager

app = FastAPI(title="Aura AI Influencer Studio")
 
origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Authentication
app.include_router(AuthRouter, tags=["Auth"], prefix="/auth")

from backend.routes.influencer import router as InfluencerRouter
from backend.routes.postings import router as PostingsRouter
from backend.routes.creation import router as CreationRouter
from backend.routes.content_orchestrator import router as OrchestratorRouter

# Core Endpoints
app.include_router(InfluencerRouter, tags=["Influencer"], prefix="/influencer")
app.include_router(PostingsRouter, tags=["Postings"], prefix="/postings")
app.include_router(CreationRouter, tags=["Creation"], prefix="/creation")
app.include_router(OrchestratorRouter, tags=["Orchestrator"], prefix="")

@app.get("/")
async def root():
    return {"message": "Welcome to Aura AI Influencer Studio API"}


@app.get("/stream")
async def stream_updates(
    request: Request,
    resources: str = Query(..., description="Comma-separated resource IDs (e.g., 'session:123,post:456')")
):
    """
    SSE endpoint for real-time updates.
    Subscribe to multiple resources through a single stream.
    
    Query Parameters:
        resources: Comma-separated list of resource identifiers
                  Format: "session:{id}" for creation sessions
                          "post:{id}" for post updates
                          "influencer:{id}" for influencer-wide updates
    
    Example: /stream?resources=session:abc123,post:456
    """
    resource_ids = [r.strip() for r in resources.split(",") if r.strip()]
    
    if not resource_ids:
        return {"error": "No resources specified"}
    
    return StreamingResponse(
        sse_manager.stream_events(request, resource_ids),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


