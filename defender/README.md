# 🛡️ Anuvadini Detector — Enterprise Workplace Gaming & Productivity Shield (v2.0)

> **Anuvadini Detector** is an enterprise-grade automated monitoring and anti-slacking defense platform built to detect non-work activities, PC gaming, browser-based games, gambling portals, connected game controllers, and idle slacking across 50 to 500+ office workstations simultaneously.

---

## 🌟 The Problem Solved
In corporate offices, employees often spend company hours playing desktop games (Steam, CS2, Valorant, GTA, Roblox), browser games (Poki, CrazyGames, Chess.com), or slacking off. When managers walk by, employees quickly switch tabs (`Alt + Tab`).

**Anuvadini Detector** resolves this with deep system-level protection:
1. **Autonomous 09:30 AM – 05:30 PM Shift Automation:** Automatically starts deep active monitoring and enforcement at **09:30 AM** every morning and gracefully goes to Standby at **05:30 PM** when the office closes, requiring zero manual clicks.
2. **Enterprise Multi-PC Fleet Grid:** Centralized monitoring for entire company departments (Engineering, Design, Sales, Marketing, HR, Finance, DevOps, QA, Support).
3. **Background Process Scanning:** Detects games running in background or minimized windows even if the employee switches tabs.
4. **Web Game & Betting Title Analysis:** Real-time keyword scanning of browser tabs for web gaming portals (Poki, CrazyGames, Krunker) and betting sites (Stake, Bet365, 1xBet).
5. **Hardware Gamepad Detection:** Uses Windows **XInput** to detect if an Xbox, PlayStation, or USB joystick is connected to the PC.
6. **Microsecond Idle & AFK Tracker:** Accurately computes employee away/idle time using Windows native hardware input counters (`GetLastInputInfo`).
7. **Tamper-Evident Screenshot Proof:** Automatically captures an audit snapshot with timestamp, workstation name, user ID, and game name.
8. **Remote IT Administrative Actions:** Central dashboard allows one-click **Remote Kill Process** and **Remote Warning Popup** directly on offending employee screens.

---

## 🚀 Key Features

| Feature | Description |
| :--- | :--- |
| **🏢 Company Fleet Grid** | Centralized dashboard monitoring 50 to 500+ employee PCs with live status, CPU/RAM, active app, and risk triage. |
| **🕒 09:30-17:30 Shift Engine** | Fully autonomous office shift scheduler that activates at 09:30 AM and stands down at 05:30 PM automatically. |
| **🎯 Department Filters** | Instant one-click filtering by Engineering, Design, Sales, Marketing, HR, Finance, DevOps, Support, and QA. |
| **🛑 Remote Process Kill** | Dispatches instant command to terminate unauthorized game processes remotely on employee workstations. |
| **⚠️ Remote Screen Alert** | Triggers an official system modal notification directly onto the offending employee's monitor. |
| **300+ Game Signatures** | Pre-loaded database of Steam, Epic, Riot, Blizzard, GTA, CS2, Valorant, Roblox, Minecraft, Emulators, Web Games, etc. |
| **Browser Gaming Detection** | Scans tab titles for Poki, CrazyGames, Agar.io, Chess.com, Twitch streams, and gambling portals. |
| **Gamepad Detection** | Native XInput hook detecting USB/Bluetooth game controllers. |
| **Tamper-Proof Audit Proof** | Captures high-res desktop screenshots with red watermark stamp upon violation. |
| **Real-Time Glassmorphism UI** | WebSocket-powered live UI with zero latency, live charts (Work % vs Gaming % vs AFK %), and instant incident feed. |
| **1-Click Test Simulator** | Built-in test buttons (Solitaire, Poki, CS2, Stake) to demonstrate full system capabilities instantly. |

---

## 🏗️ Project Architecture

```
detector/
├── anuvadini_detector/
│   ├── __init__.py           # Package initialization
│   ├── config.py             # System thresholds, port 8055 & shift timings
│   ├── database.py           # MongoDB persistence for workstations, violations & commands
│   ├── signatures.py         # 300+ Game, launcher, web portal & betting signatures
│   ├── watcher.py            # Windows active & background window watcher (Win32)
│   ├── afk.py                # Hardware idle & AFK tracker (GetLastInputInfo)
│   ├── controller.py         # XInput Xbox / PS controller detector
│   ├── evidence.py           # Win32 GDI audit screenshot capture & watermarking
│   ├── enforcer.py           # Pop-up warning modal & process kill engine
│   ├── autostart.py          # Windows boot registry auto-start configuration
│   ├── engine.py             # Main background orchestrator & shift event pipeline
│   ├── server.py             # FastAPI REST & WebSocket streaming server
│   └── agent.py              # Lightweight client agent for employee workstations
├── static/
│   ├── css/style.css         # Modern Day theme dashboard design system
│   ├── js/app.js             # Real-time WebSocket, fleet grid & Chart.js engine
│   └── img/logo.svg          # Official Anuvadini Detector SVG emblem
├── templates/
│   └── index.html            # Ultra-premium responsive Web Dashboard (6 tabs)
├── data/
│   └── evidence/             # Audit proof screenshots saved here (.gitkeep)
├── main.py                   # Master Hub launcher (Engine + Dashboard server)
├── run_agent.py              # Silent headless client agent runner
├── deploy_agent.bat          # 1-Click IT mass-deployment script for employee PCs
├── start.bat                 # 1-Click Windows launch script
├── requirements.txt          # Python dependencies
└── .gitignore                # Production git exclusion rules
```

---

## ⚡ Quick Start

### 1. Launch Central Master Server & Dashboard
Double click `start.bat` or run in terminal:
```bash
python main.py
```
This starts the central hub on port 8055 and opens your browser at:
👉 **`http://127.0.0.1:8055`**

### 2. Deploy Client Agent on Employee Workstations
On any employee machine, double click `deploy_agent.bat` or run:
```bash
python -m anuvadini_detector.agent --server http://CENTRAL_SERVER_IP:8055 --dept Engineering
```
The agent starts silently in the background, registers with the central hub, and begins autonomous monitoring.

---

## 👥 How to Grant Team Access on GitHub
Once pushed to your private GitHub repository:
1. Go to your repository on GitHub: `https://github.com/PrathamSharmaaji/anuvadini-detector`
2. Click **Settings** (gear icon) > **Collaborators** (under Access).
3. Click **"Add people"**.
4. Enter your team member's GitHub username or email address.
5. Select their role (e.g., `Write` or `Admin`) and click **"Add to this repository"**.
6. They will receive an invitation email to collaborate!

---

## 🔒 Privacy & Compliance
- **Shift Privacy:** Monitoring automatically switches to Standby at 05:30 PM.
- **Audit Specificity:** Only logs unauthorized gaming, gambling, and recreational leisure activities based on defined policies. Normal work applications (VS Code, Figma, Slack, Jira, SAP, Excel) are strictly whitelisted.
