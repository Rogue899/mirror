import base64
import cv2
import mediapipe as mp
import numpy as np


class PoseDetector:
    """MediaPipe Pose + Selfie Segmentation.

    Detects 33 body landmarks AND generates a person segmentation mask.
    The mask is used on the frontend to composite the person ON TOP of
    the 3D garment — creating realistic depth/occlusion (Zero10 technique).
    """

    # Optimal distance per MediaPipe docs: 2–4 metres from camera.
    # model_complexity=0 (Lite): ~20ms latency vs 53ms for Heavy —
    # required to hit 20-30 FPS on Raspberry Pi 5.
    # min_detection_confidence=0.6: stricter than default (0.5) to
    # avoid false positives, while keeping robust tracking.
    def __init__(self):
        self._pose = mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=0,                # Lite — 20ms, targets 30 FPS on RPi5
            smooth_landmarks=True,
            enable_segmentation=True,
            smooth_segmentation=True,
            min_detection_confidence=0.6,      # Stricter than default for fewer false positives
            min_tracking_confidence=0.6,
        )

    def detect(self, frame_bgr):
        """Process a BGR frame.

        Returns:
            landmarks: list of 33 dicts {x, y, z, visibility}
            mask_b64:  base64 PNG of the person segmentation mask
                       (white = person, black = background)
        """
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        results = self._pose.process(frame_rgb)

        landmarks = []
        mask_b64 = None

        if results.pose_landmarks:
            for lm in results.pose_landmarks.landmark:
                landmarks.append({
                    "x": round(lm.x, 4),
                    "y": round(lm.y, 4),
                    "z": round(lm.z, 4),
                    "visibility": round(lm.visibility, 4),
                })

        if results.segmentation_mask is not None:
            # Convert float mask (0-1) to uint8 alpha (0-255)
            alpha = (results.segmentation_mask * 255).astype(np.uint8)

            # Smooth edges for a cleaner composite
            alpha = cv2.GaussianBlur(alpha, (7, 7), 0)

            # Build RGBA image: white pixels with mask as alpha channel
            # Frontend uses canvas source-in compositing which checks alpha
            h, w = alpha.shape[:2]
            rgba = np.zeros((h, w, 4), dtype=np.uint8)
            rgba[:, :, 0] = 255  # R
            rgba[:, :, 1] = 255  # G
            rgba[:, :, 2] = 255  # B
            rgba[:, :, 3] = alpha  # A — person=opaque, background=transparent

            # Encode as RGBA PNG and base64
            _, buf = cv2.imencode(".png", rgba)
            mask_b64 = base64.b64encode(buf).decode("utf-8")

        return landmarks, mask_b64

    def close(self):
        self._pose.close()
