#!/bin/bash
# ==============================================================================
# Anuvadini Detector - MacBook Client Installer (v2.5)
# macOS Intel & Apple Silicon. Installs a background agent (no Dock icon) that
# starts at login. The employee must sign in with their Employee ID + password.
#
# Usage:   bash Anuvadini_Installer_Mac.sh http://<CENTRAL_SERVER_IP>:8055
# ==============================================================================

set -u

SERVER_URL="${1:-http://127.0.0.1:8055}"
SERVER_URL="${SERVER_URL%/}"
TARGET_DIR="$HOME/Library/Application Support/AnuvadiniDetector"
LAUNCH_AGENT_DIR="$HOME/Library/LaunchAgents"
LABEL="com.anuvadini.detector"
PLIST_FILE="$LAUNCH_AGENT_DIR/$LABEL.plist"

say()  { echo "[+] $*"; }
fail() {
    echo "[-] $*" >&2
    osascript -e "display dialog \"$*\" with title \"Anuvadini Setup\" buttons {\"OK\"} default button \"OK\" with icon stop" >/dev/null 2>&1 || true
    exit 1
}

echo "================================================================="
echo "   ANUVADINI DETECTOR - MACBOOK CLIENT SETUP"
echo "   Server: $SERVER_URL"
echo "================================================================="

# 1. Python 3 -------------------------------------------------------------------
command -v python3 >/dev/null 2>&1 || fail "Python 3 was not found. Please install Python 3.10 or newer from python.org and run this installer again."
BASE_PY="$(command -v python3)"

# 2. The central server must be reachable ------------------------------------------
if ! curl -sS --max-time 8 "$SERVER_URL/api/employee/verify/ping" -o /dev/null 2>/dev/null; then
    fail "Cannot reach the Anuvadini server at $SERVER_URL. Check the address and your network, then try again."
fi

# 3. Sign in with Employee ID + password (same rule as the Windows installer) ---
ask() { # ask "prompt" "default" [hidden]
    local hidden=""
    [ "${3:-}" = "hidden" ] && hidden=" with hidden answer"
    osascript -e "text returned of (display dialog \"$1\" default answer \"$2\" with title \"Anuvadini Workstation Setup\" with icon note$hidden)" 2>/dev/null
}

EMP_ID="$(ask "Enter your Employee ID:" "")" || fail "Setup cancelled."
[ -n "$EMP_ID" ] || fail "Employee ID is required."
EMP_PASS="$(ask "Enter your password:" "" hidden)" || fail "Setup cancelled."

HOSTNAME_SHORT="$(hostname -s 2>/dev/null || hostname)"
LOCAL_IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo 127.0.0.1)"

json_escape() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }
LOGIN_BODY="{\"employee_id\":$(json_escape "$EMP_ID"),\"password\":$(json_escape "$EMP_PASS"),\"hostname\":$(json_escape "$HOSTNAME_SHORT"),\"ip_address\":$(json_escape "$LOCAL_IP")}"
LOGIN_OUT="$(curl -sS --max-time 15 -X POST "$SERVER_URL/api/employee/login" -H 'Content-Type: application/json' -d "$LOGIN_BODY" -w '\n%{http_code}' 2>/dev/null || true)"
LOGIN_CODE="$(echo "$LOGIN_OUT" | tail -n1)"
LOGIN_JSON="$(echo "$LOGIN_OUT" | sed '$d')"
unset EMP_PASS LOGIN_BODY

if [ "$LOGIN_CODE" != "200" ]; then
    REASON="$(python3 -c 'import json,sys
try: print(json.loads(sys.argv[1]).get("error","Sign-in failed"))
except Exception: print("Sign-in failed")' "$LOGIN_JSON")"
    fail "$REASON"
fi

EMP_NAME="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("name") or "")' "$LOGIN_JSON")"
EMP_DEPT="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("department") or "")' "$LOGIN_JSON")"
[ -n "$EMP_NAME" ] || EMP_NAME="$(whoami)"
[ -n "$EMP_DEPT" ] || EMP_DEPT="General"
say "Signed in: $EMP_ID ($EMP_NAME) - $EMP_DEPT"

