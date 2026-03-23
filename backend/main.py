from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import products, cart, vision
from db.database import engine, Base

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Smart Fit AI Mirror API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(products.router, prefix="/api")
app.include_router(cart.router, prefix="/api")
app.include_router(vision.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
