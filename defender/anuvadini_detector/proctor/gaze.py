"""
Eye-movement tracking for the Work PC — a Python port of the browser eye-tracking package
(C:\\Users\\010\\Downloads\\eye-tracking, src/engine.ts, src/recorder.ts, src/types.ts).

It works out where the eyes point (centre / left / right / up / down / closed / no face) from the
MediaPipe FaceLandmarker blendshapes and head pose, against a calibrated resting position, and keeps
a numbers-only record of look-aways. No image is kept or sent: only directions, seconds and percentages.

Thresholds and rules are kept identical to the TypeScript engine so both give the same answer.
MediaPipe and OpenCV are imported lazily, so the agent still starts if they are unavailable.
"""
import math
import os
import sys
import threading
import time
import uuid
from pathlib import Path

MODEL_PATH = Path(__file__).resolve().parent.parent / "assets" / "face_landmarker.task"

NEUTRAL = {"left": 0.0, "right": 0.0, "up": 0.0, "down": 0.0, "yaw": 0.0, "pitch": 0.0}
BUCKET_SEC = 15
MAX_BUCKETS = 400
MAX_EPISODES = 200
EPISODE_MIN_SEC = 2
DIRS = ("left", "right", "up", "down")
SUMMARY_EVERY_S = 30.0


def _now_ms() -> int:
    return int(time.time() * 1000)


def _js_round(x: float) -> int:
    return int(math.floor(x + 0.5))


# ─── Loading the face model ───────────────────────────────────────────────────

def make_landmarker():
    """MediaPipe FaceLandmarker in VIDEO mode, the same options as the browser engine."""
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision

    options = vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=str(MODEL_PATH)),
        running_mode=vision.RunningMode.VIDEO,
        num_faces=3,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_face_blendshapes=True,
        output_facial_transformation_matrixes=True,
    )
    return vision.FaceLandmarker.create_from_options(options)


# ─── Reading one frame ────────────────────────────────────────────────────────

def read_frame(result) -> dict:
    """Plain eye and head-pose numbers from one FaceLandmarker result (readFrame in engine.ts)."""
    landmarks = getattr(result, "face_landmarks", None) or []
    faces = len(landmarks)
    if not faces:
        return {"faces": 0, "eyes": None, "yaw": 0.0, "pitch": 0.0, "box": None, "nose": None}

    blend = getattr(result, "face_blendshapes", None) or []
    cats = {c.category_name: float(c.score) for c in (blend[0] if blend else [])}

    def g(key):
        return cats.get(key, 0.0)

    # "Left" in the blendshape names is the learner's own left eye.
    eyes = {
        "left": (g("eyeLookOutLeft") + g("eyeLookInRight")) / 2,
        "right": (g("eyeLookOutRight") + g("eyeLookInLeft")) / 2,
        "up": (g("eyeLookUpLeft") + g("eyeLookUpRight")) / 2,
        "down": (g("eyeLookDownLeft") + g("eyeLookDownRight")) / 2,
        "closed": (g("eyeBlinkLeft") + g("eyeBlinkRight")) / 2,
    }

    yaw = 0.0
    pitch = 0.0
    mats = getattr(result, "facial_transformation_matrixes", None) or []
    if mats is not None and len(mats) > 0:
        m = mats[0]
        # row-major 4x4: the same three rotation entries the browser reads from its column-major data
        r20, r21, r22 = float(m[2][0]), float(m[2][1]), float(m[2][2])
        yaw = math.degrees(math.atan2(-r20, math.hypot(r21, r22)))
        pitch = math.degrees(math.atan2(r21, r22))
        if pitch > 90:
            pitch -= 180
        elif pitch < -90:
            pitch += 180

    pts = landmarks[0]
    xs = [p.x for p in pts]
    ys = [p.y for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)

    nose = None
    if len(pts) > 263:
        a, b, tip = pts[33], pts[263], pts[1]
        w = math.hypot(b.x - a.x, b.y - a.y)
        if w > 0.01:
            nose = {"x": (tip.x - (a.x + b.x) / 2) / w, "y": (tip.y - (a.y + b.y) / 2) / w}

    return {
        "faces": faces,
        "eyes": eyes,
        "yaw": yaw,
        "pitch": pitch,
        "box": {"x": x0, "y": y0, "w": x1 - x0, "h": y1 - y0},
        "nose": nose,
    }


# ─── Judging where the eyes point ─────────────────────────────────────────────

