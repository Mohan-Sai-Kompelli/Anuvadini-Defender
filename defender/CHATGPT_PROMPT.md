# Prompt for ChatGPT (copy everything below the line)

---

You are helping me with a product called **Anuvadini Defender**. It is the workstation-monitoring and policy-enforcement module of my app **Anuvadini Attendance** (an employee attendance system for Anuvadini Foundation). Below is exactly what Defender does, how it is built, and what is and is not finished. Treat this as the source of truth. Do not invent features that are not listed here. If I ask for something that is not covered, say so and propose how it could be added.

## 1. What Defender is

Defender watches company PCs during office hours and detects non-work activity: PC games, browser games, gambling and betting sites, adult sites, social media, streaming, game controllers, and tricks employees use to hide it (renamed game files, cloud gaming, remote desktop, fake-idle mouse jigglers, killing the agent). It records evidence, enforces policy, and gives the admin a dashboard. The aim is a fair workplace compliance record, not general surveillance: it only enforces inside configured office hours and has a work-app whitelist.

## 2. Architecture

- **Defender engine**: Python 3.13, FastAPI + uvicorn, MongoDB (database `anuvadini_detector`), runs on port 8055. Code is in the folder `defender/anuvadini_detector/`. It also monitors the PC it runs on.
- **Agent**: the same Python package, run silently on each employee PC (`python -m anuvadini_detector.agent`). It reports to the engine every ~5 seconds, enforces policy locally, streams its screen, and executes remote commands. Installers: `Anuvadini_Installer.bat` (Windows), `Anuvadini_Installer_Mac.sh` (macOS), plus a client bundle zip. Employees sign in to the installer with their employee ID and password; the server binds the PC and its IP to that employee.
- **Anuvadini Attendance web app**: React (CRA) client + Node/Express + MongoDB. The Defender admin UI is a set of React pages inside it, under `/defender/*`, reachable through the product switcher (Attendance | Defender).
- **Gateway**: browser -> Express `/api/defender/*` -> Defender service. The gateway requires an organisation-admin login (HODs and super-admin view are rejected), only forwards an allow-list of admin endpoints, and never forwards cookies. Agent endpoints are deliberately not reachable through it; agents talk to the Defender service directly. The Express server starts the Defender engine automatically if it is not running (disable with `DEFENDER_AUTOSTART=0`).
- Config via env: `DEFENDER_URL`, `DEFENDER_HOST`, `DEFENDER_PORT`, `DEFENDER_AUTOSTART`, `DEFENDER_NO_BROWSER`, `DEFENDER_SEED_DEMO`, `MONGO_URI`, `MONGO_DB_NAME`, `ANUVADINI_ADMIN_PASSWORD`, `NVIDIA_API_KEY`.

## 3. How detection works (priority order, every ~1.5 s)

The engine reads the foreground window (process, title, PID, fullscreen), idle time, and whether a gamepad is connected. Enforcement only runs **inside office hours** (default 09:30 to 17:30, Monday to Saturday, configurable) and **never during the lunch break (13:00 to 14:00)** unless the admin turns on "Always enforce". Then it checks, in this order, and stops at the first match:

1. **Website firewall (window interceptor)**: if the active tab title/domain matches a blocked domain, the browser tab is closed silently within about 0.5 s (no sound, no kill), and a firewall event is logged.
2. **Custom rules** the admin added (application name or window keyword, action alert or close).
3. **Known game and launcher signatures** (process name). Real counts: about 88 game executables, 12 launchers (Steam, Epic, Riot, Battle.net and others), 14 anti-AFK/macro tools. A 25-entry productivity whitelist (office and dev tools) is never flagged.
4. **Window-title signatures**: context-aware regexes for web games, game streams and gambling. Titles that look like work (docs, reports, news about a game) are ignored; explicit gambling domains are always flagged.
5. **Fullscreen + gamepad heuristic**: an unknown fullscreen app while a controller is connected is flagged as "Unknown Game", except for apps that are normally fullscreen at work (presentations, video calls, browsers, PDF viewers).
6. **Background or minimised games**: scans all visible windows, not just the active one.
7. **Evasion tools**: cloud gaming and remote desktop (Parsec, GeForce NOW, AnyDesk, TeamViewer), Android emulators and VMs (BlueStacks, LDPlayer, Nox, GameLoop, VirtualBox), AutoHotkey-style macro injectors.
8. **Network socket inspection**: open connections to known game servers, which catches renamed or hidden executables.
9. **PE-header cloaking**: reads executable metadata to catch a game renamed to something like notepad.exe or calc.exe.
10. **Synthetic mouse movement**: statistical analysis of cursor paths (uniform speed, repeating shapes, no human micro-pauses) to catch mouse jigglers and anti-AFK bots.

A match creates a violation record (employee, PC, game or site, category, window title, process, PID, duration, severity), takes a **screenshot as evidence** (watermarked), raises an admin notification, and applies enforcement according to settings.

**Enforcement options** (all admin-controlled): warning popup on the employee screen, alert sound, automatic closing of the offending app, remote "end application", remote lock screen, remote warning. Firewall catches are always silent.

**Idle/AFK tracking** uses native OS input counters (Windows GetLastInputInfo, macOS ioreg, Linux xprintidle); a PC counts as idle after 60 s locally and 180 s for timesheet ticks.

