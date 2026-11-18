"""Regression tests for the 17:30 stop and early check-in wake rules."""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from anuvadini_detector import duty, pairing_status


def _off_duty(resume_at: str = "2026-10-29T09:30:00") -> dict:
    return {
        "created_at": "2026-10-28T17:30:00",
        "resume_at": datetime.fromisoformat(resume_at),
        "reason": "Shift ended at 17:30",
    }


def _server_time(local_naive: datetime) -> str:
    """Serialize a local wall-clock time the way the Node API does."""
    return local_naive.astimezone().isoformat()


def test_same_evening_checkin_does_not_wake():
    state = _off_duty()
    assert not duty.early_wake_allowed(datetime(2026, 10, 28, 18, 0), state, "17:30")


def test_early_morning_checkin_wakes():
    state = _off_duty()
    assert duty.early_wake_allowed(datetime(2026, 10, 29, 9, 20), state, "17:30")


def test_after_shift_end_does_not_wake():
    state = _off_duty()
    assert not duty.early_wake_allowed(datetime(2026, 10, 29, 18, 0), state, "17:30")


def test_fresh_checkin_is_detected():
    snapshot = {"paused": False, "resumed_at": _server_time(datetime(2026, 10, 29, 9, 20))}
    assert pairing_status.checked_in_after_off_duty(snapshot, _off_duty())


def test_stale_checkin_is_ignored():
    snapshot = {"paused": False, "resumed_at": _server_time(datetime(2026, 10, 28, 9, 14))}
    assert not pairing_status.checked_in_after_off_duty(snapshot, _off_duty())


def test_checked_out_is_never_a_checkin():
    snapshot = {"paused": True, "resumed_at": _server_time(datetime(2026, 10, 29, 9, 20))}
    assert not pairing_status.checked_in_after_off_duty(snapshot, _off_duty())


def test_stop_only_when_crossing_shift_end():
    assert duty.should_stop_at_shift_end(
        datetime(2026, 10, 28, 17, 30),
        datetime(2026, 10, 28, 9, 0),
        "17:30",
    )
    assert not duty.should_stop_at_shift_end(
        datetime(2026, 10, 28, 18, 0),
        datetime(2026, 10, 28, 18, 0),
        "17:30",
    )


if __name__ == "__main__":
    for _name, _fn in sorted(globals().items()):
        if _name.startswith("test_"):
            _fn()
    print("duty schedule tests passed")
