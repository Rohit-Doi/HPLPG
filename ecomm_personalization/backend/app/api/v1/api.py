from fastapi import APIRouter

from .endpoints import recommendations, products, profile
from app.api.personalize.route import router as personalize_router

api_router = APIRouter()

# Include all endpoint routers here
api_router.include_router(recommendations.router, prefix="/recommendations", tags=["recommendations"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(profile.router, prefix="/profile", tags=["profile"])
api_router.include_router(personalize_router, prefix="/personalize", tags=["personalize"])
