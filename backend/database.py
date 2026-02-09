import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_DETAILS = os.getenv("MONGO_DETAILS", "mongodb://localhost:27017")

client = AsyncIOMotorClient(MONGO_DETAILS)
database = client.aura_db
entities_collection = database.get_collection("entities")
# Legend/Cache can still exist separately for performance if needed, but primary data is in entities
cache_collection = database.get_collection("ai_cache")
creation_sessions_collection = database.get_collection("creation_sessions")
post_sessions_collection = database.get_collection("post_sessions")
agent_sessions_collection = database.get_collection("agent_sessions")

def entity_helper(entity) -> dict:
    return {
        "id": str(entity["_id"]),
        "kind": entity["kind"],
        "data": entity["data"],
        "owner_id": entity.get("owner_id"),
        "created_at": entity.get("created_at"),
        "updated_at": entity.get("updated_at"),
    }
