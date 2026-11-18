"""Office-shift end-of-day state shared by the agent and its watchdog.

The agent stops itself at the configured shift end (17:30 by default).  It
writes a small state file first so the watchdog knows the exit was intentional
and does not resurrect it as a tamper event.  The watchdog keeps the file and
starts the agent again at the next shift start (09:30 by default), even when the
employee never logged out of Windows.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, time, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
STATE_FILE = DATA_DIR / "agent_off_duty.json"
LOG_FILE = DATA_DIR / "agent_duty.log"

DEFAULT_SHIFT_START = "09:30"
DEFAULT_SHIFT_END = "17:30"
DEFAULT_WORKING_DAYS = (0, 1, 2, 3, 4, 5)  # Monday - Saturday


def _parse_hm(value: str) -> time:
    """Parse ``HH:MM`` into a time; fall back to 09:30 on bad input."""
    try:
        hour, minute = str(value).strip().split(":")[:2]
        return time(int(hour), int(minute))
    except Exception:
        return time(9, 30)


def _working_days(working_days) -> tuple[int, ...]:
    if working_days is None:
        return DEFAULT_WORKING_DAYS
    try:
        return tuple(int(day) for day in working_days)
    except Exception:
        return DEFAULT_WORKING_DAYS


def is_working_day(day, working_days=None) -> bool:
    return day.weekday() in _working_days(working_days)


def next_shift_start(now: datetime, shift_start: str = DEFAULT_SHIFT_START,
                     working_days=None) -> datetime:
    """Return the next configured shift-start datetime after ``now``."""
    start_time = _parse_hm(shift_start)
    days = _working_days(working_days)
    for offset in range(0, 8):
        day = now.date() + timedelta(days=offset)
        if day.weekday() not in days:
            continue
        candidate = datetime.combine(day, start_time)
        if candidate > now:
            return candidate
    # Defensive fallback; the loop above always finds a day for normal setups.
    return datetime.combine(now.date() + timedelta(days=1), start_time)


def should_stop_at_shift_end(now: datetime, started_at: datetime,
                             shift_end: str = DEFAULT_SHIFT_END,
                             working_days=None) -> bool:
    """True only when a running agent crosses today's shift-end boundary.

    An agent started after the shift end is deliberately not stopped on that
    same start (the rule is an end-of-day rule, not a login rule).  It will stop
    at the next day's shift end instead.
    """
    if not is_working_day(now, working_days):
        return False
    end_at = datetime.combine(now.date(), _parse_hm(shift_end))
    return started_at < end_at <= now


def state_path() -> Path:
    return STATE_FILE


def log_event(message: str) -> None:
    """Append a small local audit line; safe to call from either process."""
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(LOG_FILE, "a", encoding="utf-8") as handle:
            handle.write(f"[{stamp}] [DUTY] {message}\n")
    except Exception:
        pass


def write_off_duty(resume_at: datetime, reason: str = "Shift ended") -> dict:
    """Persist the intentional stop so the watchdog does not restart us."""
    state = {
        "resume_at": resume_at.isoformat(timespec="seconds"),
        "reason": reason,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2), encoding="utf-8")
    os.replace(tmp, STATE_FILE)
    log_event(f"Off-duty written: {reason}; resume at {state['resume_at']}")
    return state


def read_off_duty() -> dict | None:
    """Return the current off-duty state, or None when there is none."""
    try:
        data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
        resume_at = datetime.fromisoformat(str(data["resume_at"]))
        return {
            "resume_at": resume_at,
            "reason": str(data.get("reason") or "Shift ended"),
            "created_at": data.get("created_at"),
        }
    except Exception:
        return None


def clear_off_duty() -> None:
    try:
        STATE_FILE.unlink()
        log_event("Off-duty state cleared; agent may start.")
    except FileNotFoundError:
        pass
    except Exception:
        log_event("Could not clear off-duty state.")


def resume_due(state: dict | None, now: datetime | None = None,
               grace_seconds: int = 60) -> bool:
    """True when the stored resume time has arrived (with a small tolerance)."""
    if not state:
        return False
    now = now or datetime.now()
    try:
        return now >= state["resume_at"] - timedelta(seconds=grace_seconds)
    except Exception:
        return True


def early_wake_allowed(now: datetime, state: dict | None,
                       shift_end: str = DEFAULT_SHIFT_END) -> bool:
    """True when an early check-in may wake an off-duty agent.

    Two guards keep a late-evening check-in from starting an agent that would
    then run all night:

    * the next shift's start date must have arrived (a check-in at 18:00 the
      same evening is still before tomorrow's resume date), and
    * it must be before today's shift end (a check-in at 18:00 on the resume
      day is already after hours).
    """
    if not state:
        return False
    resume_at = state.get("resume_at")
    if not isinstance(resume_at, datetime):
        return False
    if now.date() < resume_at.date():
        return False
    if now.time() >= _parse_hm(shift_end):
        return False
    return True


def off_duty_message(state: dict | None) -> str:
    if not state:
        return "Off duty"
    return f"{state.get('reason', 'Shift ended')} (resume at {state['resume_at']:%Y-%m-%d %H:%M})"
