from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import Product

router = APIRouter()


@router.get("/products")
def list_products(category: str = None, db: Session = Depends(get_db)):
    query = db.query(Product)
    if category:
        query = query.filter(Product.category == category)
    products = query.all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "price": p.price,
            "description": p.description,
            "category": p.category,
            "image": p.image,
            "model_url": p.model_url,
            "sizes": p.sizes or [],
        }
        for p in products
    ]


@router.get("/products/{product_id}")
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return {
        "id": product.id,
        "name": product.name,
        "price": product.price,
        "description": product.description,
        "category": product.category,
        "image": product.image,
        "model_url": product.model_url,
        "sizes": product.sizes or [],
    }
