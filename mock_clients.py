"""
Anuvadini Detector - Synthetic Fleet Concurrency Simulator
Simulates 50-200 concurrent workstations across departments with realistic activity,
gamepad connections, hardware stats, and responsive remote action listeners.
"""

import asyncio
import base64
import io
import json
import random
import sys
import time
from PIL import Image, ImageDraw
import websockets

SERVER_URI = "ws://127.0.0.1:8000/ws/client/"
NUM_CLIENTS = 50

DEPARTMENTS = ["Engineering", "Design", "Sales", "Marketing", "HR", "Finance", "DevOps", "QA", "Support"]

WORK_WINDOWS = [
    ("Visual Studio Code - server/main.py", "Engineering", "code.exe"),
    ("Figma - Enterprise Dashboard System", "Design", "figma.exe"),
    ("Salesforce CRM - Active Pipeline", "Sales", "chrome.exe"),
    ("Google Analytics 4 - Conversion Tracking", "Marketing", "chrome.exe"),
    ("Excel - Q3 Financial Audit 2026.xlsx", "Finance", "excel.exe"),
    ("Slack - #general-announcements", "HR", "slack.exe"),
    ("Terminal - bash (kubectl get pods)", "DevOps", "cmd.exe"),
    ("Postman - Automated API Regression Suite", "QA", "postman.exe"),
    ("Zendesk Support Desk #9102", "Support", "chrome.exe"),
    ("Notion - Sprint Planning Docs", "Engineering", "notion.exe"),
]

GAME_WINDOWS = [
    ("Counter-Strike 2 - Competitive Mirage", "cs2.exe", True),
    ("Roblox Player - Adopt Me!", "robloxplayerbeta.exe", True),
    ("Poki Games - Subway Surfers", "chrome.exe", False),
    ("CrazyGames - Krunker.io", "chrome.exe", False),
    ("Stake.com - Crash & Live Casino", "msedge.exe", False),
    ("YouTube - Top 10 Best Gaming Plays", "chrome.exe", False),
    ("Twitch - Live Stream League of Legends", "chrome.exe", False),
    ("Minecraft 1.21 - Singleplayer World", "javaw.exe", True),
]

COLORS = [
    (15, 23, 42), (30, 41, 59), (17, 24, 39), (24, 24, 27),
    (19, 78, 74), (20, 83, 45), (120, 53, 15), (136, 19, 55)
]

def generate_synthetic_thumbnail(client_id: str, title: str, is_gaming: bool, department: str) -> str:
    """Generates an in-memory 400x225 synthetic thumbnail with status banner."""
    bg_color = (127, 29, 29) if is_gaming else random.choice(COLORS)
    img = Image.new("RGB", (400, 225), color=bg_color)
    draw = ImageDraw.Draw(img)

    # Window title bar
    bar_color = (185, 28, 28) if is_gaming else (30, 41, 59)
    draw.rectangle([0, 0, 400, 28], fill=bar_color)
    draw.ellipse([8, 8, 16, 16], fill=(239, 68, 68))
    draw.ellipse([22, 8, 30, 16], fill=(245, 158, 11))
    draw.ellipse([36, 8, 44, 16], fill=(16, 185, 129))

    # Details
    draw.text((15, 40), f"HOST: {client_id} [{department.upper()}]", fill=(241, 245, 249))
    draw.text((15, 70), f"APP: {title[:36]}", fill=(203, 213, 225))
    draw.text((15, 100), f"STATUS: {'🚨 VIOLATION (GAMING)' if is_gaming else '✓ PRODUCTIVE WORK'}",
              fill=(254, 202, 202) if is_gaming else (167, 243, 208))
    draw.text((15, 185), f"TICK: {time.strftime('%H:%M:%S UTC')}", fill=(148, 163, 184))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=35)
    return base64.b64encode(buf.getvalue()).decode("utf-8")

async def simulate_client(index: int):
    client_id = f"WS-SIM-{index:03d}"
    department = DEPARTMENTS[index % len(DEPARTMENTS)]
    uri = SERVER_URI + client_id

    await asyncio.sleep(random.uniform(0.1, 3.5))

    while True:
        try:
            async with websockets.connect(uri) as ws:
                print(f"[+] Simulated Node {client_id} ({department}) connected.")

                is_gaming_now = (random.random() < 0.15)
                active_game = random.choice(GAME_WINDOWS)

                while True:
                    # 10% chance of status transition
                    if random.random() < 0.08:
                        is_gaming_now = not is_gaming_now
                        if is_gaming_now:
                            active_game = random.choice(GAME_WINDOWS)

                    if is_gaming_now:
                        title, proc, gamepad = active_game
                        state = "GAMING"
                        status = "Alert/Game"
                    else:
                        title, _, proc = random.choice(WORK_WINDOWS)
                        state = "WORK"
                        status = "Normal"
                        gamepad = False

                    thumb = generate_synthetic_thumbnail(client_id, title, is_gaming_now, department)

                    payload = {
                        "client_id": client_id,
                        "hostname": client_id,
                        "username": f"Worker_{index:03d}",
                        "department": department,
                        "window": title,
                        "process_name": proc,
                        "status": status,
                        "state": state,
                        "idle_seconds": random.randint(0, 25),
                        "cpu_percent": round(random.uniform(8.0, 45.0), 1),
                        "ram_percent": round(random.uniform(30.0, 70.0), 1),
                        "gamepad_connected": gamepad,
                        "screenshot": thumb,
                        "timestamp": time.time()
                    }

                    await ws.send(json.dumps(payload))

                    # Check for incoming commands
                    try:
                        cmd_raw = await asyncio.wait_for(ws.recv(), timeout=0.1)
                        cmd = json.loads(cmd_raw)
                        action = (cmd.get("action") or cmd.get("type") or "").upper()
                        print(f"[Simulated {client_id}] Received Server Instruction: {action}")
                        if "KILL" in action:
                            # Revert immediately to work
                            is_gaming_now = False
                    except asyncio.TimeoutError:
                        pass
                    except Exception:
                        pass

                    await asyncio.sleep(random.uniform(2.5, 4.0))

        except Exception as e:
            await asyncio.sleep(3.0)

async def main():
    print(f"[*] Launching {NUM_CLIENTS} synthetic fleet nodes targeted at {SERVER_URI}...")
    tasks = [simulate_client(i + 1) for i in range(NUM_CLIENTS)]
    await asyncio.gather(*tasks)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[*] Simulator halted.")
