"""
Anuvadini Detector Core Package
Exports detection engine, signatures, database, probes, and enforcement modules.
"""

from .signatures import (
    GAME_PROCESSES, GAME_LAUNCHERS, EMULATORS, ANTI_AFK_JIGGLERS,
    BROWSER_PATTERNS, PRODUCTIVITY_WHITELIST, GAMING_PORT_RANGES, EVASION_PROCESSES
)
from .evidence import capture_desktop_gdi, create_tamper_evident_proof
from .afk import get_hardware_idle_seconds, is_afk
from .controller import detect_gamepads
from .watcher import get_active_window, enumerate_all_visible_windows
from .enforcer import kill_process_by_pid_or_name, show_system_warning_modal
from .database import (
    init_db, seed_demo_fleet_if_empty, record_activity_and_violation,
    get_hourly_analytics, get_fleet_health_score, get_top_games,
    queue_remote_command, fetch_pending_commands, get_connection
)
from .engine import DetectionEngine, ShiftScheduler
from .nvidia_nim import NvidiaNimVisionAuditor, NIM_MODELS
from .anti_tamper import AntiTamperEngine
from .watchdog import WatchdogSupervisor

__all__ = [
    "DetectionEngine",
    "ShiftScheduler",
    "AntiTamperEngine",
    "WatchdogSupervisor",
    "NvidiaNimVisionAuditor",
    "NIM_MODELS",
    "capture_desktop_gdi",
    "create_tamper_evident_proof",
    "get_hardware_idle_seconds",
    "is_afk",
    "detect_gamepads",
    "get_active_window",
    "enumerate_all_visible_windows",
    "kill_process_by_pid_or_name",
    "show_system_warning_modal",
    "init_db",
    "seed_demo_fleet_if_empty",
    "record_activity_and_violation",
    "get_hourly_analytics",
    "get_fleet_health_score",
    "get_top_games",
    "queue_remote_command",
    "fetch_pending_commands",
    "get_connection",
    "GAME_PROCESSES",
    "GAME_LAUNCHERS",
    "EMULATORS",
    "ANTI_AFK_JIGGLERS",
    "BROWSER_PATTERNS",
    "PRODUCTIVITY_WHITELIST",
    "GAMING_PORT_RANGES",
    "EVASION_PROCESSES"
]
