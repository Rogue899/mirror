import math


# MediaPipe Pose landmark indices
LANDMARKS = {
    "LEFT_SHOULDER": 11,
    "RIGHT_SHOULDER": 12,
    "LEFT_ELBOW": 13,
    "RIGHT_ELBOW": 14,
    "LEFT_WRIST": 15,
    "RIGHT_WRIST": 16,
    "LEFT_HIP": 23,
    "RIGHT_HIP": 24,
    "LEFT_KNEE": 25,
    "RIGHT_KNEE": 26,
    "LEFT_ANKLE": 27,
    "RIGHT_ANKLE": 28,
}


def _distance(a, b):
    """Euclidean distance between two landmarks."""
    return math.sqrt((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2)


def extract_measurements(landmarks):
    """Extract body measurements from 33 MediaPipe landmarks.

    Returns dict with normalized measurements (relative proportions).
    Actual cm values require a calibration step with known reference.
    """
    if len(landmarks) < 33:
        return {}

    ls = landmarks[LANDMARKS["LEFT_SHOULDER"]]
    rs = landmarks[LANDMARKS["RIGHT_SHOULDER"]]
    lh = landmarks[LANDMARKS["LEFT_HIP"]]
    rh = landmarks[LANDMARKS["RIGHT_HIP"]]
    lk = landmarks[LANDMARKS["LEFT_KNEE"]]
    rk = landmarks[LANDMARKS["RIGHT_KNEE"]]
    la = landmarks[LANDMARKS["LEFT_ANKLE"]]
    ra = landmarks[LANDMARKS["RIGHT_ANKLE"]]

    shoulder_width = _distance(ls, rs)
    hip_width = _distance(lh, rh)
    torso_length = _distance(
        {"x": (ls["x"] + rs["x"]) / 2, "y": (ls["y"] + rs["y"]) / 2},
        {"x": (lh["x"] + rh["x"]) / 2, "y": (lh["y"] + rh["y"]) / 2},
    )
    leg_length = (_distance(lh, lk) + _distance(lk, la) + _distance(rh, rk) + _distance(rk, ra)) / 2

    return {
        "shoulder_width": round(shoulder_width, 4),
        "hip_width": round(hip_width, 4),
        "torso_length": round(torso_length, 4),
        "leg_length": round(leg_length, 4),
    }


def recommend_size(measurements):
    """Simple size recommendation based on shoulder width ratio.

    This is a placeholder — real implementation should use a trained model
    or lookup table calibrated with actual garment measurements.
    """
    sw = measurements.get("shoulder_width", 0)

    if sw < 0.15:
        return "XS"
    elif sw < 0.20:
        return "S"
    elif sw < 0.25:
        return "M"
    elif sw < 0.30:
        return "L"
    else:
        return "XL"
