import base64
import platform
import cv2


class CameraManager:
    """Camera abstraction: uses Picamera2 on RPi, falls back to OpenCV VideoCapture."""

    def __init__(self):
        self._cap = None
        self._picam = None
        self._use_picam = False

    def start(self):
        if self._cap is not None or self._picam is not None:
            return

        # Try Picamera2 first (Raspberry Pi)
        try:
            from picamera2 import Picamera2
            self._picam = Picamera2()
            self._picam.configure(
                self._picam.create_preview_configuration(
                    main={"size": (640, 480), "format": "RGB888"}
                )
            )
            self._picam.start()
            self._use_picam = True
            return
        except (ImportError, RuntimeError):
            pass

        # On Windows use DirectShow backend — much faster open, more reliable
        if platform.system() == "Windows":
            self._cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
        else:
            self._cap = cv2.VideoCapture(0)

        self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self._cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)   # minimize latency

    def get_frame(self):
        """Returns (frame_bgr, frame_base64_jpeg) or (None, None)."""
        frame = None

        if self._use_picam and self._picam:
            frame_rgb = self._picam.capture_array()
            frame = cv2.cvtColor(frame_rgb, cv2.COLOR_RGB2BGR)
        elif self._cap and self._cap.isOpened():
            ret, frame = self._cap.read()
            if not ret:
                return None, None

        if frame is None:
            return None, None

        _, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        frame_b64 = base64.b64encode(buffer).decode("utf-8")
        return frame, frame_b64

    def stop(self):
        if self._picam:
            try:
                self._picam.stop()
            except Exception:
                pass
            self._picam = None
            self._use_picam = False

        if self._cap:
            self._cap.release()
            self._cap = None
