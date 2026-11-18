"""
Proctor — Agent-side module for enhanced employee monitoring.

Responsibilities:
  - Track foreground application switches and report them as proctor events.
  - Take periodic screen evidence snapshots.
  - Detect extended idle periods and fire idle_alert events.
  - Eye-movement record (replaces the old webcam snapshots and liveness dialog): while the employee
    is on the watch list and the camera is allowed, the PC tracks where the eyes point and sends only
    numbers (on-screen %, look-aways, timeline). No webcam image is kept or sent.
  - Answer an admin's presence check with a short 15-second eye check.
"""
import base64
import io
import logging
import threading
import time
import urllib.request
import json

logger = logging.getLogger(__name__)

# ─── Idle threshold ────────────────────────────────────────────────────────────
IDLE_ALERT_THRESHOLD_S = 300   # 5 minutes — fire an idle_alert event
IDLE_ALERT_COOLDOWN_S  = 120   # don't re-fire more often than every 2 min
PRESENCE_CHECK_S       = 15    # length of an admin's presence check
PRESENCE_MIN_FACE_PCT  = 50    # face in view for at least this share of the check = responded

# ─── Low-level HTTP helper (no third-party libs required on agent PC) ──────────

def _post(url: str, payload: dict, timeout: int = 8) -> dict:
    try:
        body = json.dumps(payload).encode()
        req  = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        logger.debug("proctor POST %s failed: %s", url, e)
        return {}


# Set by the agent: True only when the admin allowed the camera and the employee has not switched it off.
CAMERA_ALLOWED = lambda: False


def _capture_screen_bytes(quality: int = 55) -> bytes | None:
    """Capture the desktop as JPEG bytes, return None on any failure."""
    try:
        from anuvadini_detector.evidence import capture_screen_universal
        img = capture_screen_universal()
        if img is None:
            return None
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=quality)
        return buf.getvalue()
    except Exception as e:
        logger.debug("screen capture failed: %s", e)
        return None


# ─── Event poster ──────────────────────────────────────────────────────────────

def post_proctor_event(
    server_url: str,
    hostname:   str,
    employee_id: str,
    event_type: str,
    detail:     str = "",
    screenshot_bytes: bytes | None = None,
):
    """Send one proctor event, optionally with a JPEG screenshot payload."""
    b64 = base64.b64encode(screenshot_bytes).decode() if screenshot_bytes else ""
    _post(
        f"{server_url}/api/fleet/proctor-event",
        {
            "hostname":       hostname,
            "employee_id":    employee_id,
            "event_type":     event_type,
            "detail":         detail,
            "screenshot_b64": b64,
        },
    )


def post_gaze_summary(server_url: str, hostname: str, employee_id: str, summary: dict):
    """Send the cumulative eye record of this run (numbers only)."""
    _post(
        f"{server_url}/api/fleet/proctor-gaze",
        {"hostname": hostname, "employee_id": employee_id, "summary": summary},
    )


# ─── Eye-movement tracking (shared by the watch and the presence check) ──────

from anuvadini_detector.proctor.gaze import GazeTracker, presence_check  # noqa: E402

GAZE = GazeTracker()


# ─── Presence check (admin challenge) ──────────────────────────────────────────

def handle_liveness_challenge(
    server_url:   str,
    hostname:     str,
    employee_id:  str,
    challenge_id: int,
):
    """
    Admin's presence check: a 15-second eye check on the camera.
    Responded when a face is in view for at least half of the check; otherwise missed.
    Only numbers are sent back.
    """
    def _run():
        if not CAMERA_ALLOWED():
            post_proctor_event(
                server_url, hostname, employee_id,
                "challenge_missed", f"challenge_id={challenge_id} camera_off",
            )
            return
        # The continuous eye record uses the camera; stop it for this one check.
        GAZE.stop_and_wait()
        started = time.monotonic()
        face_pct, on_pct, first_face_ms, _summary = presence_check(PRESENCE_CHECK_S)
        detail = f"challenge_id={challenge_id} face={face_pct}% on_screen={on_pct}%"
        if face_pct >= PRESENCE_MIN_FACE_PCT:
            elapsed_ms = first_face_ms if first_face_ms is not None else int((time.monotonic() - started) * 1000)
            _post(
                f"{server_url}/api/fleet/proctor-challenge-response",
                {
                    "hostname":         hostname,
                    "employee_id":      employee_id,
                    "challenge_id":     challenge_id,
                    "response_time_ms": elapsed_ms,
                },
            )
            post_proctor_event(server_url, hostname, employee_id, "challenge_responded", detail)
        else:
            post_proctor_event(server_url, hostname, employee_id, "challenge_missed", detail)

    threading.Thread(target=_run, daemon=True).start()