def judge(f: dict, base: dict) -> dict:
    if not f["faces"] or not f["eyes"]:
        return {"gaze": None, "eyesClosed": False, "headTurned": False}
    eyes_closed = f["eyes"]["closed"] > 0.55
    gaze = "centre"
    if not eyes_closed:
        left = f["eyes"]["left"] - base["left"]
        right = f["eyes"]["right"] - base["right"]
        if left > 0.38 and left >= right:
            gaze = "left"
        elif right > 0.38:
            gaze = "right"
        elif f["eyes"]["up"] - base["up"] > 0.35:
            gaze = "up"
        elif f["eyes"]["down"] - base["down"] > 0.4:
            gaze = "down"
    head_turned = abs(f["yaw"] - base["yaw"]) > 28 or abs(f["pitch"] - base["pitch"]) > 25
    return {"gaze": gaze, "eyesClosed": eyes_closed, "headTurned": head_turned}


def head_direction(f: dict, base: dict) -> str:
    dyaw = f["yaw"] - base["yaw"]
    dpitch = f["pitch"] - base["pitch"]
    if abs(dyaw) / 28 >= abs(dpitch) / 25:
        base_x = base.get("noseX") or 0.0
        dx = (f["nose"]["x"] - base_x) if f["nose"] else dyaw
        return "left" if dx >= 0 else "right"
    base_y = base.get("noseY")
    dy = (f["nose"]["y"] - base_y) if (f["nose"] and base_y is not None) else dpitch
    return "down" if dy >= 0 else "up"


def gaze_state(f: dict, base: dict) -> str:
    """The frame as one word: eye direction first, then a turned head."""
    if not f["faces"] or not f["eyes"]:
        return "noface"
    j = judge(f, base)
    if j["eyesClosed"]:
        return "closed"
    if j["gaze"] and j["gaze"] != "centre":
        return j["gaze"]
    if j["headTurned"]:
        return head_direction(f, base)
    return "centre"


# ─── Calibration (finding the resting position) ───────────────────────────────

def cap_baseline(s: dict) -> dict:
    def cap(v, m):
        return max(-m, min(m, v))

    return {
        "left": cap(s["left"], 0.35),
        "right": cap(s["right"], 0.35),
        "up": cap(s["up"], 0.3),
        "down": cap(s["down"], 0.45),
        "yaw": cap(s["yaw"], 20),
        "pitch": cap(s["pitch"], 20),
        "noseX": s.get("noseX"),
        "noseY": s.get("noseY"),
    }


def usable_frame(f: dict) -> bool:
    return f["faces"] == 1 and bool(f["eyes"]) and f["eyes"]["closed"] <= 0.5


class Calibrator:
    """Running average of resting gaze and head pose over the last ~3 s of frames."""

    def __init__(self):
        self.n = 0
        self.sum = dict(NEUTRAL)

    def add(self, f: dict):
        if not usable_frame(f):
            return
        k = min(self.n, 14)

        def mix(a, b):
            return (a * k + b) / (k + 1)

        s = self.sum
        new = {
            "left": mix(s["left"], f["eyes"]["left"]),
            "right": mix(s["right"], f["eyes"]["right"]),
            "up": mix(s["up"], f["eyes"]["up"]),
            "down": mix(s["down"], f["eyes"]["down"]),
            "yaw": mix(s["yaw"], f["yaw"]),
            "pitch": mix(s["pitch"], f["pitch"]),
        }
        if f["nose"]:
            prev_x = s.get("noseX")
            prev_y = s.get("noseY")
            new["noseX"] = mix(f["nose"]["x"] if prev_x is None else prev_x, f["nose"]["x"])
            new["noseY"] = mix(f["nose"]["y"] if prev_y is None else prev_y, f["nose"]["y"])
        else:
            new["noseX"] = s.get("noseX")
            new["noseY"] = s.get("noseY")
        self.sum = new
        self.n += 1

    @property
    def ready(self) -> bool:
        return self.n >= 8

    @property
    def value(self) -> dict:
        return cap_baseline(self.sum)


# ─── The eye record (GazeRecorder in recorder.ts) ────────────────────────────

def _is_away(s: str) -> bool:
    return s in DIRS or s == "noface"


