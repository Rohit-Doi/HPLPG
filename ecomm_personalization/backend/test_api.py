import httpx
import asyncio
import pytest
from fastapi.testclient import TestClient
from main import app

# Create a test client
client = TestClient(app)

# Test data
SAMPLE_PRODUCT = {
    "name": "Test Product",
    "price": 99.99,
    "description": "Test Description",
    "category": "Test",
    "image": "test.jpg"
}

def test_health_check():
    """Test health check endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "timestamp" in data

# Test products endpoints
def test_get_products():
    """Test getting all products"""
    response = client.get("/api/v1/products")
    assert response.status_code == 200
    products = response.json()
    assert isinstance(products, list)

# Test recommendations endpoints
def test_get_recommendations():
    """Test getting recommendations for a user"""
    user_id = 1
    response = client.get(f"/api/v1/recommendations/{user_id}")
    assert response.status_code == 200
    recommendations = response.json()
    assert isinstance(recommendations, list)
    if len(recommendations) > 0:
        assert "product_id" in recommendations[0]
        assert "score" in recommendations[0]
        assert "reason" in recommendations[0]

# Run tests if executed directly
if __name__ == "__main__":
    import sys
    import pytest
    sys.exit(pytest.main(["-v", __file__]))
