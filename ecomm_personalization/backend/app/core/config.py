from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    PROJECT_NAME: str = "E-Commerce Personalization API"
    API_V1_STR: str = "/api/v1"
    DEBUG: bool = True
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./ecommerce.db"
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = [
        "http://localhost:3000",  # Frontend Next.js dev server
        "http://127.0.0.1:3000",   # Alternative localhost
    ]
    
    # Recommendation Settings
    RECOMMENDATION_LIMIT: int = 10
    SESSION_TIMEOUT: int = 1800  # 30 minutes in seconds
    
    class Config:
        case_sensitive = True

settings = Settings()
