import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from modules.camera import CameraManager
from modules.pose import PoseDetector
from modules.garment import extract_measurements, recommend_size

router = APIRouter()

# Dedicated thread pool for blocking camera/CV operations
_executor = ThreadPoolExecutor(max_workers=2)


def _capture_and_detect(camera: CameraManager, detector: PoseDetector):
    """Runs in a thread: capture frame + run MediaPipe pose detection.
    Both operations are CPU-blocking and must NOT run on the asyncio event loop."""
    frame, frame_b64 = camera.get_frame()
    if frame is None:
        return None
    landmarks, mask_b64 = detector.detect(frame)

    # Extract body measurements and recommended size from landmarks
    measurements = extract_measurements(landmarks) if len(landmarks) >= 33 else {}
    size = recommend_size(measurements) if measurements else None

    return {
        "frame": frame_b64,
        "mask": mask_b64,
        "landmarks": landmarks,
        "measurements": measurements,   # shoulder_width, hip_width, torso_length, leg_length
        "recommended_size": size,       # XS / S / M / L / XL
    }


@router.websocket("/ws/vision")
async def vision_websocket(websocket: WebSocket):
    await websocket.accept()
    camera = CameraManager()
    pose_detector = PoseDetector()
    streaming = False
    loop = asyncio.get_event_loop()

    try:
        while True:
            # Check for control messages (non-blocking, 10ms timeout)
            try:
                msg = await asyncio.wait_for(websocket.receive_text(), timeout=0.01)
                data = json.loads(msg)
                if data.get("action") == "start" and not streaming:
                    # Start camera in thread so it doesn't block the event loop
                    await loop.run_in_executor(_executor, camera.start)
                    streaming = True
                elif data.get("action") == "stop":
                    streaming = False
                    await loop.run_in_executor(_executor, camera.stop)
            except asyncio.TimeoutError:
                pass
            except Exception:
                pass

            if not streaming:
                await asyncio.sleep(0.05)
                continue

            # Capture + detect in thread pool (blocking ops off the event loop)
            payload = await loop.run_in_executor(
                _executor, _capture_and_detect, camera, pose_detector
            )

            if payload is None:
                await asyncio.sleep(0.03)
                continue

            await websocket.send_text(json.dumps(payload))
            # ~30 FPS — yield back to event loop between frames
            await asyncio.sleep(0.033)

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        camera.stop()
        pose_detector.close()
