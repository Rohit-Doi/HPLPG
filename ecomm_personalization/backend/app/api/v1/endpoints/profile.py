from fastapi import APIRouter, HTTPException, Request
from typing import Dict, Any

router = APIRouter()

# In-memory user profile storage (for demo)
USER_PROFILES: Dict[str, Dict[str, Any]] = {
    "u1": {
        "user_id": "u1",
        "avatar": "https://randomuser.me/api/portraits/men/32.jpg",
        "name": "John Doe",
        "email": "john@example.com",
        "phone": "9876543210",
        "ageGroup": "25-34",
        "gender": "male",
        "address": "123 Main St, City, Country",
    }
}

@router.get("/{user_id}")
def get_profile(user_id: str):
    profile = USER_PROFILES.get(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="User not found")
    return profile

@router.post("/{user_id}")
def update_profile(user_id: str, data: Dict[str, Any]):
    if user_id not in USER_PROFILES:
        raise HTTPException(status_code=404, detail="User not found")
    USER_PROFILES[user_id].update(data)
    return USER_PROFILES[user_id] 