# 4. Download the client package ---------------------------------------------------
mkdir -p "$TARGET_DIR" "$LAUNCH_AGENT_DIR"
say "Downloading the client package..."
if curl -sSL --fail --max-time 60 "$SERVER_URL/api/download/client-bundle.zip" -o "$TARGET_DIR/bundle.zip"; then
    unzip -q -o "$TARGET_DIR/bundle.zip" -d "$TARGET_DIR" && rm -f "$TARGET_DIR/bundle.zip"
else
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    [ -d "$SCRIPT_DIR/anuvadini_detector" ] || fail "Could not download the client package from the server."
    cp -R "$SCRIPT_DIR/anuvadini_detector" "$TARGET_DIR/"
fi

# 5. Private Python environment (avoids "externally-managed-environment" errors) ----
say "Preparing the Python environment (first time takes about a minute)..."
if [ ! -x "$TARGET_DIR/venv/bin/python" ]; then
    "$BASE_PY" -m venv "$TARGET_DIR/venv" >/dev/null 2>&1 || fail "Could not create a Python environment. Install Python 3.10+ from python.org."
fi
PY_BIN="$TARGET_DIR/venv/bin/python"
"$PY_BIN" -m pip install --quiet --upgrade pip >/dev/null 2>&1 || true
"$PY_BIN" -m pip install --quiet psutil pillow pymongo >/dev/null 2>&1 || fail "Could not install the required Python packages (psutil, pillow, pymongo). Check your internet connection."

# 6. Agent configuration (written with Python so names containing quotes cannot break the JSON) -----
EMP_ID="$EMP_ID" EMP_NAME="$EMP_NAME" EMP_DEPT="$EMP_DEPT" SERVER_URL="$SERVER_URL" "$PY_BIN" - "$TARGET_DIR/agent_config.json" <<'PY'
import json, os, sys
json.dump({
    "employee_id": os.environ["EMP_ID"],
    "username": os.environ["EMP_NAME"],
    "department": os.environ["EMP_DEPT"],
    "server_url": os.environ["SERVER_URL"],
    "platform": "macOS",
}, open(sys.argv[1], "w"), indent=2)
PY
chmod 600 "$TARGET_DIR/agent_config.json"

# 7. macOS privacy permissions ------------------------------------------------------
# Without these the agent cannot read the page title, take evidence screenshots or close a blocked tab.
say "Requesting macOS permissions..."
osascript -e 'display dialog "Anuvadini needs three macOS permissions so it can work during office hours:\n\n  1. Screen Recording   (evidence screenshots)\n  2. Accessibility      (read the active window title)\n  3. Automation         (close a blocked browser tab)\n\nClick OK. macOS will now ask for each one. Please choose Allow / Open System Settings and switch Python ON." with title "Anuvadini Setup" buttons {"OK"} default button "OK" with icon note' >/dev/null 2>&1 || true
"$PY_BIN" -c "from PIL import ImageGrab; ImageGrab.grab()" >/dev/null 2>&1 || true
osascript -e 'tell application "System Events" to get name of first application process whose frontmost is true' >/dev/null 2>&1 || true
osascript -e 'tell application "Finder" to get name of startup disk' >/dev/null 2>&1 || true

# 8. Start at login with launchd (one instance only) ---------------------------------
cat > "$PLIST_FILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$PY_BIN</string>
        <string>-m</string>
        <string>anuvadini_detector.agent</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$TARGET_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>$TARGET_DIR/agent.log</string>
    <key>StandardOutPath</key>
    <string>/dev/null</string>
</dict>
</plist>
EOF

UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/$LABEL" >/dev/null 2>&1 || launchctl unload "$PLIST_FILE" >/dev/null 2>&1 || true
if ! launchctl bootstrap "gui/$UID_NUM" "$PLIST_FILE" >/dev/null 2>&1; then
    launchctl load "$PLIST_FILE" >/dev/null 2>&1 || {
        # last resort: run once now (launchd could not be used)
        ( cd "$TARGET_DIR" && nohup "$PY_BIN" -m anuvadini_detector.agent >/dev/null 2>&1 & )
    }
fi

osascript -e "display notification \"Running in the background. Signed in as $EMP_NAME.\" with title \"Anuvadini Detector is active\"" >/dev/null 2>&1 || true

# 9. Remove the installer from Downloads ------------------------------------------------
rm -f "$HOME/Downloads/Anuvadini_Installer_Mac.sh" "$HOME/Downloads/Anuvadini_Installer_Mac.command" 2>/dev/null || true

say "Installation complete. The agent runs silently in the background and starts at every login."
exit 0
