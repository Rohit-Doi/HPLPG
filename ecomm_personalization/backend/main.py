from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import uvicorn
import logging
from datetime import datetime
from pathlib import Path

# Import routers
from app.api.v1.endpoints import products, recommendations

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="E-commerce Personalization API",
    description="API for personalized e-commerce recommendations",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(products.router, prefix="/api/v1", tags=["products"])
app.include_router(recommendations.router, prefix="/api/v1", tags=["recommendations"])

# Mount static files (for product images, etc.)
static_dir = Path(__file__).parent / "static"
static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Health check endpoint
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "service": "ecommerce-personalization-api"
    }

# Root endpoint
@app.get("/")
async def read_root():
    return {
        "message": "Welcome to the E-commerce Personalization API",
        "docs": "/docs",
        "redoc": "/redoc"
    }

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return HTTPException(
        status_code=500,
        detail="An unexpected error occurred. Please try again later."
    )

# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = datetime.utcnow()
    
    # Skip logging for health checks and static files
    if request.url.path in ["/health", "/favicon.ico"] or \
       request.url.path.startswith("/static/") or \
       request.url.path.startswith("/docs") or \
       request.url.path.startswith("/redoc"):
        return await call_next(request)
    
    logger.info(f"Request: {request.method} {request.url}")
    
    try:
        response = await call_next(request)
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        raise
    
    process_time = (datetime.utcnow() - start_time).total_seconds() * 1000
    logger.info(f"Response: {request.method} {request.url} - Status: {response.status_code} - {process_time:.2f}ms")
    
    return response

# Run the application
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
