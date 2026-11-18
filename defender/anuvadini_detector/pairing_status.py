"""Read the employee's Defender pairing/duty state from the Node backend.

The agent and the watchdog both need the same answer while the agent is off
duty: is the employee currently checked in or checked out?  Keeping this in one
small module avoids the agent and watchdog disagreeing about whether it is safe
to start monitoring.
"""

from __future__ import annotations

import json
import os
import urllib.request
from datetime import datetime, timezone

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATHS = (
    r"C:\ProgramData\AnuvadiniDetector\agent_config.json",
    os.path.join(BASE_DIR, "agent_config.json"),
)


def load_config() -> dict:
    """Read the installed agent config without importing the desktop package."""
    for path in CONFIG_PATHS:
        try:
            with open(path, "r", encoding="utf-8") as handle:
                return json.load(handle)
        except Exception:
            continue
    return {}


def fetch_agent_status(timeout: float = 5.0) -> dict | None:
    """Return the server's pairing snapshot, or None when it is unreachable.

    ``None`` means "unknown", not "checked in".  Callers use it as a fallback
    and keep the normal 09:30 shift-start behaviour when the backend is down.
    """
    cfg = load_config()
    node_url = str(cfg.get("node_url") or "").rstrip("/")
    token = str(cfg.get("agent_token") or "")
    if not node_url or not token:
        return None
    try:
        req = urllib.request.Request(
            f"{node_url}/defender-pair/agent-status",
            headers={"Authorization": f"Bearer {token}"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
        return {
            "paused": bool(data.get("monitoring_paused")),
            "status": str(data.get("status") or ""),
            "resumed_at": data.get("resumed_at"),
            "paused_at": data.get("paused_at"),
            "updated_at": data.get("updated_at"),
        }
    except Exception:
        return None


def _parse_local_time(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except Exception:
        return None


def _parse_server_time_as_local(value) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value).replace("Z", "+00:00")
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone().replace(tzinfo=None)
    except Exception:
        return None


def checked_in_after_off_duty(snapshot: dict | None, off_duty: dict) -> bool:
    """True only when a fresh check-in happened after the agent went off duty.

    A forgotten checkout keeps yesterday's ``resumed_at``, which is older than
    the off-duty ``created_at``, so this stays False and the agent waits for the
    normal shift start.  A checkout followed by a check-in writes a newer
    ``resumed_at`` and returns True.
    """
    if not snapshot or snapshot.get("paused"):
        return False
    resumed_at = _parse_server_time_as_local(snapshot.get("resumed_at"))
    created_at = _parse_local_time(off_duty.get("created_at"))
    return bool(resumed_at and created_at and resumed_at > created_at)
