from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any

router = APIRouter()

# Mock recommendation data
MOCK_RECOMMENDATIONS = {
    "1": [  # User 1's recommendations
        {"product_id": 1, "score": 0.95, "reason": "Based on your browsing history"},
        {"product_id": 2, "score": 0.87, "reason": "Popular in your area"},
        {"product_id": 3, "score": 0.82, "reason": "Trending now"},
    ],
    "2": [  # User 2's recommendations
        {"product_id": 3, "score": 0.92, "reason": "Similar to your previous purchases"},
        {"product_id": 1, "score": 0.85, "reason": "Popular among similar users"},
    ]
}

@router.get("/{user_id}", response_model=List[Dict[str, Any]])
async def get_recommendations(user_id: str, limit: int = 3):
    """
    Get personalized product recommendations for a user
    """
    # In a real app, this would call your recommendation service
    recommendations = MOCK_RECOMMENDATIONS.get(user_id, MOCK_RECOMMENDATIONS["1"])  # Default to user 1's recommendations
    return recommendations[:limit]