# ─── ProctorMode — stateful per-session tracker ────────────────────────────────

class ProctorMode:
    """
    Call tick() every agent heartbeat cycle (every ~5 s) while proctor_active is True.

    Tracks:
      • Foreground app title changes  → app_switch events
      • Periodic screen snapshots     → snapshot events  (default every 30 s)
      • Extended idle detection       → idle_alert events (after IDLE_ALERT_THRESHOLD_S)
      • Eye-movement record           → proctor-gaze summaries (numbers only, camera allowed only)
    """

    def __init__(self, screen_interval_s: int = 30):
        self._last_title:          str   = ""
        self._screen_interval             = screen_interval_s
        self._last_screen_at:      float  = 0.0
        self._idle_alerted_at:     float  = 0.0
        self._was_idle:            bool   = False

    # ── public ────────────────────────────────────────────────────────────────

    def tick(
        self,
        server_url:   str,
        hostname:     str,
        employee_id:  str,
        idle_sec:     float = 0.0,
    ):
        """
        One monitoring cycle. Call every agent heartbeat (~5 s) while watched.
        The screen snapshot is captured in a background thread so the heartbeat is never blocked.
        """
        now = time.monotonic()

        # 1. App-switch detection
        current_title = _get_foreground_title()
        if current_title and current_title != self._last_title:
            post_proctor_event(
                server_url, hostname, employee_id,
                "app_switch",
                f'from="{self._last_title}" to="{current_title}"',
            )
            self._last_title = current_title

        # 2. Idle detection
        if idle_sec >= IDLE_ALERT_THRESHOLD_S:
            if not self._was_idle or (now - self._idle_alerted_at) >= IDLE_ALERT_COOLDOWN_S:
                post_proctor_event(
                    server_url, hostname, employee_id,
                    "idle_alert",
                    f"idle_for={int(idle_sec)}s",
                )
                self._idle_alerted_at = now
                self._was_idle = True
        else:
            if self._was_idle:
                # Employee returned — note the return
                post_proctor_event(
                    server_url, hostname, employee_id,
                    "returned_from_idle",
                    f"was_idle_for≈{int(idle_sec)}s",
                )
            self._was_idle = False

        # 3. Periodic screen snapshot — capture only when due (background thread)
        if (now - self._last_screen_at) >= self._screen_interval:
            self._last_screen_at = now   # mark before thread starts to avoid double-fire
            threading.Thread(
                target=self._upload_snapshot,
                args=(server_url, hostname, employee_id),
                daemon=True,
            ).start()

        # 4. Eye-movement record: keeps running while this method is called (it stops ~20 s after)
        if CAMERA_ALLOWED():
            GAZE.keep_alive(server_url, hostname, employee_id)

    def stop(self):
        """Stop the eye record now (for example when the proctor is switched off)."""
        GAZE.stop_and_wait()

    # ── internals ─────────────────────────────────────────────────────────────

    @staticmethod
    def _upload_snapshot(server_url: str, hostname: str, employee_id: str):
        """Capture one screen frame and upload it as proctor evidence."""
        frame = _capture_screen_bytes(quality=55)
        if frame:
            post_proctor_event(
                server_url, hostname, employee_id,
                "snapshot", "periodic_screen",
                screenshot_bytes=frame,
            )


# ─── Shared helpers ────────────────────────────────────────────────────────────

def _get_foreground_title() -> str:
    """
    Return the foreground window title on Windows, macOS, and Linux.
    Delegates to the watcher module which already has full cross-platform support.
    Falls back to the Windows ctypes path if the watcher is unavailable.
    """
    try:
        from anuvadini_detector.watcher import get_active_window
        win = get_active_window()
        return (win.get("title") or "").strip()
    except Exception:
        pass
    # Windows-only fallback (kept for environments where watcher can't load)
    try:
        import ctypes
        hwnd   = ctypes.windll.user32.GetForegroundWindow()
        length = ctypes.windll.user32.GetWindowTextLengthW(hwnd)
        buf    = ctypes.create_unicode_buffer(length + 1)
        ctypes.windll.user32.GetWindowTextW(hwnd, buf, length + 1)
        return buf.value.strip()
    except Exception:
        return ""