class GazeRecorder:
    """Folds frames into once-a-second samples and a cumulative summary for one run."""

    def __init__(self, calibration=None):
        self.run = uuid.uuid4().hex[:16]
        self.started_at = _now_ms()
        self.calibration = calibration
        self.samples = 0
        self.on_screen = 0
        self.away = {d: 0 for d in DIRS}
        self.closed = 0
        self.no_face = 0
        self.frames = []
        self.last_sample_at = 0
        self.open = None
        self.episodes = []
        self.look_aways = 0
        self.longest = 0
        self.buckets = {}

    def see(self, s: str):
        if len(self.frames) < 30:
            self.frames.append(s)

    def tick(self, now=None):
        now = _now_ms() if now is None else int(now)
        if not self.frames:
            if self.open and now - self.last_sample_at > 2500:
                self._close_episode()
            return None
        tally = {}
        for f in self.frames:
            tally[f] = tally.get(f, 0) + 1
        best = self.frames[-1]
        for k, n in tally.items():
            if n > tally.get(best, 0):
                best = k
        self.frames = []
        if self.open and now - self.last_sample_at > 2500:
            self._close_episode()
        self.last_sample_at = now

        self.samples += 1
        if best == "centre":
            self.on_screen += 1
        elif best == "closed":
            self.closed += 1
        elif best == "noface":
            self.no_face += 1
        else:
            self.away[best] += 1

        step = BUCKET_SEC * 1000
        key = ((now - 1) // step) * step
        b = self.buckets.get(key, {"n": 0, "on": 0})
        b["n"] += 1
        if best == "centre":
            b["on"] += 1
        self.buckets[key] = b

        if _is_away(best):
            if not self.open:
                self.open = {"at": now - 1000, "sec": 0, "calm": 0,
                             "dirs": {"left": 0, "right": 0, "up": 0, "down": 0, "noface": 0}}
            self.open["sec"] += 1 + self.open["calm"]  # a calm second inside a look-away is part of it
            self.open["calm"] = 0
            self.open["dirs"][best] += 1
        elif self.open:
            self.open["calm"] += 1
            if self.open["calm"] >= 2:
                self._close_episode()
        return best

    def _episode_of(self, o: dict) -> dict:
        best = "noface"
        for d in DIRS + ("noface",):
            if o["dirs"][d] > o["dirs"][best]:
                best = d
        return {"at": o["at"], "sec": o["sec"], "dir": best}

    def _close_episode(self):
        o = self.open
        self.open = None
        if not o or o["sec"] < EPISODE_MIN_SEC:
            return
        e = self._episode_of(o)
        if e["dir"] != "noface":
            self.look_aways += 1
            self.longest = max(self.longest, e["sec"])
        self.episodes.append(e)
        if len(self.episodes) > MAX_EPISODES:
            drop = min(range(len(self.episodes)), key=lambda i: self.episodes[i]["sec"])
            del self.episodes[drop]

    def summary(self, final: bool = False) -> dict:
        if final:
            self._close_episode()
        open_ep = self._episode_of(self.open) if (self.open and self.open["sec"] >= EPISODE_MIN_SEC) else None
        episodes = (self.episodes + [open_ep])[-MAX_EPISODES:] if open_ep else list(self.episodes)
        open_away = open_ep is not None and open_ep["dir"] != "noface"

        width = BUCKET_SEC
        keys = sorted(self.buckets)
        span = ((keys[-1] - keys[0]) / 1000 + BUCKET_SEC) if keys else 0
        while span / width > MAX_BUCKETS - 1:
            width *= 2
        merged = {}
        for k in keys:
            at = (k // (width * 1000)) * width * 1000
            src = self.buckets[k]
            m = merged.setdefault(at, {"n": 0, "on": 0})
            m["n"] += src["n"]
            m["on"] += src["on"]
        timeline = [
            {"t": t, "n": m["n"], "sec": width, "onPct": _js_round(m["on"] / m["n"] * 100)}
            for t, m in merged.items()
        ]
        return {
            "run": self.run,
            "startedAt": self.started_at,
            "sentAt": _now_ms(),
            "bucketSec": width,
            "samples": self.samples,
            "onScreenSec": self.on_screen,
            "away": dict(self.away),
            "closedSec": self.closed,
            "noFaceSec": self.no_face,
            "lookAways": self.look_aways + (1 if open_away else 0),
            "longestSec": max(self.longest, open_ep["sec"] if open_away else 0),
            "episodes": episodes,
            "timeline": timeline,
            "calibration": self.calibration,
        }


# ─── Running it on the webcam ─────────────────────────────────────────────────

CALIBRATE_S = 2.0
FRAME_GAP_S = 0.12  # about 6 frames a second: enough for direction, light on the PC


class GazeSession:
    """
    One pass of the camera check: calibrate for ~2 s, then judge every frame and record it.
    Frames are processed in memory only. `keep_running()` decides when to stop; `on_summary` gets the
    cumulative record every 30 s and once more at the end.
    """

    def __init__(self, keep_running, on_summary=None, on_jpeg=None):
        self.keep_running = keep_running
        self.on_summary = on_summary
        self.on_jpeg = on_jpeg
        self.recorder = GazeRecorder()
        self.first_face_ms = None

    def run(self) -> GazeRecorder:
        import cv2

        landmarker = None
        cap = None
        base = None
        calibrator = Calibrator()
        try:
            landmarker = make_landmarker()
            cap = cv2.VideoCapture(0, cv2.CAP_DSHOW if sys.platform == "win32" else cv2.CAP_ANY)
            if not cap.isOpened():
                return self.recorder
            from mediapipe import Image, ImageFormat

            start = time.monotonic()
            last_tick = start
            last_post = start
            last_jpeg = 0.0
            while self.keep_running():
                ok, frame = cap.read()
                if not ok or frame is None:
                    time.sleep(0.25)
                    continue
                now = time.monotonic()
                if self.on_jpeg and now - last_jpeg >= 1.0:
                    last_jpeg = now
                    try:
                        small = cv2.resize(frame, (480, 270))
                        okj, buf = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 60])
                        if okj:
                            self.on_jpeg(buf.tobytes())
                    except Exception:
                        pass

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                image = Image(image_format=ImageFormat.SRGB, data=rgb)
                result = landmarker.detect_for_video(image, int(now * 1000))
                f = read_frame(result)

                if base is None:
                    calibrator.add(f)
                    if now - start >= CALIBRATE_S and calibrator.ready:
                        base = calibrator.value
                else:
                    state = gaze_state(f, base)
                    if state != "noface" and self.first_face_ms is None:
                        self.first_face_ms = int((now - start) * 1000)
                    self.recorder.see(state)
                    if now - last_tick >= 1.0:
                        last_tick = now
                        self.recorder.tick()
                    if self.on_summary and now - last_post >= SUMMARY_EVERY_S:
                        last_post = now
                        self.on_summary(self.recorder.summary(), False)
                time.sleep(FRAME_GAP_S)
        except Exception as e:  # never let the camera check take the agent down
            print(f"[Proctor] eye tracking stopped: {e}")
        finally:
            if cap is not None:
                try:
                    cap.release()
                except Exception:
                    pass
            if landmarker is not None:
                try:
                    landmarker.close()
                except Exception:
                    pass
            if self.on_summary and self.recorder.samples:
                try:
                    self.on_summary(self.recorder.summary(final=True), True)
                except Exception:
                    pass
        return self.recorder


