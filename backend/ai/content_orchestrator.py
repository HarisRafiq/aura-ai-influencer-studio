"""
Content Orchestrator - Planning-based social media post creation
"""
import asyncio
from typing import List, Dict, Any, Optional

from backend.ai.factory import get_text_provider
from backend.ai.tools.web_tools import async_web_search, async_image_search
from backend.models import SubTask, WebItem, ImageItem, SubTaskResults
import uuid


# Plain dict schema for Gemini (no additionalProperties)
SUBTASK_PLAN_SCHEMA = {
    "type": "object",
    "properties": {
        "sub_tasks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "description": "Clear description of the research task"
                    },
                    "queries": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "2-4 search queries"
                    }
                },
                "required": ["name", "queries"]
            }
        }
    },
    "required": ["sub_tasks"]
}


class ContentOrchestrator:
    """
    Orchestrates multi-step content creation:
    1. Planning: Break down query into research sub-tasks
    2. Research: Execute web + image searches
    3. User curates selections
    4. Generate: Create post from selections
    """
    
    def __init__(self):
        self.provider = get_text_provider()
    
    async def create_research_plan(
        self,
        user_query: str,
        post_type_hint: Optional[str],
        influencer_data: Dict[str, Any]
    ) -> List[SubTask]:
        """
        Generate research plan with 3-5 sub-tasks.
        
        Args:
            user_query: User's content request
            post_type_hint: Optional hint (Tutorial, Review, etc.)
            influencer_data: Influencer profile
        
        Returns:
            List of SubTask objects
        """
        print(f"[Orchestrator] Creating research plan for: {user_query}")
        
        post_type_examples = {
            "Tutorial": "step-by-step instructions, key tips, common mistakes",
            "Review": "product features, pros and cons, user testimonials",
            "Comparison": "option A details, option B details, comparison points",
            "News": "latest updates, background context, expert opinions",
            "Guide": "overview, detailed steps, recommendations",
            "How-to": "preparation, execution steps, final results"
        }
        
        example_text = ""
        if post_type_hint and post_type_hint in post_type_examples:
            example_text = f"\nExample sub-tasks for {post_type_hint}: {post_type_examples[post_type_hint]}"
        
        planning_prompt = f"""Break down this content request into 3-5 research sub-tasks.

USER REQUEST: {user_query}

INFLUENCER: {influencer_data.get('name', 'Unknown')} - {', '.join(influencer_data.get('niches', []))}
{example_text}

For each sub-task:
1. name: Clear description (e.g., "Find latest statistics", "Research product features")
2. queries: 2-4 search queries to find this information

Guidelines:
- Each sub-task should find specific information needed for the post
- Queries should be 3-8 words, optimized for web search
- Cover different aspects of the request
- Include both fact-finding and visual research

Return a JSON object with "sub_tasks" array."""

        try:
            response = await self.provider.generate(
                prompt=planning_prompt,
                schema=SUBTASK_PLAN_SCHEMA
            )
            
            if isinstance(response, str):
                import json
                data = json.loads(response)
            else:
                data = response
            
            sub_tasks_data = data.get("sub_tasks", [])
            
            # Convert to SubTask objects
            sub_tasks = []
            for i, task_data in enumerate(sub_tasks_data[:5]):  # Max 5 tasks
                sub_task = SubTask(
                    id=str(uuid.uuid4()),
                    name=task_data.get("name", f"Sub-task {i+1}"),
                    queries=task_data.get("queries", [])[:4],  # Max 4 queries per task
                    status="pending"
                )
                sub_tasks.append(sub_task)
            
            print(f"[Orchestrator] Created {len(sub_tasks)} sub-tasks")
            return sub_tasks
            
        except Exception as e:
            print(f"[Orchestrator] Planning failed: {e}, using fallback")
            # Fallback: Create simple 3-task plan
            return [
                SubTask(
                    id=str(uuid.uuid4()),
                    name="Research main topic",
                    queries=[user_query, f"{user_query} facts"],
                    status="pending"
                ),
                SubTask(
                    id=str(uuid.uuid4()),
                    name="Find visual examples",
                    queries=[f"{user_query} images", f"{user_query} examples"],
                    status="pending"
                ),
                SubTask(
                    id=str(uuid.uuid4()),
                    name="Get expert insights",
                    queries=[f"{user_query} tips", f"{user_query} guide"],
                    status="pending"
                )
            ]
    
    async def execute_subtask_research(
        self,
        sub_task: SubTask
    ) -> SubTaskResults:
        """
        Execute research for a single sub-task.
        
        Args:
            sub_task: SubTask to research
        
        Returns:
            SubTaskResults with web items and images
        """
        print(f"[Orchestrator] Researching sub-task: {sub_task.name}")
        
        queries = sub_task.queries[:4]  # Max 4 queries
        
        try:
            import json as _json
            
            # Execute web search (returns JSON string)
            web_results_raw = await async_web_search(queries)
            
            # Execute image searches one-by-one (each expects a single string)
            image_results_all = []
            for q in queries:
                try:
                    img_raw = await async_image_search(q, max_results=5)
                    img_parsed = _json.loads(img_raw) if isinstance(img_raw, str) else img_raw
                    if isinstance(img_parsed, dict) and "images" in img_parsed:
                        image_results_all.extend(img_parsed["images"])
                except Exception as img_err:
                    print(f"[Orchestrator] Image search failed for '{q}': {img_err}")
            
            # Parse web results (JSON string → list of {query, results})
            web_items = []
            try:
                web_parsed = _json.loads(web_results_raw) if isinstance(web_results_raw, str) else web_results_raw
                if isinstance(web_parsed, list):
                    for entry in web_parsed:
                        for result in entry.get("results", [])[:5]:
                            web_items.append(WebItem(
                                id=str(uuid.uuid4()),
                                title=result.get("title", ""),
                                snippet=result.get("snippet", ""),
                                url=result.get("url", "")
                            ))
                elif isinstance(web_parsed, dict) and "error" not in web_parsed:
                    for query_key, results in web_parsed.items():
                        if isinstance(results, list):
                            for result in results[:5]:
                                web_items.append(WebItem(
                                    id=str(uuid.uuid4()),
                                    title=result.get("title", "") if isinstance(result, dict) else "",
                                    snippet=result.get("snippet", "") if isinstance(result, dict) else "",
                                    url=result.get("url", "") if isinstance(result, dict) else ""
                                ))
            except Exception as parse_err:
                print(f"[Orchestrator] Web result parsing failed: {parse_err}")
            
            # Parse image results (already extracted above)
            image_items = []
            for img in image_results_all[:15]:
                if isinstance(img, dict):
                    image_items.append(ImageItem(
                        id=str(uuid.uuid4()),
                        thumbnail=img.get("thumbnail_url", img.get("image_url", "")),
                        image_url=img.get("image_url", ""),
                        title=img.get("title", "Image")
                    ))
            
            print(f"[Orchestrator] Found {len(web_items)} web items, {len(image_items)} images")
            
            # Check if results are too few - maybe retry with broader query
            if len(web_items) < 2 and len(image_items) < 2:
                print(f"[Orchestrator] Few results, trying broader query...")
                broader_query = queries[0].split()[:3]  # Take first 3 words
                broader_query_str = " ".join(broader_query)
                
                try:
                    retry_web_raw = await async_web_search([broader_query_str])
                    retry_web = _json.loads(retry_web_raw) if isinstance(retry_web_raw, str) else retry_web_raw
                    if isinstance(retry_web, list):
                        for entry in retry_web:
                            for result in entry.get("results", [])[:5]:
                                web_items.append(WebItem(
                                    id=str(uuid.uuid4()),
                                    title=result.get("title", ""),
                                    snippet=result.get("snippet", ""),
                                    url=result.get("url", "")
                                ))
                except Exception:
                    pass
                
                try:
                    retry_img_raw = await async_image_search(broader_query_str, max_results=5)
                    retry_img = _json.loads(retry_img_raw) if isinstance(retry_img_raw, str) else retry_img_raw
                    if isinstance(retry_img, dict) and "images" in retry_img:
                        for img in retry_img["images"][:10]:
                            if isinstance(img, dict):
                                image_items.append(ImageItem(
                                    id=str(uuid.uuid4()),
                                    thumbnail=img.get("thumbnail_url", img.get("image_url", "")),
                                    image_url=img.get("image_url", ""),
                                    title=img.get("title", "Image")
                                ))
                except Exception:
                    pass
            
            return SubTaskResults(
                web_items=web_items,
                images=image_items
            )
            
        except Exception as e:
            print(f"[Orchestrator] Research execution failed: {e}")
            return SubTaskResults(web_items=[], images=[])
    
    async def broaden_query_and_retry(
        self,
        original_query: str
    ) -> str:
        """Generate a broader version of a failed query"""
        words = original_query.split()
        if len(words) > 3:
            return " ".join(words[:3])
        return original_query
