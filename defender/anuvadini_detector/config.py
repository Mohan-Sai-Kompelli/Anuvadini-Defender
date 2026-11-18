"""
Anuvadini Detector - Configuration Module
Workplace Productivity & Gaming Detection Shield
"""
import os
from pathlib import Path

# Base Paths
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
EVIDENCE_DIR = DATA_DIR / "evidence"

# MongoDB Database Settings
MONGO_URI = os.environ.get("MONGO_URI", "")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "anuvadini_detector")

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# Detection Engine Defaults
POLL_INTERVAL_SECONDS = 8.0       # Frequency of active window & process check
IDLE_THRESHOLD_SECONDS = 60.0      # Idle / AFK threshold (seconds)
SCREENSHOT_ON_VIOLATION = True    # Capture screenshot proof when game is detected
SCREENSHOT_COOLDOWN_SECONDS = 60  # Don't spam screenshots for same game within X seconds
AUTO_KILL_GAMES_DEFAULT = False   # Automatic process termination toggle
SHOW_POPUP_ALERT = False          # No popup alerts — passive monitoring only
PLAY_ALERT_SOUND = False          # No sound chimes — silent background monitoring

# Server Settings
# Bind address / port. Keep 127.0.0.1 when the Anuvadini Attendance server is the only admin entry point;
# set DEFENDER_HOST=0.0.0.0 so employee-PC agents on the LAN can reach the agent endpoints.
SERVER_HOST = os.environ.get("DEFENDER_HOST", "127.0.0.1")
SERVER_PORT = int(os.environ.get("DEFENDER_PORT", "8055"))

# Office Shift Autonomous Schedule Settings
SCHEDULE_ENABLED = True           # Auto-activate only during office hours
SHIFT_START_TIME = os.environ.get("ANUVADINI_SHIFT_START", "09:30")  # 09:30 AM default start
SHIFT_END_TIME = os.environ.get("ANUVADINI_SHIFT_END", "17:30")      # 05:30 PM (17:30) default end
WORKING_DAYS = [0, 1, 2, 3, 4, 5]  # Monday (0) to Saturday (5)
OVERRIDE_SCHEDULE = False         # Respect shift hours — no 24/7 override
AUTO_STOP_AT_SHIFT_END = os.environ.get("ANUVADINI_AUTO_STOP", "1") == "1"
AUTO_START_NAME = "AnuvadiniDetector"

# Lunch & Wellness Break Window (Grace Period - No Enforcement)
LUNCH_BREAK_ENABLED = True
LUNCH_START_TIME = "13:00"         # 01:00 PM
LUNCH_END_TIME = "14:00"           # 02:00 PM

# NVIDIA NIM AI Vision & Multimodal Model Integration
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY", "")
NVIDIA_NIM_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_NIM_MODEL = "meta/llama-3.2-11b-vision-instruct"
NVIDIA_VISION_ENABLED = True
