# Smart Fit AI Mirror

Virtual try-on system for Raspberry Pi 5. Displays a clothing store UI on a two-way mirror with real-time AR garment overlay using MediaPipe pose detection.

## Setup

### Backend (Python)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
python db/seed.py          # Seed sample products
uvicorn main:app --reload  # Starts API at http://localhost:8000
```

### Frontend (React)

```bash
cd frontend
npm install
npm run dev  # Starts dev server at http://localhost:3000
```

### Electron (Kiosk Mode)

```bash
cd electron
npm install
npm start -- --dev  # Dev mode (windowed with devtools)
npm start           # Kiosk mode (fullscreen, no cursor)
```

## 3D Garment Models

Place `.glb` or `.gltf` files in `assets/garments/`. Models should be rigged with a skeleton for body-mapped deformation. Update the `model_url` field in the product database to point to the model file.

## Architecture

- **Frontend**: React + Vite + Three.js (React Three Fiber)
- **Backend**: Python FastAPI + WebSocket
- **Vision**: OpenCV + MediaPipe Pose (33 landmarks)
- **Camera**: Picamera2 (RPi) / OpenCV fallback (desktop)
- **Database**: SQLite
- **Shell**: Electron (kiosk mode)
