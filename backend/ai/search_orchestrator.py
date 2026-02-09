"""
Search Orchestrator for Category-Based Content Agent

Manages conversational flows for different content categories,
integrates with web search tools and generates contextual options.
"""

from typing import Dict, Any, List, Optional
from enum import Enum
from google.genai import types
import json
import asyncio
import logging

# Import web tools
from backend.ai.tools.web_tools import async_web_search, async_web_page_reader

logger = logging.getLogger(__name__)


class ContentCategory(str, Enum):
    """Content categories for influencer posts"""
    NEWS = "news"  # Share news/current events
    GUIDE = "guide"  # Tutorial/how-to content
    REVIEW = "review"  # Restaurant/product reviews
    EVENT = "event"  # Local events/happenings
    TRAVEL = "travel"  # Travel recommendations
    PRODUCT = "product"  # Product recommendations


class SearchOrchestrator:
    """Orchestrates search-powered conversations for content creation"""
    
    def __init__(self, text_provider):
        """
        Args:
            text_provider: AI text provider (e.g., GeminiProvider)
        """
        self.provider = text_provider
        
    async def classify_category(self, user_input: str) -> ContentCategory:
        """Classify user intent into a content category"""
        prompt = f"""Classify this content creation intent into one category:
        
User input: "{user_input}"

Categories:
- news: Sharing news, current events, breaking stories
- guide: Tutorial, how-to, tips, educational content
- review: Restaurant review, product review, experience review
- event: Local events, happenings, community activities
- travel: Travel destinations, recommendations, experiences
- product: Product recommendations, shopping, finds

Return only the category name (lowercase)."""

        schema = {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "enum": ["news", "guide", "review", "event", "travel", "product"]
                }
            },
            "required": ["category"]
        }
        
        result = await self.provider.generate(prompt, schema=schema)
        return ContentCategory(result["category"])
    
    async def generate_opening_message(
        self,
        category: ContentCategory,
        influencer_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> str:
        """Generate a welcoming opening message for the category"""
        
        name = influencer_data.get("name", "there")
        location = influencer_data.get("location", "your area")
        niches = influencer_data.get("niches", [])
        
        openings = {
            ContentCategory.NEWS: f"Hey {name}! Let's find some trending news to share with your followers. I can help you find stories related to {', '.join(niches[:2]) if niches else 'your interests'}.",
            ContentCategory.GUIDE: f"Perfect! Let's create a helpful guide for your audience. What kind of tutorial or how-to content do you want to create?",
            ContentCategory.REVIEW: f"Great choice! Let's find something worth reviewing in {location}. Whether it's a restaurant, café, or experience, I'll help you craft an authentic review.",
            ContentCategory.EVENT: f"Awesome! Let me search for local events and happenings in {location} that your followers would love to know about.",
            ContentCategory.TRAVEL: f"Let's explore! I'll help you find exciting travel destinations and experiences to share with your community.",
            ContentCategory.PRODUCT: f"Let's discover some products to recommend! I can help you find items that fit your niche and audience."
        }
        
        return openings.get(category, "Let's create something amazing together!")
    
    async def search_real_world_data(
        self,
        category: ContentCategory,
        influencer_data: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
        user_refinement: Optional[str] = None,
        sse_manager=None,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Use web_tools to find real-world data for the category with dynamic query generation
        
        Returns:
            {
                "items": [...],  # Structured search results (10-20 items)
                "query": str,  # Primary query used
                "queries": List[str],  # All queries generated
                "found_count": int,
                "raw_search": str  # Raw search data for debugging
            }
        """
        location = influencer_data.get("location", "")
        niches = influencer_data.get("niches", [])
        name = influencer_data.get("name", "")
        
        # Broadcast search start
        if sse_manager and session_id:
            await sse_manager.broadcast(f"agent:{session_id}", "agent_status", {
                "phase": "generating_queries",
                "message": "Crafting search queries..."
            })
        
        # Step 1: Generate dynamic search queries using LLM
        logger.info(f"[SearchOrchestrator] Generating queries for category: {category.value}")
        
        query_generation_prompt = f"""Generate 3-5 diverse search queries to find {category.value} content.

Influencer Profile:
- Name: {name}
- Location: {location}
- Niches: {', '.join(niches) if niches else 'general'}
- Category: {category.value}
- User refinement: {user_refinement or 'none'}

Generate queries that will find:
- SPECIFIC, REAL items (actual names, places, events, products)
- Current and relevant to the location and niches
- Diverse perspectives and options
- Concrete details (dates, locations, sources)

Each query should be 3-8 words, optimized for web search.

Examples for REVIEW category in "San Francisco":
- "best new restaurants san francisco 2026"
- "hidden gem cafes san francisco"
- "top rated coffee shops bay area"

Generate similar queries for the current category and context."""

        query_schema = {
            "type": "object",
            "properties": {
                "queries": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 3,
                    "maxItems": 5
                },
                "reasoning": {"type": "string"}
            },
            "required": ["queries"]
        }
        
        try:
            query_result = await self.provider.generate(query_generation_prompt, schema=query_schema)
            queries = query_result.get("queries", [])
            logger.info(f"[SearchOrchestrator] Generated {len(queries)} queries: {queries}")
            
            if sse_manager and session_id:
                await sse_manager.broadcast(f"agent:{session_id}", "agent_status", {
                    "phase": "searching",
                    "message": f"🔍 Searching the web with {len(queries)} queries..."
                })
            
        except Exception as e:
            logger.error(f"[SearchOrchestrator] Query generation failed: {e}")
            # Fallback to category-based query
            queries = [self._get_fallback_query(category, location, niches, user_refinement)]
        
        # Step 2: Execute web searches using web_tools
        try:
            logger.info(f"[SearchOrchestrator] Executing web search with queries: {queries}")
            search_results_json = await async_web_search(queries)
            search_results = json.loads(search_results_json)
            
            if isinstance(search_results, dict) and "error" in search_results:
                raise Exception(search_results["error"])
            
            # Count total results
            total_results = sum(len(q.get("results", [])) for q in search_results)
            logger.info(f"[SearchOrchestrator] Found {total_results} total search results")
            
            if sse_manager and session_id:
                await sse_manager.broadcast(f"agent:{session_id}", "agent_status", {
                    "phase": "analyzing",
                    "message": f"📊 Found {total_results} results, analyzing..."
                })
            
        except Exception as e:
            logger.error(f"[SearchOrchestrator] Web search failed: {e}, falling back to Google Search")
            if sse_manager and session_id:
                await sse_manager.broadcast(f"agent:{session_id}", "agent_status", {
                    "phase": "searching_fallback",
                    "message": "Using backup search method..."
                })
            # Fallback to Google Search
            return await self._fallback_google_search(
                category, influencer_data, user_refinement, sse_manager, session_id
            )
        
        # Step 3: Extract top URLs for deeper content reading
        top_urls = []
        for query_result in search_results[:3]:  # Top 3 query results
            for result in query_result.get("results", [])[:3]:  # Top 3 URLs each
                url = result.get("url", "")
                if url and url not in top_urls:
                    top_urls.append(url)
        
        top_urls = top_urls[:8]  # Limit to 8 URLs total
        logger.info(f"[SearchOrchestrator] Reading {len(top_urls)} pages for enrichment")
        
        # Step 4: Read page content for enrichment (optional, can be heavy)
        page_contents = ""
        if top_urls and len(top_urls) <= 5:  # Only read if reasonable number
            try:
                if sse_manager and session_id:
                    await sse_manager.broadcast(f"agent:{session_id}", "agent_status", {
                        "phase": "reading_pages",
                        "message": f"📖 Reading {len(top_urls)} pages for details..."
                    })
                page_contents = await async_web_page_reader(top_urls[:5])
                logger.info(f"[SearchOrchestrator] Read page contents: {len(page_contents)} chars")
            except Exception as e:
                logger.warning(f"[SearchOrchestrator] Page reading failed: {e}")
                page_contents = ""
        
        # Step 5: Structure all results into items using LLM
        if sse_manager and session_id:
            await sse_manager.broadcast(f"agent:{session_id}", "agent_status", {
                "phase": "structuring",
                "message": "✍️ Organizing findings into options..."
            })
        
        # Format search results for structuring
        formatted_results = self._format_search_results(search_results)
        
        structure_prompt = f"""Analyze these web search results and extract REAL, SPECIFIC items.

Search Results:
{formatted_results}

{f"Additional Context from Pages (first 3000 chars):\n{page_contents[:3000]}\n" if page_contents else ""}

Extract 10-20 specific items. Each item MUST have:
- name: Actual name (restaurant name, event name, product name, article headline)
- description: Brief description (50-100 chars)
- details: Specific details (date/time, location, source, price, etc.)
- why_notable: Why it's interesting/relevant (1 sentence)
- url: Source URL (use actual URL from results)

Focus on DIVERSITY - cover different options, perspectives, and types within the category.
Extract MORE rather than fewer options. Aim for 15-20 items if available.
Be SPECIFIC with real names, dates, and locations from the search results."""

        schema = {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "details": {"type": "string"},
                            "why_notable": {"type": "string"},
                            "url": {"type": "string"}
                        },
                        "required": ["name", "description", "why_notable"]
                    },
                    "minItems": 6,
                    "maxItems": 20
                }
            },
            "required": ["items"]
        }
        
        try:
            structured_response = await self.provider.generate(structure_prompt, schema=schema)
            items = structured_response.get("items", []) if isinstance(structured_response, dict) else []
            logger.info(f"[SearchOrchestrator] Structured {len(items)} items")
            
        except Exception as e:
            logger.error(f"[SearchOrchestrator] Structuring failed: {e}")
            items = []
        
        return {
            "items": items,
            "query": queries[0] if queries else "",
            "queries": queries,
            "found_count": len(items),
            "raw_search": formatted_results[:1000],  # Truncate for storage
            "search_method": "web_tools"
        }
    
    def _get_fallback_query(
        self, 
        category: ContentCategory, 
        location: str, 
        niches: List[str], 
        user_refinement: Optional[str]
    ) -> str:
        """Generate fallback query based on category"""
        search_queries = {
            ContentCategory.NEWS: f"latest news trending {' '.join(niches[:2]) if niches else ''} {user_refinement or ''}",
            ContentCategory.GUIDE: f"how to tutorial {user_refinement or ' '.join(niches[:1]) if niches else ''}",
            ContentCategory.REVIEW: f"best restaurants cafes {location} {user_refinement or ''}",
            ContentCategory.EVENT: f"events happenings {location} today this week {user_refinement or ''}",
            ContentCategory.TRAVEL: f"travel destinations recommendations {user_refinement or ''}",
            ContentCategory.PRODUCT: f"best products recommendations {' '.join(niches[:1]) if niches else ''} {user_refinement or ''}"
        }
        return search_queries.get(category, user_refinement or "trending topics")
    
    def _format_search_results(self, search_results: List[Dict]) -> str:
        """Format search results for LLM consumption"""
        formatted = []
        for i, query_result in enumerate(search_results, 1):
            query = query_result.get("query", "")
            results = query_result.get("results", [])
            formatted.append(f"Query {i}: {query}")
            for j, result in enumerate(results[:5], 1):
                formatted.append(f"  {j}. {result.get('title', '')}")
                formatted.append(f"     {result.get('snippet', '')[:200]}")
                formatted.append(f"     URL: {result.get('url', '')}")
            formatted.append("")
        return "\n".join(formatted)
    
    async def _fallback_google_search(
        self,
        category: ContentCategory,
        influencer_data: Dict[str, Any],
        user_refinement: Optional[str],
        sse_manager=None,
        session_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Fallback to original Google Search implementation"""
        location = influencer_data.get("location", "")
        niches = influencer_data.get("niches", [])
        
        query = self._get_fallback_query(category, location, niches, user_refinement)
        
        # Step 1: Use Gemini's Google Search grounding (without schema)
        search_prompt = f"""Search the web for: {query}

Find 10-15 SPECIFIC, REAL items. For each, provide:
- The actual name (restaurant name, event name, product name, news headline)
- Brief description
- Specific details (date/time for events, location for places, source for news)
- Why it's interesting/relevant

Be specific with real names, dates, and locations."""

        search_response = await self.provider.generate(
            prompt=search_prompt,
            tools=[types.Tool(google_search=types.GoogleSearchRetrieval())],
            return_raw=True
        )
        
        search_text = search_response.text if hasattr(search_response, 'text') else str(search_response)
        
        # Step 2: Structure the search results into JSON (separate call without tools)
        structure_prompt = f"""Convert this search information into structured JSON:

{search_text}

Return a JSON object with an "items" array. Each item should have:
- name: The actual name found
- description: Brief description (50-100 chars)
- details: Specific details like dates, locations, sources
- why_notable: Why it's interesting (1 sentence)
- url: Source URL if mentioned (or empty string)

Focus on extracting the most specific, concrete information.
Extract 10-20 items if available."""

        schema = {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "description": {"type": "string"},
                            "details": {"type": "string"},
                            "why_notable": {"type": "string"},
                            "url": {"type": "string"}
                        },
                        "required": ["name", "description", "why_notable"]
                    }
                }
            },
            "required": ["items"]
        }

        structured_response = await self.provider.generate(
            prompt=structure_prompt,
            schema=schema
        )
        
        items = structured_response.get("items", []) if isinstance(structured_response, dict) else []
        
        return {
            "items": items,
            "query": query,
            "queries": [query],
            "found_count": len(items),
            "raw_search": search_text[:1000],  # Keep raw search for debugging
            "search_method": "google_search_fallback"
        }
    
    async def generate_options(
        self,
        category: ContentCategory,
        influencer_data: Dict[str, Any],
        search_data: Optional[Dict[str, Any]] = None,
        conversation_history: List[Dict[str, Any]] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate 4 contextual options based on search results and conversation
        
        Returns:
            {
                "question": str,  # Question to ask user
                "options": List[str],  # 4 specific options
                "can_generate": bool  # Whether user can generate now
            }
        """
        conversation_history = conversation_history or []
        name = influencer_data.get("name", "you")
        
        # Determine conversation stage
        if len(conversation_history) == 0:
            # First question: What specifically?
            return await self._generate_first_options(category, influencer_data, search_data)
        elif len(conversation_history) == 1:
            # Second question: Angle/perspective
            return await self._generate_angle_options(category, influencer_data, conversation_history, search_data)
        else:
            # Third+ question: Additional details or ready to generate
            return {
                "question": f"Ready to create the post, {name}? Or want to add more details?",
                "options": [
                    "Generate the post now",
                    "Add more specific details",
                    "Change the angle",
                    "Search for different options"
                ],
                "can_generate": True
            }
    
    async def _generate_first_options(
        self,
        category: ContentCategory,
        influencer_data: Dict[str, Any],
        search_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Generate first set of options with search results (6-12 options)"""
        
        name = influencer_data.get("name", "you")
        location = influencer_data.get("location", "your area")
        
        # Use search data to generate specific options
        if search_data and search_data.get("items"):
            items = search_data["items"]
            
            # Format search results for display (show more items now)
            search_context = f"I found {len(items)} real options:\n\n"
            for i, item in enumerate(items[:12], 1):  # Show up to 12 in summary
                search_context += f"{i}. **{item['name']}**\n"
                search_context += f"   {item['description']}\n"
                if item.get('details'):
                    search_context += f"   📍 {item['details']}\n"
                search_context += f"   💡 {item['why_notable']}\n\n"
            
            # Generate options from items (show 6-12 options based on availability)
            num_options = min(len(items), 12)
            options = []
            for item in items[:num_options]:
                # Create concise option text
                option = f"{item['name']}"
                if len(option) > 60:
                    option = option[:57] + "..."
                options.append(option)
            
            return {
                "question": f"I found {len(items)} options! Which one interests you?",
                "options": options,
                "search_results": search_context,
                "items_data": items,  # Full data for later use
                "display_limit": 6,  # Show 6 initially in UI
                "total_count": len(items),
                "can_generate": False
            }
        
        # Fallback to generic options if no search data
        fallback_options = {
            ContentCategory.NEWS: {
                "question": f"What kind of news interests you most right now?",
                "options": [
                    "Tech & innovation news",
                    "Local community stories",
                    "Trending global topics",
                    "Industry-specific news"
                ]
            },
            ContentCategory.GUIDE: {
                "question": f"What guide or tutorial should we create?",
                "options": [
                    "Quick tips & hacks",
                    "Step-by-step tutorial",
                    "Beginner's guide",
                    "Expert recommendations"
                ]
            },
            ContentCategory.REVIEW: {
                "question": f"What type of review in {location}?",
                "options": [
                    "Coffee shop or café",
                    "Restaurant or food spot",
                    "Local experience or activity",
                    "Hidden gem discovery"
                ]
            },
            ContentCategory.EVENT: {
                "question": f"What kind of event in {location}?",
                "options": [
                    "This weekend's events",
                    "Food & dining events",
                    "Cultural happenings",
                    "Upcoming festivals"
                ]
            },
            ContentCategory.TRAVEL: {
                "question": f"What travel content should we create?",
                "options": [
                    "Weekend getaway ideas",
                    "Hidden gem destinations",
                    "Budget travel tips",
                    "Luxury experiences"
                ]
            },
            ContentCategory.PRODUCT: {
                "question": f"What products to feature?",
                "options": [
                    "Daily essentials & favorites",
                    "New discoveries",
                    "Budget-friendly finds",
                    "Premium recommendations"
                ]
            }
        }
        
        result = fallback_options.get(category, {
            "question": "What would you like to focus on?",
            "options": ["Option 1", "Option 2", "Option 3", "Option 4"]
        })
        
        return {**result, "can_generate": False}
    
    async def _generate_angle_options(
        self,
        category: ContentCategory,
        influencer_data: Dict[str, Any],
        conversation_history: List[Dict[str, Any]],
        search_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Generate options for content angle/perspective"""
        
        first_choice = conversation_history[0].get("content", "") if conversation_history else ""
        
        prompt = f"""The user chose: "{first_choice}"

Generate 4 different angles or perspectives for creating content about this.
Each angle should be:
- A different storytelling approach
- Authentic and engaging
- 5-8 words max
- Suitable for social media

Examples of angles: "Behind the scenes", "Personal story", "Expert tips", "Day in the life", etc.

Return as JSON with "question" and "options" array."""

        schema = {
            "type": "object",
            "properties": {
                "question": {"type": "string"},
                "options": {
                    "type": "array",
                    "items": {"type": "string"},
                    "minItems": 4,
                    "maxItems": 4
                }
            },
            "required": ["question", "options"]
        }
        
        result = await self.provider.generate(prompt, schema=schema)
        return {
            **result,
            "can_generate": True  # Can generate after choosing angle
        }
    
    async def generate_post_prompt(
        self,
        category: ContentCategory,
        influencer_data: Dict[str, Any],
        conversation_history: List[Dict[str, Any]],
        search_data: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Generate a detailed prompt for post creation based on conversation
        
        Returns:
            Enriched prompt string for the posting creation pipeline
        """
        
        name = influencer_data.get("name", "")
        location = influencer_data.get("location", "")
        tone = influencer_data.get("tone", "casual")
        
        # Extract key decisions from conversation
        choices = [msg.get("content", "") for msg in conversation_history if msg.get("role") == "user"]
        
        # Format real-world data
        real_world_context = "REAL-WORLD INFORMATION TO USE:\n"
        if search_data and search_data.get("items"):
            items = search_data["items"]
            # Find the item user selected (first choice)
            selected_name = choices[0] if choices else ""
            selected_item = None
            for item in items:
                if selected_name in item["name"] or item["name"] in selected_name:
                    selected_item = item
                    break
            
            if selected_item:
                real_world_context += f"PRIMARY SUBJECT:\n"
                real_world_context += f"- Name: {selected_item['name']}\n"
                real_world_context += f"- Details: {selected_item.get('description', '')}\n"
                real_world_context += f"- Specifics: {selected_item.get('details', '')}\n"
                real_world_context += f"- Why Notable: {selected_item['why_notable']}\n"
                if selected_item.get('url'):
                    real_world_context += f"- Source: {selected_item['url']}\n"
                real_world_context += "\nUSE THESE EXACT DETAILS in the post. Mention the actual name, location, date, etc.\n"
            
            # Add other options as context
            other_items = [item for item in items if item != selected_item][:3]
            if other_items:
                real_world_context += "\nRELATED OPTIONS (can mention as alternatives):\n"
                for item in other_items:
                    real_world_context += f"- {item['name']}: {item['description']}\n"
        else:
            real_world_context += "No specific search data available. Be creative but authentic.\n"
        
        prompt_template = f"""Create a {category.value} post for {name}.

Location: {location}
Tone: {tone}

User's Choices:
{chr(10).join(f"- {choice}" for choice in choices)}

{real_world_context}

IMPORTANT:
1. Use the EXACT names, dates, locations from the real-world information above
2. Make it feel like {name} actually experienced/discovered this
3. Include specific details that prove authenticity (dates, exact locations, etc.)
4. Match {name}'s tone: {tone}
5. Create 4 carousel slides that tell a compelling story
6. Use hashtags and emojis naturally

Make it authentic - this should feel like a real influencer post about a real place/event/thing."""

        return prompt_template
