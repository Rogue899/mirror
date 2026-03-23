from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from db.database import get_db
from db.models import CartItem, Product

router = APIRouter()


class AddToCartRequest(BaseModel):
    product_id: int
    size: str
    quantity: int = 1


@router.get("/cart")
def get_cart(db: Session = Depends(get_db)):
    items = db.query(CartItem).filter(CartItem.session_id == "default").all()
    result = []
    for item in items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if product:
            result.append({
                "id": item.id,
                "product": {
                    "id": product.id,
                    "name": product.name,
                    "price": product.price,
                    "image": product.image,
                },
                "size": item.size,
                "quantity": item.quantity,
            })
    return result


@router.post("/cart")
def add_to_cart(req: AddToCartRequest, db: Session = Depends(get_db)):
    existing = (
        db.query(CartItem)
        .filter(
            CartItem.product_id == req.product_id,
            CartItem.size == req.size,
            CartItem.session_id == "default",
        )
        .first()
    )
    if existing:
        existing.quantity += req.quantity
    else:
        item = CartItem(
            product_id=req.product_id,
            size=req.size,
            quantity=req.quantity,
            session_id="default",
        )
        db.add(item)
    db.commit()
    return {"status": "added"}


@router.delete("/cart/{item_id}")
def remove_from_cart(item_id: int, db: Session = Depends(get_db)):
    item = db.query(CartItem).filter(CartItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")
    db.delete(item)
    db.commit()
    return {"status": "removed"}