## 4. Anti-tamper and reliability

- **Dead-man's switch**: if a PC stops reporting during the shift (agent killed, network cut), it is marked "Not reporting" (internal status TAMPER_ALERT).
- **Mutual watchdog**: a supervisor process restarts the engine/agent if it is killed via Task Manager or taskkill, and logs a CRITICAL "Anti-Tamper" incident.
- **Process protection** (Windows DACL hardening) and a module-integrity check.
- **Hosts-file sinkhole**: blocked domains are also redirected to 127.0.0.1 in the system hosts file during office hours (needs administrator rights), then removed after hours.
- **Autostart** on boot (Windows registry, macOS LaunchAgent, Linux).
- Brute-force protection: employee login throttled (5 failures per account per IP, 30 per IP), passwords PBKDF2-hashed, upload size limits, cross-origin and DNS-rebinding checks on the admin API.

## 5. Optional AI review

NVIDIA NIM vision models (Llama 3.2 Vision 11B/90B, Qwen 2.5 VL, NeVA, Phi 3.5 Vision) can double-check a screenshot. It needs an API key; without one the engine uses local signature rules only and labels the result "not AI".

## 6. Data Defender stores (MongoDB)

Workstations (status, current app, window title, last heartbeat, IP, employee), violations, custom rules, firewall rules and firewall logs, attendance ticks and daily timesheets, admin notifications, settings, employees registry, queued remote commands, and evidence screenshots on disk (`data/evidence`).

**Timesheet** per employee per day: clock-in, clock-out, total hours, productive hours, idle hours, policy (gaming) hours, and a compliance score (productive / total).

## 7. The admin UI inside Anuvadini Attendance (`/defender/...`)

All pages poll the engine (about every 5 to 15 s), pause when the tab is hidden, keep the last good data if a refresh fails, and show a clear "Defender engine is not running" panel when the service is down. Styling follows the Anuvadini theme.

1. **Overview**: shift status banner (enforcing or standby), KPIs (reporting workstations, compliance score, violations today, not reporting), work vs non-work minutes by hour chart, "needs attention" list, recent incidents.
2. **Workstations**: searchable, filterable (department, status) table of every enrolled PC. Click a row for a drawer with a live screen preview and actions: send warning, lock screen, end application, remove PC (each destructive action asks for confirmation). Bulk actions: warn all flagged, end all flagged apps.
3. **Live screens**: grid of live desktop screenshots (refresh about every 3 s), paginated, click to enlarge (about 1.5 s refresh). Offline PCs show a "No live signal" placeholder.
4. **Incidents**: filterable list (severity, category, text, last 50 to 500), evidence screenshot viewer, CSV export.
5. **Analytics**: today's split (productive / non-work / idle), most frequent detections, incidents by category, employees with most incidents.
6. **Web firewall**: on/off switch, blocklist of 142 default domains in 6 categories (Web Gaming 18, Gambling and Betting 54, Social Media 24, Adult 30, Streaming 10, Dating 6), search, filter, add a domain (validated), enable/disable or delete a rule, sync now, recent blocks.
7. **Detection rules**: add custom rules by application name or window keyword, with alert-only or close-app action; delete rules.
8. **Tamper protection**: live scan results for silent agents, evasion tools, gaming network connections and disguised programs, with a "Scan again" button.
9. **Timesheet**: pick a date, per-employee hours and compliance, CSV export.
10. **Engine and agents**: engine toggles (monitoring, auto-close apps, warning popup, sound, start with Windows), server health (CPU, memory, workstations, database size, uptime), office-hours editor (start, end, working days, follow schedule, always enforce), AI screen review settings and key test, downloads for the Windows installer, macOS installer and client bundle, and a "create a test incident" button (test PC removes itself after about 45 s).

## 8. Honest status and known gaps (do not claim otherwise)

- The Defender **employees registry is its own list inside the Defender database**; it is not yet synced with Anuvadini Attendance staff. Agent login uses that registry.
- Defender's **timesheet is separate from Anuvadini Attendance's attendance records** (face-verified check-in and check-out). They are not merged or cross-checked yet.
- The old detector dashboard had a notification bell and a live WebSocket feed. The new UI polls instead and does not yet show the Defender notification center or the "run AI audit on the screen now" button (the API for both exists).
- The README of the original project says "300+ signatures"; the real numbers are the ones in section 3 plus 142 firewall domains.
- CPU and RAM per workstation are not shown because agents do not report them.
- The engine on the server PC also monitors that PC itself. Remote agents run only where the installer was run.
- Agents must reach the server on port 8055 (the engine must listen on `0.0.0.0` for LAN agents).
- Running on Windows gives the full feature set (win32 hooks, DACL protection, hosts sinkhole). macOS and Linux support is partial.
- Legal and privacy note: screen capture and monitoring of employees should be disclosed in company policy and comply with local law; the system limits itself to office hours and a work whitelist.

## 9. How I want you to help

Use the above to answer my questions, write documentation, create user guides, write test plans, propose improvements, or draft policy text. When you propose code, keep to this stack (Python/FastAPI for the engine, React with the Anuvadini theme for UI, Express gateway for admin traffic). If something is ambiguous, ask me one short question before assuming.
