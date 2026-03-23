"""
Quick helper: assign a GLB model to a product.

Usage:
  python db/set_model.py <product_id> <filename.glb>

Example:
  python db/set_model.py 1 tshirt.glb
  python db/set_model.py 3 hoodie.glb

The file must exist in: frontend/public/garments/<filename.glb>
The model_url stored will be: /garments/<filename.glb>
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.database import SessionLocal
from db.models import Product


def set_model(product_id: int, filename: str):
    # Validate the file exists where Vite can serve it
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    file_path = os.path.join(project_root, "frontend", "public", "garments", filename)

    if not os.path.exists(file_path):
        print(f"ERROR: File not found at {file_path}")
        print(f"Place your .glb file in: frontend/public/garments/")
        return

    model_url = f"/garments/{filename}"

    db = SessionLocal()
    product = db.query(Product).filter(Product.id == product_id).first()

    if not product:
        print(f"ERROR: No product with id={product_id}")
        db.close()
        return

    product.model_url = model_url
    db.commit()

    print(f"✅ Updated product [{product.id}] '{product.name}'")
    print(f"   model_url = {model_url}")
    db.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)

    try:
        pid = int(sys.argv[1])
    except ValueError:
        print("ERROR: product_id must be an integer")
        sys.exit(1)

    set_model(pid, sys.argv[2])
