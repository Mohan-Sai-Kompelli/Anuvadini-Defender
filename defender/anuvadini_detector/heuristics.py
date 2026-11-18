"""
Anuvadini Detector - Cursor Trajectory & Synthetic Mouse Jiggler Heuristics
Mathematical entropy and vector trajectory analysis to detect:
1. Automated mouse jigglers (software scripts or USB dongles)
2. Mechanical repetitive motion bots
3. Constant-velocity synthetic cursor injection (Anti-AFK bypass)
"""

import sys
import math
import time
from collections import deque

# History of cursor positions: (x, y, timestamp)
_CURSOR_HISTORY = deque(maxlen=40)
_LAST_SAMPLE_TIME = 0
_SYNTH_SINCE = None   # wall-clock time the synthetic pattern was first seen (reset when it stops)
SYNTH_MIN_SECONDS = 20.0

def get_cursor_pos() -> tuple[int, int] | None:
    """Retrieve current desktop cursor coordinates across platforms."""
    if sys.platform == "win32":
        try:
            import ctypes
            from ctypes import wintypes
            class POINT(ctypes.Structure):
                _fields_ = [("x", wintypes.LONG), ("y", wintypes.LONG)]
            pt = POINT()
            if ctypes.windll.user32.GetCursorPos(ctypes.byref(pt)):
                return (pt.x, pt.y)
        except Exception:
            pass
    elif sys.platform == "darwin":
        try:
            import Quartz
            loc = Quartz.NSEvent.mouseLocation()
            return (int(loc.x), int(loc.y))
        except Exception:
            pass
    return None

def analyze_cursor_movement() -> dict:
    """
    Analyzes cursor movement dynamics over the last ~30-40 samples.
    Real human mouse movement exhibits:
    - High angular velocity variation (erratic micro-jitters)
    - Acceleration and deceleration phases
    - Natural micro-pauses (> 100ms)

    Synthetic jigglers exhibit:
    - Exact repetitive paths (circle, square, sine wave, 1px ping-pong)
    - Uniform velocity with near-zero acceleration variance
    - Zero human deceleration at stopping points
    """
    global _LAST_SAMPLE_TIME
    now = time.time()
    
    # Sample every ~100ms
    if now - _LAST_SAMPLE_TIME < 0.1:
        return {"is_synthetic": False, "confidence": 0.0, "reason": "Sampling"}
        
    _LAST_SAMPLE_TIME = now
    pos = get_cursor_pos()
    if not pos:
        return {"is_synthetic": False, "confidence": 0.0, "reason": "No cursor API"}

    _CURSOR_HISTORY.append((pos[0], pos[1], now))

    # Need at least 25 samples for statistical significance (~2.5-3 seconds of movement)
    if len(_CURSOR_HISTORY) < 25:
        return {"is_synthetic": False, "confidence": 0.0, "reason": "Collecting samples"}

    samples = list(_CURSOR_HISTORY)
    
    # 1. Calculate step distances and velocities
    distances = []
    velocities = []
    angles = []
    
    for i in range(1, len(samples)):
        x0, y0, t0 = samples[i - 1]
        x1, y1, t1 = samples[i]
        dt = max(0.001, t1 - t0)
        dist = math.hypot(x1 - x0, y1 - y0)
        distances.append(dist)
        velocities.append(dist / dt)
        if dist > 0.5:
            angles.append(math.atan2(y1 - y0, x1 - x0))

    # If completely stationary, not a jiggler (just normal user away from desk)
    total_movement = sum(distances)
    if total_movement < 5.0:
        return {"is_synthetic": False, "confidence": 0.0, "reason": "Stationary"}

    # Real hands drift, accelerate and wander; software/USB jigglers repeat EXACT positions or EXACT displacement cycles.
    # Only exact repetition is treated as evidence, and only after it has persisted (see SYNTH_MIN_SECONDS).
    raw_reason = None
    positions = [(int(x), int(y)) for x, y, _ in samples]
    moves = sum(1 for i in range(1, len(positions)) if positions[i] != positions[i - 1])

    # A) Ping-pong between a handful of pixels (classic 1px jiggler): very few distinct positions, many moves.
    if len(set(positions)) <= 4 and moves >= 8 and max(distances) <= 5.0:
        raw_reason = "Micro-jiggler: cursor oscillates between <=4 exact pixels (Fake Idle Bypass)"

    # B) Exact periodic path (square / circle / sine macros): the displacement sequence repeats verbatim.
    if raw_reason is None:
        disp = [(positions[i][0] - positions[i - 1][0], positions[i][1] - positions[i - 1][1])
                for i in range(1, len(positions))]
        n = len(disp)
        for period in range(2, 9):
            if n >= period * 4 and any(d != (0, 0) for d in disp[:period]) and \
                    all(disp[i] == disp[i + period] for i in range(n - period)):
                raw_reason = f"Exact repeating cursor path (period {period}) - scripted jiggler / macro"
                break

    global _SYNTH_SINCE
    if raw_reason is None:
        _SYNTH_SINCE = None
        return {"is_synthetic": False, "confidence": 0.0, "reason": "Natural human trajectory"}

    if _SYNTH_SINCE is None:
        _SYNTH_SINCE = now
    if now - _SYNTH_SINCE < SYNTH_MIN_SECONDS:
        return {"is_synthetic": False, "confidence": 0.3,
                "reason": f"Possible jiggler, confirming ({now - _SYNTH_SINCE:.0f}s/{SYNTH_MIN_SECONDS:.0f}s)"}

    return {"is_synthetic": True, "confidence": 0.95, "reason": raw_reason}
