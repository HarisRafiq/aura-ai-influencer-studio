import os
import time
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from google.oauth2 import id_token
from google.auth.transport import requests
import jwt
from backend.database import entities_collection
from backend.models import EntitySchema
from datetime import datetime

router = APIRouter()
security = HTTPBearer()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
JWT_SECRET = os.getenv("JWT_SECRET", "aura_secret_key")
JWT_ALGORITHM = "HS256"

async def create_or_get_user(email: str, name: str, picture: str):
    user = await entities_collection.find_one({"kind": "user", "data.email": email})
    if not user:
        new_user = {
            "kind": "user",
            "data": {
                "email": email,
                "name": name,
                "picture": picture,
                "created_at": datetime.utcnow()
            }
        }
        result = await entities_collection.insert_one(new_user)
        user_id = str(result.inserted_id)
    else:
        user_id = str(user["_id"])
    
    return user_id

def create_jwt(user_id: str):
    payload = {
        "user_id": user_id,
        "expires": time.time() + 3600 * 24 * 7 # 7 days
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token

@router.post("/google")
async def google_login(token_obj: dict):
    token = token_obj.get("token")
    if not token:
        raise HTTPException(status_code=400, detail="Token missing")
    
    try:
        idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)
        
        email = idinfo['email']
        name = idinfo.get('name', '')
        picture = idinfo.get('picture', '')
        
        user_id = await create_or_get_user(email, name, picture)
        jwt_token = create_jwt(user_id)
        
        return {"token": jwt_token, "user_id": user_id}
    except Exception as e:
        print(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Invalid Google token")

async def get_current_user(auth: HTTPAuthorizationCredentials = Security(security)):
    token = auth.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload["expires"] < time.time():
            raise HTTPException(status_code=401, detail="Token expired")
        return payload["user_id"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
