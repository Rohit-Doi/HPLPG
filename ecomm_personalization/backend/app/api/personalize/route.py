from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
import json
import logging
from datetime import datetime
import random

# Import our services
from services.recommendation_engine import RecommendationEngine
from data_processor import DataProcessor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize router
router = APIRouter()

# Initialize services
recommendation_engine = RecommendationEngine()
data_processor = DataProcessor(data_dir="E:/HPLPGA/ecomm_personalization/data")

# Load and process real data
real_data = data_processor.load_data()
# Assume data_processor has attributes: user_profiles, product_features
user_profiles = getattr(data_processor, 'user_profiles', None)
product_features = getattr(data_processor, 'product_features', None)
logger.info(f"Loaded user_profiles type: {type(user_profiles)}, product_features type: {type(product_features)}")
if user_profiles is not None:
    logger.info(f"Loaded {len(user_profiles)} user profiles. Sample: {str(user_profiles[0]) if len(user_profiles) > 0 else 'EMPTY'}")
else:
    logger.error("user_profiles is None")
if product_features is not None:
    logger.info(f"Loaded {len(product_features)} products. Sample: {str(product_features[0]) if len(product_features) > 0 else 'EMPTY'}")
else:
    logger.error("product_features is None")
if user_profiles is not None and product_features is not None:
    recommendation_engine.train(user_profiles, product_features)
else:
    logger.error('Failed to load real user or product data for training.')

class PersonalizationRequest(BaseModel):
    contentType: str
    context: Dict[str, Any]
    userId: Optional[str] = None
    options: Optional[Dict[str, Any]] = None

@router.post("/")
async def get_personalized_content(
    request: Request,
    data: PersonalizationRequest
):
    try:
        logger.info(f"Received personalization request: {data}")
        user_id = data.userId or request.headers.get("x-user-id") or f"anon_{request.client.host}"
        recommendation_type = data.contentType
        context = {
            "user_id": user_id,
            "device_type": data.context.get("deviceType"),
            "time_of_day": data.context.get("timeOfDay"),
            "location": data.context.get("location", {}).get("country"),
            "referrer": data.context.get("referrer"),
            "is_new_user": data.context.get("isNewUser", True),
            "session_id": data.context.get("sessionId")
        }
        # --- A/B Testing Assignment ---
        ab_group = random.choice(["A", "B"])
        logger.info(f"User {user_id} assigned to A/B group: {ab_group}")
        # --- Route to different strategies ---
        if user_id:
            recommendations = recommendation_engine.get_recommendations(
                user_id=user_id,
                context=context,
                n_recommendations=8,
                strategy="matrix_factorization"
            )
            strategy_used = "matrix_factorization"
        else:
            recommendations = recommendation_engine.get_recommendations(
                user_id=None,
                context=context,
                n_recommendations=8
            )
            strategy_used = "cold_start"
        # --- Log recommendations and group ---
        logger.info(f"Recommendations for user {user_id} (group {ab_group}, strategy {strategy_used}): {recommendations['recommended_products']}")
        # ... existing code for response ...
        response = {
            "timestamp": datetime.utcnow().isoformat(),
            "recommendation_type": recommendations["recommendation_type"],
            "explanation": recommendations["explanation"],
            "ab_group": ab_group,
            "strategy_used": strategy_used,
            "content": {
                "heroBanner": {
                    "title": "Welcome to Our Store",
                    "subtitle": "Discover amazing products tailored just for you",
                    "ctaText": "Shop Now",
                    "ctaLink": "/products",
                    "imageUrl": "/images/hero-banner.jpg"
                },
                "featuredCategories": [
                    {
                        "id": "electronics",
                        "name": "Electronics",
                        "imageUrl": "/images/categories/electronics.jpg",
                        "slug": "electronics"
                    },
                    {
                        "id": "fashion",
                        "name": "Fashion",
                        "imageUrl": "/images/categories/fashion.jpg",
                        "slug": "fashion"
                    },
                    {
                        "id": "home",
                        "name": "Home & Living",
                        "imageUrl": "/images/categories/home.jpg",
                        "slug": "home"
                    },
                    {
                        "id": "beauty",
                        "name": "Beauty",
                        "imageUrl": "/images/categories/beauty.jpg",
                        "slug": "beauty"
                    }
                ],
                "recommendedProducts": recommendations.get("recommended_products", [])
            },
            "context": context
        }
        if user_id.startswith("u"):
            user_profile = next((u for u in user_profiles if u["user_id"] == user_id), None)
            if user_profile:
                top_category = user_profile.get("top_categories", [""])[0]
                if top_category:
                    response["content"]["heroBanner"]["subtitle"] = f"Discover amazing {top_category} deals just for you"
        logger.info(f"Generated personalized content for user {user_id}")
        return response
    except Exception as e:
        logger.error(f"Error generating personalized content: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# --- Enhanced Analytics Endpoint ---
@router.post("/api/analytics/track")
async def track_event(request: Request):
    try:
        event_data = await request.json()
        logger.info(f"Tracking event: {json.dumps(event_data, indent=2)}")
        # Recognize and log conversion events
        if event_data.get("event_type") == "conversion":
            logger.info(f"Conversion event detected for user {event_data.get('user_id')}, details: {event_data}")
            # Here you could update conversion stats, user profiles, etc.
        # In a real app, you would:
        # 1. Validate the event data
        # 2. Store it in your analytics database
        # 3. Update user profiles in real-time (see below)
        # 4. Trigger any relevant automations
        # --- Real-time personalization note ---
        # Future: update user profile in real-time here for instant personalization
        return {"status": "success", "message": "Event tracked successfully"}
    except Exception as e:
        logger.error(f"Error tracking event: {str(e)}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))
