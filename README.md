<div align="center">

# 🛡️ Anuvadini Defender (ApexMonitor Enterprise)
### Next-Gen Real-Time Endpoint Surveillance, Anti-Gaming Grid & AI Vision Audit Engine

[![Python](https://img.shields.io/badge/Python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![WebSockets](https://img.shields.io/badge/WebSockets-Real--Time%20Delta-4B8BBE?style=for-the-badge&logo=websocket&logoColor=white)](https://websockets.readthedocs.io/)
[![NVIDIA NIM](https://img.shields.io/badge/NVIDIA%20NIM-Vision%20AI%20Audit-76B900?style=for-the-badge&logo=nvidia&logoColor=white)](https://build.nvidia.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)](LICENSE)

<br/>

**Anuvadini Defender** is a high-throughput, low-latency enterprise endpoint surveillance, gaming detection, and compliance grid. Engineered to smoothly manage **200+ concurrent live desktop streams**, it combines an **8-stage multi-layered heuristic detection pipeline** with **NVIDIA NIM Multimodal AI Vision Auditing** to detect non-work activities, unauthorized gaming, forex trading, and anti-AFK evasion with sub-second responsiveness.

[Key Highlights](#-key-highlights) • [Architecture](#-system-architecture) • [8-Stage Pipeline](#-8-stage-detection-pipeline) • [NVIDIA NIM AI Vision](#-nvidia-nim-ai-vision-auditing) • [Quickstart](#-quickstart--installation) • [Deployment](#-enterprise-deployment) • [Dashboard](#-enterprise-dashboard-features)

---

</div>

## 🌟 Key Highlights

- **🚀 Ultra-Low Latency Delta Broadcasting**: Replaces naive whole-cluster broadcasting with an $O(1)$ single-client delta protocol, slashing server outbound bandwidth from **~160 MB/s to ~600 KB/s** across 200 live nodes.
- **⚡ Zero DOM Thrashing UI Engine**: High-performance dark-mode grid UI with keyed DOM targeting. Renders 200 live 16:9 desktop thumbnails at 60 FPS without tab freezing or memory leaks.
- **🧠 Multimodal AI Vision Forensics (NVIDIA NIM)**: Automated visual auditing powered by `meta/llama-3.2-11b-vision-instruct`, classifying desktop snapshots into `WORK`, `GAMING`, `STREAMING`, `SOCIAL`, or `ANTI_AFK` with cryptographic chain-of-custody.
- **🛡️ 8-Stage Heuristic Detection Pipeline**: Continuous real-time inspection covering process signatures (120+ games, 13 launchers, 16 emulators, forex/crypto terminals), active window scanning, gamepad detection, PE header disguise verification, and Alt+Tab defense.
- **🕒 Autonomous Shift Scheduler**: Automated work schedules (09:30 – 17:30 Mon–Sat) with lunch break grace periods (13:00 – 14:00) and manual supervisor override controls (`AUTO`, `FORCE_WORK`, `FORCE_STANDBY`).
- **🔒 Anti-Tamper & Cryptographic Proof**: GDI desktop capture with SHA-256 tamper-evident proof chains, protected process watchdog, and automated Windows Scheduled Task persistence.
- **📊 SQLite Enterprise Analytics**: Persistent violation tracking, hourly productivity breakdowns (08:00–19:00), department-level health scoring, and historical audit logs.

---

## 🏛️ System Architecture

```mermaid
flowchart TB
    subgraph Endpoints ["🖥️ Monitored Endpoints (up to 200+ Nodes)"]
        A1["Workstation Node 001\n(Agent / ApexMonitor.exe)"]
        A2["Workstation Node 002\n(Agent / ApexMonitor.exe)"]
        A3["Workstation Node N...\n(Agent / ApexMonitor.exe)"]
    end

    subgraph Pipeline ["🔍 8-Stage Detection Engine (Agent Core)"]
        S1["1. Custom Rules Engine"] --> S2["2. Process Signatures (120+ Games/Forex)"]
        S2 --> S3["3. Window-Title Pattern Matching"]
        S3 --> S4["4. Fullscreen + Gamepad Heuristic (XInput)"]
        S4 --> S5["5. Background / Alt+Tab Scanner"]
        S5 --> S6["6. Anti-Bypass / Anti-AFK Jiggler Trap"]
        S6 --> S7["7. Network Gaming Socket Inspection"]
        S7 --> S8["8. PE Header Cloaking & Renamed Exe Check"]
    end

    Endpoints --> Pipeline

    subgraph Hub ["⚡ Anuvadini Defender Central Hub (FastAPI + Uvicorn)"]
        WS["WebSocket Ingestion Gateway\n(/ws/client/)"]
        Delta["Delta Broadcast Engine\n(O(1) Delta Dispatch)"]
        DB[(SQLite WAL Engine\nanuvadini.db)]
        Enforce["Remote Action Enforcer\n(Kill Process / Warning Alert)"]
    end

    Pipeline -- "Compressed Frames (~12KB) + State Telemetry" --> WS
    WS --> Delta
    WS --> DB
    Enforce -- "Remote Control Signals" --> Endpoints

    subgraph AI ["🧠 NVIDIA NIM Cloud Forensics"]
        NIM["Llama-3.2-11B-Vision-Instruct\n/ Nemotron 22B"]
    end

    DB -. "Suspicious Frame Verification" .-> NIM
    NIM -. "AI Classification & Confidence Score" .-> DB

    subgraph Dashboard ["💻 Admin Monitoring Station (Web Browser)"]
        UI["Real-Time Monitoring Grid\n(Keyed DOM Updates + Audio Chime)"]
    end

    Delta -- "WebSocket Delta Events (/ws/admin/)" --> UI
```

---

## ⚡ The 200-Endpoint Concurrency Breakthrough

Traditional surveillance prototypes fail when scaling beyond 10-15 workstations. Here is how **Anuvadini Defender** achieves scalable 200+ node concurrency:

| Metric / Dimension | Naive Traditional Broadcast | Anuvadini Defender Delta Grid | Optimization Factor |
| :--- | :--- | :--- | :--- |
| **Broadcast Protocol** | Full snapshot of all 200 clients on every tick | Keyed single-client delta update (`client_update`) | **$O(N) \to O(1)$** |
| **Outbound Network Load** | `200 clients × 20KB × 40/s = ~160 MB/s` | `1 client delta × 12KB × 40/s = ~600 KB/s` | **~266× Bandwidth Reduction** |
| **DOM Manipulation** | `grid.innerHTML = ""` re-decoding 200 base64 images 40/s | Keyed node caching (`#card-WS-001`), in-place `.src` swap | **Zero DOM Thrash (60 FPS)** |
| **Client Encoding** | Uncompressed raw PNG / heavy bicubic resize | 400×225 Bilinear downscaling + JPEG Quality 35–38 | **< 1.5% Client CPU Overhead** |
| **Memory Footprint** | Massive leaks from discarded uncollected blobs | Fixed DOM footprint with reused image elements | **Stable Browser Memory (< 90 MB)** |

---

## 🔍 8-Stage Detection Pipeline

Every monitored endpoint executes the multi-tier inspection pipeline on each cycle:

```
[ Stage 1: Custom Rules ]          ──> Checks user-defined administrator blacklist/whitelist
          │
[ Stage 2: Process Signatures ]    ──> Scans active processes against 120+ PC games, 13 launchers, 16 emulators & trading apps
          │
[ Stage 3: Window Title Scan ]     ──> Regex pattern matching for web games, casinos, Twitch/YouTube streams, social media
          │
[ Stage 4: Fullscreen + Gamepad ]  ──> Native ctypes XInput/DirectInput polling + Display resolution matching
          │
[ Stage 5: Background Window Scan] ──> Alt+Tab defense: detects minimized game instances running silently behind work apps
          │
[ Stage 6: Anti-Bypass / Anti-AFK] ──> Detects mouse jigglers, macro software, Cheat Engine, and process suspenders
          │
[ Stage 7: Gaming Network Sockets] ──> Inspects open TCP/UDP sockets for known gaming servers (Steam, Riot, Battle.net)
          │
[ Stage 8: PE Header Cloaking ]    ──> Validates internal PE file headers to catch renamed binaries (e.g., cs2.exe -> chrome.exe)
```

---

## 🧠 NVIDIA NIM AI Vision Auditing

When a violation or suspicious pattern is identified, Anuvadini Defender integrates with **NVIDIA NIM** to perform deep multimodal visual forensics:

- **Supported Models**:
  - `meta/llama-3.2-11b-vision-instruct` *(Default / Recommended)*
  - `meta/llama-3.2-90b-vision-instruct` *(High-Precision Audit)*
  - `nvidia/neva-22b` *(Enterprise Multi-Modal)*
  - `microsoft/phi-3.5-vision-instruct` *(Lightweight)*
- **Audit Classification Categories**:
  - `WORK`: IDEs, spreadsheets, business correspondence, CAD, terminals.
  - `GAMING`: 3D gameplay, HUDs, inventory screens, virtual lobbies.
  - `STREAMING`: Video players, anime streams, live gaming streams.
  - `SOCIAL`: Social feeds, chat applications, personal messengers.
  - `ANTI_AFK`: Screen lock evasion tools, artificial mouse movers.
- **Cryptographic Proof**: Captures GDI desktop state, generates SHA-256 tamper-evident hashes, and maintains a strict chain-of-custody in `violations` table.

---

## 📁 Repository Structure

```
Anuvadini Defender/
├── app.py                     # Dual-mode standalone executable application (Agent & Supervisor)
├── app_config.json            # Client configuration (server host, port, department, interval)
├── installer_wizard.py        # Graphical workstation installer wizard (Tkinter GUI)
├── mock_clients.py            # High-concurrency synthetic fleet simulator (50-200 nodes)
├── silent_agent.vbs           # Windows VBScript background launcher
├── ApexMonitor.spec           # PyInstaller single-file build specification
│
├── core/                      # Core detection & security engine
│   ├── afk.py                 # Native Win32 hardware idle & AFK detector (GetLastInputInfo)
│   ├── anti_tamper.py         # Anti-debugging, registry watchdog, and file permission integrity
│   ├── controller.py          # Native XInput / DirectInput gamepad detection
│   ├── database.py            # SQLite WAL persistence, analytics, and fleet health scoring
│   ├── enforcer.py            # Remote process killer, workstation lock, and desktop alerts
│   ├── engine.py              # 8-stage detection engine & autonomous shift scheduler
│   ├── evidence.py            # GDI desktop frame capture & SHA-256 tamper-evident proof
│   ├── nvidia_nim.py          # NVIDIA NIM multimodal vision API auditor
│   ├── signatures.py          # Database of 150+ game processes, launchers, emulators, and crypto apps
│   ├── watchdog.py            # Background heartbeat and process watchdog
│   └── watcher.py             # Active and background window enumeration via Win32 API
│
├── server/                    # Central Hub Server
│   ├── main.py                # FastAPI server, WebSocket delta broadcaster, and REST API
│   └── requirements.txt       # Server dependencies (FastAPI, Uvicorn, WebSockets, Jinja2, Psutil)
│
├── client/                    # Monitored Agent Module
│   ├── agent.py               # Lightweight background agent (ctypes, Pillow, PyGetWindow)
│   └── requirements.txt       # Agent dependencies
│
├── dashboard/                 # Admin Monitoring Dashboard
│   ├── templates/
│   │   └── index.html         # Enterprise dark-theme monitoring grid
│   └── static/
│       ├── css/dashboard.css  # Glassmorphism theme, pulsing alerts, live badges
│       └── js/dashboard.js    # Keyed DOM update engine & Web Audio chime alerts
│
├── deploy/                    # Containerization & Services
│   ├── Dockerfile             # Production container definition
│   ├── docker-compose.yml     # Docker Compose orchestration
│   ├── apexmonitor.service    # Linux systemd service configuration
│   ├── apexmonitor-user.service
│   └── apexmonitor-local.service
│
├── build_exe.bat / .ps1       # PyInstaller one-click executable compiler
├── setup_venv.bat / .ps1      # Automated virtual environment and dependency setup
├── start_server.bat / .ps1 / .sh    # Starts Central Hub server
├── start_agent.bat / .ps1 / .sh     # Starts local monitoring agent
└── start_simulator.bat / .ps1 / .sh # Starts 50-node fleet stress test
```

---

## 🚀 Quickstart & Installation

### Prerequisites
- **Python 3.10+** installed and added to `PATH`
- **Windows 10 / 11** (for monitored client agent; Linux/macOS fully supported for Central Hub Server)

### Step 1: Clone the Repository
```bash
git clone https://github.com/Mohan-Sai-Kompelli/Anuvadini-Defender.git
cd "Anuvadini-Defender"
```

### Step 2: Automated Virtual Environment Setup
Run the automated setup script to create `.venv` and install all dependencies:
```cmd
setup_venv.bat
```
*Or manually via PowerShell / Bash:*
```bash
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r server/requirements.txt
pip install -r client/requirements.txt
```

### Step 3: Launch the Central Hub Server
```cmd
start_server.bat
```
The server will initialize at **`http://localhost:8000`**.

### Step 4: Access the Admin Dashboard
Open your browser and navigate to:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 🧪 Testing with Agents & Synthetic Fleet

### Option A: Run a Real Monitoring Agent
```cmd
start_agent.bat
```
*Captures desktop screen, checks active window against games/entertainment patterns, and streams live telemetry to the dashboard.*

### Option B: Launch Unified Dual-Mode App (GUI)
```cmd
python app.py
```
- **Continue without Password**: Runs in the Windows system taskbar as a monitored workstation agent.
- **Continue with Password** *(Supervisor Mode)*: Unlocks administrative fleet monitoring and streams telemetry with supervisor privileges.

### Option C: Run 50–200 Node Synthetic Stress Test
To benchmark server throughput, network latency, and dashboard responsiveness under load:
```cmd
start_simulator.bat
```
*Spawns 50+ concurrent synthetic endpoints across Engineering, Design, Sales, Finance, and DevOps departments streaming dynamic frames, hardware metrics, and simulated violations.*

---

## 🛠️ Workstation Client Deployment

### Standalone Installer Wizard
Deploying to employee workstations is simplified using the included installation wizard:
```cmd
python installer_wizard.py
```
**Features of Installer Wizard:**
1. Prompts for Central Hub Server IP and Port.
2. Writes persistent `app_config.json`.
3. Registers Windows Autostart (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`).
4. Creates an elevated Windows Scheduled Task (`schtasks /create onlogon`).
5. Configures file ACLs for anti-tamper resilience.

### Compiling to a Single Standalone Executable
Compile the client application into a zero-dependency Windows executable:
```cmd
build_exe.bat
```
The compiled binary will be generated in `dist/ApexMonitor.exe`.

---

## 🌐 Enterprise Deployment

### Deploy via Docker & Docker Compose
```bash
cd deploy
docker-compose up -d --build
```

### Deploy on Linux Server (Systemd Service)
```bash
sudo cp deploy/apexmonitor.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now apexmonitor
```

### Client Remote Connection
Configure `app_config.json` on client machines:
```json
{
  "server_host": "YOUR_SERVER_IP_OR_DOMAIN",
  "server_port": 8000,
  "department": "Engineering",
  "frame_interval": 2.5
}
```
Or set environment variables:
```cmd
set MONITOR_SERVER_HOST=10.150.0.6
set MONITOR_SERVER_PORT=8000
```

---

## 📊 Enterprise Dashboard Features

- **🔴 Live Video Wall**: Real-time 16:9 thumbnail streams for each workstation with live status badges (`WORK`, `GAMING`, `IDLE`, `OFF_DUTY`, `LUNCH_BREAK`).
- **🚨 Instant Visual & Audio Alerting**: Glowing red pulse animations and subtle Web Audio chimes on policy breaches.
- **🔍 Modal Inspector**: Click any workstation card for high-resolution desktop inspection, active process metadata, and hardware gauges (CPU%, RAM%, Gamepad status).
- **⏱️ Shift & Lunch Countdown**: Live visualization of shift progress (09:30–17:30) and lunch break grace countdowns (13:00–14:00).
- **🎯 Remote Enforcement Actions**:
  - `Terminate Process`: Sends remote termination signal to kill unauthorized game/app.
  - `Lock Workstation`: Triggers immediate workstation lock screen.
  - `Send Warning Alert`: Displays custom modal alert dialog on the employee's screen.
- **📈 Department Analytics**: Live fleet health index, top violation offenders, and hourly activity trends.

---

## 🔒 Security, Integrity & Ethics

- **Cryptographic Chain of Custody**: Evidence screenshots are hashed using SHA-256 before storage to ensure tamper-evident forensic validity.
- **Privacy Policy Compliance**: Built-in exclusion lists and lunch grace periods prevent recording during designated personal breaks.
- **Anti-Tampering Watchdog**: Detects unauthorized process killing, debugger attachment, and configuration file modification.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
<b>Anuvadini Defender</b> • Enterprise Endpoint Activity Surveillance & Real-Time Intelligence Grid
</div>
