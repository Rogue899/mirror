"""Virtual try-on endpoint backed by HuggingFace WeShopAI Space.

Takes a user snapshot + a product id, runs the WeShopAI Gradio Space
(IDM-VTON family) in a thread pool, and returns the photorealistic
result as a base64 data URL. Typical latency: 40-90 seconds.
"""

from __future__ import annotations

import asyncio
import base64
import os
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from gradio_client import Client, handle_file
from pydantic import BaseModel

from db.database import SessionLocal
from db.models import Product


load_dotenv()  # reads backend/.env next to main.py
router = APIRouter()

_executor = ThreadPoolExecutor(max_workers=2)
_client: Optional[Client] = None
SPACE_ID = "WeShopAI/WeShopAI-Virtual-Try-On"


def _hf_token() -> Optional[str]:
    """HF_TOKEN from env, with a cross-project fallback for dev machines."""
    tok = os.environ.get("HF_TOKEN")
    if tok:
        return tok
    fallback = Path.home() / "Desktop" / "PRSNL" / "agency-console" / ".env"
    if fallback.exists():
        for line in fallback.read_text(encoding="utf-8").splitlines():
            if line.startswith("HF_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def _get_client() -> Client:
    global _client
    if _client is None:
        token = _hf_token()
        if not token:
            raise RuntimeError("HF_TOKEN not configured")
        _client = Client(SPACE_ID, token=token, verbose=False)
    return _client


def _run_tryon_blocking(person_data_url: str, garment_url: str) -> bytes:
    """Calls the Gradio Space. Blocking — runs on the thread pool."""
    # Unpack data URL → raw JPEG bytes → temp file
    b64 = person_data_url.split(",", 1)[1] if "," in person_data_url else person_data_url
    person_bytes = base64.b64decode(b64)
    fd, person_path = tempfile.mkstemp(suffix=".jpg", prefix="sfai_tryon_")
    os.close(fd)
    Path(person_path).write_bytes(person_bytes)

    try:
        client = _get_client()
        # WeShopAI arg naming is counter-intuitive:
        #   main_image       → the GARMENT (the item you want applied)
        #   background_image → the PERSON (the scene/subject onto whom the item lands)
        # Verified empirically — swapping produces the wrong result.
        result = client.predict(
            main_image=handle_file(garment_url),
            background_image=handle_file(person_path),
            api_name="/generate_image",
        )
        # gradio_client returns either a filepath string or a dict with {path,url,...}
        if isinstance(result, dict):
            result_path = result.get("path") or result.get("url")
        else:
            result_path = result
        return Path(result_path).read_bytes()
    finally:
        try:
            os.unlink(person_path)
        except OSError:
            pass


class TryonRequest(BaseModel):
    user_image: str  # data URL (data:image/jpeg;base64,...)
    product_id: int


@router.post("/virtual-tryon")
async def virtual_tryon(req: TryonRequest):
    db = SessionLocal()
    try:
        product = db.query(Product).filter(Product.id == req.product_id).first()
        if not product:
            raise HTTPException(404, "product not found")
        if not product.image:
            raise HTTPException(400, "product has no reference image")
        garment_url = product.image
    finally:
        db.close()

    t0 = time.time()
    loop = asyncio.get_event_loop()
    try:
        result_bytes = await loop.run_in_executor(
            _executor, _run_tryon_blocking, req.user_image, garment_url
        )
    except RuntimeError as e:
        raise HTTPException(500, str(e))
    except Exception as e:
        raise HTTPException(502, f"try-on upstream failed: {type(e).__name__}: {str(e)[:200]}")

    duration_ms = int((time.time() - t0) * 1000)
    result_b64 = base64.b64encode(result_bytes).decode("ascii")
    return {
        "image": f"data:image/png;base64,{result_b64}",
        "duration_ms": duration_ms,
        "product_id": req.product_id,
    }
