from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()

# Pydantic models for request/response validation
class ProductBase(BaseModel):
    name: str
    price: float
    description: str
    category: str
    image: str

class ProductCreate(ProductBase):
    pass

class Product(ProductBase):
    id: int
    
    class Config:
        from_attributes = True

# Mock product data
MOCK_PRODUCTS = [
    {
        "id": 1,
        "name": "Nike Air Max",
        "price": 129.99,
        "description": "Comfortable running shoes with great support",
        "category": "Shoes",
        "image": "https://example.com/nike-air-max.jpg"
    },
    {
        "id": 2,
        "name": "Adidas Ultraboost",
        "price": 149.99,
        "description": "Lightweight and responsive running shoes",
        "category": "Shoes",
        "image": "https://example.com/adidas-ultraboost.jpg"
    },
    {
        "id": 3,
        "name": "Puma RS-X",
        "price": 119.99,
        "description": "Stylish and comfortable sneakers",
        "category": "Shoes",
        "image": "https://example.com/puma-rsx.jpg"
    }
]

@router.get("/", response_model=List[Product])
async def get_products():
    """
    Get a list of all products
    """
    return MOCK_PRODUCTS

@router.get("/{product_id}", response_model=Product)
async def get_product(product_id: int):
    """
    Get a single product by ID
    """
    product = next((p for p in MOCK_PRODUCTS if p["id"] == product_id), None)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
