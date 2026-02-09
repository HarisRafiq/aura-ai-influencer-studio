from fastapi import APIRouter, Body, Depends, HTTPException
from backend.database import entities_collection, entity_helper
from backend.models import EntitySchema, UpdateEntitySchema, ResponseModel, ErrorResponseModel
from backend.auth import get_current_user
from bson import ObjectId
from datetime import datetime

router = APIRouter()

@router.post("/", response_description="Add new influencer")
async def add_influencer(user_id: str = Depends(get_current_user), influencer: dict = Body(...)):
    new_entity = {
        "kind": "influencer",
        "data": influencer,
        "owner_id": user_id,
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
    inserted = await entities_collection.insert_one(new_entity)
    new_influencer = await entities_collection.find_one({"_id": inserted.inserted_id})
    return ResponseModel(entity_helper(new_influencer), "Influencer added successfully.")

@router.get("/", response_description="List influencers")
async def get_influencers(user_id: str = Depends(get_current_user)):
    influencers = []
    async for influencer in entities_collection.find({"kind": "influencer", "owner_id": user_id}):
        influencers.append(entity_helper(influencer))
    return ResponseModel(influencers, "Influencers retrieved successfully.")

@router.get("/{id}", response_description="Get influencer data")
async def get_influencer_data(id: str, user_id: str = Depends(get_current_user)):
    influencer = await entities_collection.find_one({"_id": ObjectId(id), "kind": "influencer", "owner_id": user_id})
    if influencer:
        return ResponseModel(entity_helper(influencer), "Influencer retrieved successfully.")
    return ErrorResponseModel("An error occurred.", 404, "Influencer doesn't exist.")

@router.put("/{id}")
async def update_influencer_data(id: str, req: UpdateEntitySchema = Body(...), user_id: str = Depends(get_current_user)):
    req_dict = {k: v for k, v in req.data.items() if v is not None}
    update_data = {"data." + k: v for k, v in req_dict.items()}
    update_data["updated_at"] = datetime.utcnow()
    
    updated_influencer = await entities_collection.update_one(
        {"_id": ObjectId(id), "kind": "influencer", "owner_id": user_id}, {"$set": update_data}
    )
    if updated_influencer:
        return ResponseModel(f"Influencer with ID: {id} updated", "Influencer data updated successfully.")
    return ErrorResponseModel("An error occurred", 404, "Influencer not found.")