class GazeTracker:
    """
    Keeps one background GazeSession running while the employee is on the watch list.
    The proctor calls keep_alive() on each cycle; the session stops ~20 s after the calls end
    (for example when the employee checks out or the watch is removed).
    """

    ALIVE_S = 20.0

    def __init__(self):
        self._lock = threading.Lock()
        self._thread = None
        self._deadline = 0.0
        self._jpeg = None
        self._jpeg_at = 0.0

    def is_running(self) -> bool:
        return self._thread is not None and self._thread.is_alive() and time.time() < self._deadline

    def latest_jpeg(self):
        """The newest small webcam frame from the running session (None when tracking is not running)."""
        if not self.is_running() or self._jpeg is None or time.time() - self._jpeg_at > 5:
            return None
        return self._jpeg

    def keep_alive(self, server_url: str, hostname: str, employee_id: str):
        self._deadline = time.time() + self.ALIVE_S
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._thread = threading.Thread(
                target=self._run, args=(server_url, hostname, employee_id), daemon=True
            )
            self._thread.start()

    def stop_and_wait(self, timeout: float = 10.0):
        """Stop the running session now (the camera is needed for a one-off presence check)."""
        self._deadline = 0.0
        t = self._thread
        if t is not None and t.is_alive():
            t.join(timeout)

    def _run(self, server_url: str, hostname: str, employee_id: str):
        from anuvadini_detector.proctor.agent import post_gaze_summary

        def on_summary(summary, final):
            post_gaze_summary(server_url, hostname, employee_id, summary)

        def on_jpeg(data: bytes):
            self._jpeg = data
            self._jpeg_at = time.time()

        session = GazeSession(
            keep_running=lambda: time.time() < self._deadline,
            on_summary=on_summary,
            on_jpeg=on_jpeg,
        )
        session.run()
        self._jpeg = None


def presence_check(duration_s: float = 15.0):
    """A short eye check for an admin's challenge: returns (face_seconds, on_screen_pct, first_face_ms, summary)."""
    end = time.time() + duration_s
    session = GazeSession(keep_running=lambda: time.time() < end)
    rec = session.run()
    summary = rec.summary(final=True)
    samples = summary["samples"]
    face_secs = samples - summary["noFaceSec"]
    on_pct = int(round(summary["onScreenSec"] / samples * 100)) if samples else 0
    face_pct = int(round(face_secs / samples * 100)) if samples else 0
    return face_pct, on_pct, session.first_face_ms, summary
