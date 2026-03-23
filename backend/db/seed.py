"""Seed the database with sample products for development."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.database import engine, Base, SessionLocal
from db.models import Product

SAMPLE_PRODUCTS = [
    {
        "name": "Classic White T-Shirt",
        "price": 29.99,
        "description": "A timeless white cotton t-shirt with a relaxed fit. Perfect for everyday wear.",
        "category": "Tops",
        "image": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400",
        "model_url": "",
        "sizes": ["XS", "S", "M", "L", "XL"],
    },
    {
        "name": "Slim Fit Denim Jeans",
        "price": 59.99,
        "description": "Modern slim fit jeans in classic indigo wash. Stretch denim for comfort.",
        "category": "Bottoms",
        "image": "https://images.unsplash.com/photo-1542272604-787c3835535d?w=400",
        "model_url": "",
        "sizes": ["S", "M", "L", "XL"],
    },
    {
        "name": "Black Hoodie",
        "price": 49.99,
        "description": "Cozy pullover hoodie in premium black cotton blend. Kangaroo pocket.",
        "category": "Tops",
        "image": "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400",
        "model_url": "",
        "sizes": ["S", "M", "L", "XL"],
    },
    {
        "name": "Leather Bomber Jacket",
        "price": 149.99,
        "description": "Classic bomber jacket in genuine leather. Ribbed cuffs and hem.",
        "category": "Outerwear",
        "image": "https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400",
        "model_url": "",
        "sizes": ["S", "M", "L", "XL"],
    },
    {
        "name": "Floral Summer Dress",
        "price": 39.99,
        "description": "Light and breezy floral print dress. Perfect for summer outings.",
        "category": "Women",
        "image": "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400",
        "model_url": "",
        "sizes": ["XS", "S", "M", "L"],
    },
    {
        "name": "Navy Chino Pants",
        "price": 44.99,
        "description": "Tailored chino pants in navy. Smart casual essential.",
        "category": "Bottoms",
        "image": "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400",
        "model_url": "",
        "sizes": ["S", "M", "L", "XL"],
    },
    {
        "name": "Striped Polo Shirt",
        "price": 34.99,
        "description": "Classic polo shirt with horizontal stripes. Breathable pique cotton.",
        "category": "Men",
        "image": "https://images.unsplash.com/photo-1625910513413-5fc42dd01bca?w=400",
        "model_url": "",
        "sizes": ["S", "M", "L", "XL"],
    },
    {
        "name": "Denim Jacket",
        "price": 79.99,
        "description": "Vintage-wash denim jacket with button front. Layering essential.",
        "category": "Outerwear",
        "image": "https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=400",
        "model_url": "",
        "sizes": ["S", "M", "L", "XL"],
    },
]


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Clear existing products
    db.query(Product).delete()

    for item in SAMPLE_PRODUCTS:
        product = Product(**item)
        db.add(product)

    db.commit()
    db.close()
    print(f"Seeded {len(SAMPLE_PRODUCTS)} products.")


if __name__ == "__main__":
    seed()
