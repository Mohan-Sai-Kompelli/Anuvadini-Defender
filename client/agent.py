"""
Anuvadini Detector Client Agent v2.0
Features:
  - 8-stage detection pipeline (Signatures, Window Title, Fullscreen+Gamepad, Alt+Tab Background Scan, Sockets, Cloaking)
  - Autonomous Shift Engine awareness (09:30 - 17:30)
  - Real hardware CPU & RAM telemetry
  - XInput Gamepad detection across 4 slots
  - Tamper-evident audit proof generation with red forensic watermark
  - Bidirectional remote command executor (Remote Process Kill & Warning Modal Popup)
  - Supports both cmd['action'] and cmd['type'] (Fixes known bug)
"""

import asyncio
import base64
import io
import json
import os
import platform
import socket
import sys
import time
from typing import Optional, Tuple
from PIL import Image
import websockets
import psutil

# Ensure root path is accessible
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from core.engine import DetectionEngine, ShiftScheduler
from core.evidence import capture_desktop_gdi, create_tamper_evident_proof
from core.controller import detect_gamepads
from core.afk import get_hardware_idle_seconds
from core.enforcer import kill_process_by_pid_or_name, show_system_warning_modal

# Load Configuration from app_config.json, AppData, or Environment Variables
def load_agent_config() -> dict:
    cfg = {
        "server_host": os.getenv("MONITOR_SERVER_HOST", "127.0.0.1"),
        "server_port": int(os.getenv("MONITOR_SERVER_PORT", "8000")),
        "department": os.getenv("MONITOR_DEPARTMENT", "Engineering"),
        "frame_interval": 2.5
    }

    candidates = [
        os.path.join(os.getcwd(), "app_config.json"),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "app_config.json"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app_config.json")
    ]
    if getattr(sys, "frozen", False):
        candidates.insert(0, os.path.join(os.path.dirname(sys.executable), "app_config.json"))

    appdata = os.getenv("APPDATA")
    if appdata:
        candidates.append(os.path.join(appdata, "ApexMonitor", "app_config.json"))
        candidates.append(os.path.join(appdata, "AnuvadiniDetector", "app_config.json"))

    for p in candidates:
        if os.path.isfile(p):
            try:
                with open(p, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    cfg.update(data)
                    print(f"[✓] Successfully loaded config from: {p}")
                    break
            except Exception as e:
                print(f"[!] Warning reading {p}: {e}")

    # Re-apply explicit environment overrides if present
    if os.getenv("MONITOR_SERVER_HOST"):
        cfg["server_host"] = os.getenv("MONITOR_SERVER_HOST").strip()
    if os.getenv("MONITOR_SERVER_PORT"):
        try:
            cfg["server_port"] = int(os.getenv("MONITOR_SERVER_PORT").strip())
        except ValueError:
            pass
    if os.getenv("MONITOR_DEPARTMENT"):
        cfg["department"] = os.getenv("MONITOR_DEPARTMENT").strip()

    return cfg

AGENT_CONFIG = load_agent_config()

DEFAULT_SERVER_HOST = AGENT_CONFIG.get("server_host", "innovation-tax-minute-category.trycloudflare.com")
DEFAULT_SERVER_PORT = int(AGENT_CONFIG.get("server_port", 80))
_proto = "wss" if (DEFAULT_SERVER_PORT in (80, 443) or "trycloudflare.com" in DEFAULT_SERVER_HOST) else "ws"
_host_clean = DEFAULT_SERVER_HOST.replace("https://", "").replace("http://", "").replace("wss://", "").replace("ws://", "").rstrip("/")
if DEFAULT_SERVER_PORT in (80, 443) or "trycloudflare.com" in _host_clean:
    _default_uri = f"{_proto}://{_host_clean}/ws/client/"
else:
    _default_uri = f"{_proto}://{_host_clean}:{DEFAULT_SERVER_PORT}/ws/client/"

SERVER_URI = os.getenv("MONITOR_SERVER_URI", _default_uri)

# Identity
HOSTNAME = socket.gethostname()
USERNAME = os.getenv("USERNAME", os.getenv("USER", "User"))
DEPARTMENT = AGENT_CONFIG.get("department", "Engineering")
CLIENT_ID = f"{HOSTNAME}_{USERNAME}"

FRAME_INTERVAL = float(AGENT_CONFIG.get("frame_interval", 2.5))

detection_engine = DetectionEngine(workstation_id=CLIENT_ID)

def handle_remote_command(cmd: dict):
    """
    Executes administrative instructions dispatched from server.
    Supports both cmd['action'] and cmd['type'] to fix remote command bug.
    """
    action = (cmd.get("action") or cmd.get("type") or "").upper()
    payload = cmd.get("payload", "")

    print(f"[*] Received Remote Action: '{action}' | Target: '{payload}'")

    if action in ("KILL_PROCESS", "REMOTE_KILL"):
        res = kill_process_by_pid_or_name(payload)
        print(f"[✓] Remote Process Kill Result: {res}")

    elif action in ("WARN_POPUP", "REMOTE_WARN"):
        msg = payload or "Official IT Compliance Notice: Non-work activities are prohibited during working hours."
        show_system_warning_modal(message=msg, title="ANUVADINI COMPLIANCE ALERT")
        print(f"[✓] Displayed compliance modal on employee screen.")

async def run_agent():
    global FRAME_INTERVAL

    uri = f"{SERVER_URI.rstrip('/')}/{CLIENT_ID}"
    print(f"=====================================================")
    print(f"[*] Anuvadini Detector Enterprise Agent v2.0")
    print(f"[*] Hostname: {HOSTNAME} | User: {USERNAME} | Dept: {DEPARTMENT}")
    print(f"[*] Connecting to Central Hub: {uri}")
    print(f"=====================================================")

    retry_delay = 2

    while True:
        try:
            print(f"[+] Establishing secure WebSocket connection to {uri}...")
            async with websockets.connect(
                uri,
                ping_interval=20,
                ping_timeout=10,
                max_size=10 * 1024 * 1024
            ) as websocket:
                print(f"[✓] Connected successfully to Anuvadini Central Server!")
                retry_delay = 2

                # Listen for handshake
                try:
                    handshake_raw = await asyncio.wait_for(websocket.recv(), timeout=3.0)
                    handshake = json.loads(handshake_raw)
                    if handshake.get("type") == "handshake":
                        FRAME_INTERVAL = handshake.get("recommended_interval", FRAME_INTERVAL)
                        print(f"[✓] Handshake verified. Frame interval set to {FRAME_INTERVAL}s")
                except Exception:
                    pass

                # Main pipeline transmission loop
                while True:
                    start_tick = time.time()

                    # 1. Run 8-Stage Detection Pipeline
                    pipeline_result = detection_engine.run_8stage_pipeline()
                    state = pipeline_result.get("state", "WORK")
                    reason = pipeline_result.get("reason", "Productive Work")
                    active_win = pipeline_result.get("active_window", {})
                    window_title = active_win.get("title", "Desktop")
                    process_name = active_win.get("process_name", "")
                    shift_info = pipeline_result.get("shift", {})

                    # Standby behavior if outside shift hours
                    if state == "OFF_DUTY":
                        # Sleep longer to save client CPU & bandwidth
                        await asyncio.sleep(5.0)

                    # 2. Real Hardware CPU & RAM
                    cpu_percent = psutil.cpu_percent(interval=None)
                    ram_percent = psutil.virtual_memory().percent

                    # 3. Gamepad check
                    gamepad_data = detect_gamepads()

                    # 4. Idle time
                    idle_secs = int(get_hardware_idle_seconds())

                    # 5. Capture Screen (Normal thumbnail or Red Tamper-Evident Proof on violation)
                    screenshot_b64 = ""
                    try:
                        raw_screen = capture_desktop_gdi()
                        if raw_screen:
                            if state in ("GAMING", "BACKGROUND_GAMING"):
                                # Watermarked Forensic Audit Proof
                                screenshot_b64, _ = create_tamper_evident_proof(
                                    workstation_id=CLIENT_ID,
                                    user_id=USERNAME,
                                    violation_title=reason,
                                    raw_img=raw_screen
                                )
                            else:
                                # Lightweight compressed thumbnail
                                thumb = raw_screen.resize((400, 225), Image.Resampling.BILINEAR)
                                buf = io.BytesIO()
                                thumb.save(buf, format="JPEG", quality=38)
                                screenshot_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                    except Exception as e:
                        print(f"[Screen Capture Warning] {e}")

                    # 6. Map status
                    status_text = "Normal"
                    if state in ("GAMING", "BACKGROUND_GAMING"):
                        status_text = "Alert/Game"
                    elif state == "IDLE":
                        status_text = "Idle"
                    elif state == "LUNCH_BREAK":
                        status_text = "Lunch"

                    # 7. Telemetry Payload
                    payload = {
                        "client_id": CLIENT_ID,
                        "hostname": HOSTNAME,
                        "username": USERNAME,
                        "department": DEPARTMENT,
                        "window": window_title,
                        "process_name": process_name,
                        "status": status_text,
                        "state": state,
                        "reason": reason,
                        "matched_keyword": reason if "Detected" in reason else "",
                        "idle_seconds": idle_secs,
                        "cpu_percent": cpu_percent,
                        "ram_percent": ram_percent,
                        "gamepad_connected": gamepad_data["connected"],
                        "screenshot": screenshot_b64,
                        "timestamp": time.time()
                    }

                    # Transmit to hub
                    await websocket.send(json.dumps(payload))

                    # 8. Check for incoming remote commands (non-blocking)
                    try:
                        cmd_raw = await asyncio.wait_for(websocket.recv(), timeout=0.1)
                        cmd = json.loads(cmd_raw)
                        handle_remote_command(cmd)
                    except asyncio.TimeoutError:
                        pass
                    except Exception as e:
                        pass

                    # Pace transmission
                    elapsed = time.time() - start_tick
                    sleep_time = max(0.5, FRAME_INTERVAL - elapsed)
                    await asyncio.sleep(sleep_time)

        except (websockets.exceptions.ConnectionClosedError,
                websockets.exceptions.ConnectionClosedOK,
                ConnectionRefusedError,
                OSError) as e:
            print(f"[-] Connection dropped: {e}. Reconnecting in {retry_delay}s...")
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 1.5, 30.0)
        except Exception as e:
            print(f"[!] Unexpected error in agent: {e}")
            await asyncio.sleep(3)

if __name__ == "__main__":
    try:
        asyncio.run(run_agent())
    except KeyboardInterrupt:
        print("\n[*] Anuvadini Agent terminated by user.")
        sys.exit(0)
