"""
Server-Sent Events (SSE) Manager for real-time updates.
Handles connection tracking, event broadcasting, and automatic cleanup.
"""
import asyncio
import json
from typing import Dict, Set, Any, Optional
from fastapi import Request
from fastapi.responses import StreamingResponse
import logging

logger = logging.getLogger(__name__)


class SSEManager:
    """Manages SSE connections and broadcasts events to subscribed clients."""
    
    def __init__(self):
        # Map of resource_id -> set of queues
        # resource_id format: "session:{id}" or "post:{id}"
        self.connections: Dict[str, Set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()
    
    async def subscribe(self, resource_ids: list[str]) -> asyncio.Queue:
        """
        Subscribe to updates for one or more resources.
        
        Args:
            resource_ids: List of resource identifiers (e.g., ["session:123", "post:456"])
        
        Returns:
            Queue that will receive events for subscribed resources
        """
        queue = asyncio.Queue(maxsize=100)
        
        async with self._lock:
            for resource_id in resource_ids:
                if resource_id not in self.connections:
                    self.connections[resource_id] = set()
                self.connections[resource_id].add(queue)
                logger.info(f"Client subscribed to {resource_id}. Total subscribers: {len(self.connections[resource_id])}")
        
        return queue
    
    async def unsubscribe(self, queue: asyncio.Queue, resource_ids: list[str]):
        """
        Unsubscribe from updates for resources.
        
        Args:
            queue: The queue to unsubscribe
            resource_ids: List of resource identifiers to unsubscribe from
        """
        async with self._lock:
            for resource_id in resource_ids:
                if resource_id in self.connections:
                    self.connections[resource_id].discard(queue)
                    if not self.connections[resource_id]:
                        # No more subscribers, clean up
                        del self.connections[resource_id]
                    logger.info(f"Client unsubscribed from {resource_id}")
    
    async def broadcast(self, resource_id: str, event_type: str, data: Any):
        """
        Broadcast an event to all subscribers of a resource.
        
        Args:
            resource_id: Resource identifier (e.g., "session:123", "post:456")
            event_type: Type of event (e.g., "status_update", "progress", "complete")
            data: Event data to send (will be JSON serialized)
        """
        event = {
            "resource_id": resource_id,
            "event": event_type,
            "data": data
        }
        
        print(f"[SSE] Broadcasting {event_type} to {resource_id}: {data}")
        
        async with self._lock:
            if resource_id not in self.connections:
                print(f"[SSE] WARNING: No subscribers for {resource_id}. Available resources: {list(self.connections.keys())}")
                logger.debug(f"No subscribers for {resource_id}")
                return
            
            subscriber_count = len(self.connections[resource_id])
            print(f"[SSE] Found {subscriber_count} subscribers for {resource_id}")
            
            disconnected_queues = set()
            for queue in self.connections[resource_id]:
                try:
                    # Non-blocking put with timeout
                    await asyncio.wait_for(queue.put(event), timeout=1.0)
                except asyncio.TimeoutError:
                    logger.warning(f"Queue full for {resource_id}, marking for disconnect")
                    disconnected_queues.add(queue)
                except Exception as e:
                    logger.error(f"Error broadcasting to queue: {e}")
                    disconnected_queues.add(queue)
            
            # Clean up disconnected queues
            if disconnected_queues:
                self.connections[resource_id] -= disconnected_queues
                if not self.connections[resource_id]:
                    del self.connections[resource_id]
        
        print(f"[SSE] Successfully broadcasted {event_type} to {resource_id}")
        logger.debug(f"Broadcasted {event_type} to {resource_id}")
    
    async def stream_events(self, request: Request, resource_ids: list[str]):
        """
        Generate SSE stream for subscribed resources.
        
        Args:
            request: FastAPI request object (to detect client disconnect)
            resource_ids: List of resource identifiers to subscribe to
        
        Yields:
            SSE formatted messages
        """
        queue = await self.subscribe(resource_ids)
        
        try:
            # Send initial connection event
            yield f"event: connected\ndata: {json.dumps({'resources': resource_ids})}\n\n"
            
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    logger.info("Client disconnected")
                    break
                
                try:
                    # Wait for event with timeout to periodically check connection
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    
                    # Format as SSE message
                    event_type = event.get("event", "message")
                    event_data = json.dumps({
                        "resource_id": event["resource_id"],
                        "data": event["data"]
                    })
                    
                    yield f"event: {event_type}\ndata: {event_data}\n\n"
                    
                except asyncio.TimeoutError:
                    # Send keepalive ping every 30 seconds
                    yield f": keepalive\n\n"
                
        except asyncio.CancelledError:
            logger.info("Stream cancelled")
        except Exception as e:
            logger.error(f"Error in SSE stream: {e}")
        finally:
            # Clean up subscription
            await self.unsubscribe(queue, resource_ids)
            logger.info(f"SSE stream closed for resources: {resource_ids}")


# Global SSE manager instance
sse_manager = SSEManager()
