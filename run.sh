#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# SAACMS one-shot launcher.
#
#   ./run.sh              start everything; rebuild the app only if the IP changed
#   ./run.sh --no-app     servers only, never touch the app
#   ./run.sh --force-app  always rebuild + reinstall the app
#
# Detects the Mac's current Wi-Fi IP and bakes it into the app build so the phone
# reaches the backend + face server over Wi-Fi (no adb-reverse tunnel). Each
# service opens in ITS OWN Terminal window so you see the live console; a copy is
# also written to logs/<name>.log. The app build streams in THIS terminal.
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
PKG="com.NATSAttendance.myapp"
LAST_IP_FILE="/tmp/saacms-last-baked-host"
RUNDIR="$ROOT/logs"
mkdir -p "$RUNDIR"

MODE="auto"; USE_IP=0; USE_USB=0
for a in "$@"; do
  case "$a" in
    --no-app)    MODE="none" ;;
    --force-app) MODE="force" ;;
    --ip)        USE_IP=1 ;;   # bake the raw IP instead of the stable .local name
    --usb)       USE_USB=1 ;;  # reach the Mac over the USB cable (adb reverse), not Wi-Fi
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '   \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '   \033[33m!\033[0m %s\n' "$1"; }

# ── 1. resolve the backend host the phone will use ───────────────────────────
# Prefer the Mac's stable Bonjour name (resolves to the current IP via mDNS, so
# it survives the IP changing) over a raw IP. --ip forces the raw IP.
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)"
MDNS="$(scutil --get LocalHostName 2>/dev/null)"
if [ -z "$IP" ] && [ -z "$MDNS" ]; then
  echo "❌ Not on Wi-Fi (no en0/en1 IP and no Bonjour name). Connect to Wi-Fi and re-run."
  exit 1
fi
if [ "$USE_USB" = "1" ]; then
  # USB tunnel: the app hits its own localhost:5001, which `adb reverse` forwards
  # over the cable to the Mac. No Wi-Fi at all — immune to AP isolation / flaky
  # links / IP changes. The reverse mappings are set up after install (section 6b).
  HOST="localhost:5001"; HOSTKIND="USB tunnel (adb reverse — robust, no Wi-Fi needed)"
elif [ "$USE_IP" = "1" ] || [ -z "$MDNS" ]; then
  HOST="$IP:5001"; HOSTKIND="IP (changes with the network)"
else
  HOST="$MDNS.local:5001"; HOSTKIND="Bonjour name (stable — survives IP changes)"
fi
bold "🌐 App backend host: http://$HOST"
echo "   $HOSTKIND   ·   current IP: ${IP:-none}   ·   run with --ip to bake the raw IP"

# ── 2. pick a python for face-back (.venv if it has flask, else system) ──────
PY="python3"
if [ -x "$ROOT/face-back/.venv/bin/python" ] && "$ROOT/face-back/.venv/bin/python" -c "import flask" >/dev/null 2>&1; then
  PY="$ROOT/face-back/.venv/bin/python"
fi

# ── 3. stop anything already running ─────────────────────────────────────────
bold "🧹 Stopping existing processes"
for P in 5001 3005 50011 8081; do
  PID="$(lsof -tiTCP:$P -sTCP:LISTEN 2>/dev/null)"
  if [ -n "$PID" ]; then kill $PID 2>/dev/null; ok "freed port $P (pid $PID)"; fi
done
pkill -f "adb-reverse-keepalive" 2>/dev/null && ok "stopped adb-reverse keepalive"
pkill -f "react-native start" 2>/dev/null
pkill -f "check.py" 2>/dev/null
# close the previous run's service windows so they don't pile up
for T in backend faceback client; do
  osascript -e "tell application \"Terminal\" to close (windows whose name contains \"saacms-$T\")" >/dev/null 2>&1
done
sleep 2

# ── 4. open each service in its own Terminal window (live console + log) ──────
open_service() {
  local name="$1" dir="$2" cmd="$3"
  local f="$RUNDIR/saacms-$name.command"
  cat > "$f" <<EOF
#!/bin/bash
cd "$dir"
printf '\033]0;saacms-$name\007'
echo "════════════════════════════════════════════════════════════"
echo "  SAACMS · $name"
echo "  \$ $cmd"
echo "════════════════════════════════════════════════════════════"
$cmd 2>&1 | tee "$RUNDIR/$name.log"
echo ""
echo "── $name stopped (exit). You can close this window. ──"
EOF
  chmod +x "$f"
  open "$f"
}

bold "🚀 Opening service consoles (3 Terminal windows)"
open_service backend  "$ROOT/server"    "node index.js"
open_service faceback "$ROOT/face-back" "env PYTORCH_ENABLE_MPS_FALLBACK=1 '$PY' check.py"
open_service client   "$ROOT/client"    "env BROWSER=none PORT=3005 REACT_APP_API_URL='http://$HOST/api' npm start"
ok "backend (5001) · faceback (50011) · client (3005)"

# ── 5. wait for the backend to come up ───────────────────────────────────────
printf "   waiting for backend"
for i in $(seq 1 40); do
  if curl -s -m2 "http://localhost:5001/api/health" 2>/dev/null | grep -q '"status":"OK"'; then printf " up\n"; break; fi
  printf "."; sleep 1
done

# ── 6. build + install the app with the current IP baked in ──────────────────
if [ "$MODE" = "none" ]; then
  bold "📱 App: skipped (--no-app)"
elif ! adb get-state >/dev/null 2>&1; then
  bold "📱 App: no Android device connected — skipped"
  warn "Plug in the phone + re-run, OR set the host to $HOST in the app's Settings."
elif [ "$MODE" = "auto" ] && [ "$(cat "$LAST_IP_FILE" 2>/dev/null)" = "$HOST" ] && adb shell pm list packages 2>/dev/null | grep -q "$PKG"; then
  bold "📱 App: already built for $HOST — skipped (use --force-app to rebuild)"
else
  bold "📱 Building the app for http://$HOST  (gradle output below)"
  cp src/config.ts /tmp/saacms-config.bak
  # Bake the LAN IP into BOTH platform defaults (restored right after the build).
  sed -i '' -E "s#'localhost:5001'#'$HOST'#g; s#'[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}:5001'#'$HOST'#g" src/config.ts
  ( cd "$ROOT/android" && ./gradlew assembleRelease )
  BUILD_RC=$?
  cp /tmp/saacms-config.bak src/config.ts   # always restore the tracked file
  rm -f /tmp/saacms-config.bak
  if [ "$BUILD_RC" -ne 0 ]; then
    echo "   ❌ Gradle build failed — see output above. App not installed."
  else
    APK="android/app/build/outputs/apk/release/app-release.apk"
    if ! adb install -r "$APK" >/dev/null 2>/tmp/saacms-inst.err; then
      warn "signature mismatch — uninstalling old build then installing fresh"
      adb uninstall "$PKG" >/dev/null 2>&1
      adb install "$APK" >/dev/null 2>&1
    fi
    for PERM in ACCESS_FINE_LOCATION ACCESS_COARSE_LOCATION CAMERA POST_NOTIFICATIONS; do
      adb shell pm grant "$PKG" "android.permission.$PERM" >/dev/null 2>&1
    done
    adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
    echo "$HOST" > "$LAST_IP_FILE"
    if [ "$USE_USB" = "1" ]; then
      ok "installed + launched → posts to http://$HOST via the USB cable"
    else
      ok "installed + launched → posts to http://$HOST over Wi-Fi"
    fi
    warn "After login, on first check-in tap 'Allow all the time' for location + accept the battery prompt."
  fi
fi

# ── 6b. USB tunnel: forward the phone's localhost → the Mac over the cable ───
# Runs whenever --usb is set and a device is attached, even if the app build was
# skipped — `adb reverse` mappings are lost on replug/reboot, so re-apply every
# run. A tiny keepalive re-applies them every few seconds so unplug/replug or an
# app restart keeps working without re-running this script. 5001 = backend,
# 50011 = face-back (getFaceRecognitionApiUrl derives its host from apiHost).
if [ "$USE_USB" = "1" ] && [ "$MODE" != "none" ] && adb get-state >/dev/null 2>&1; then
  bold "🔌 USB tunnel (adb reverse): phone localhost → Mac"
  adb reverse tcp:5001 tcp:5001   >/dev/null 2>&1 && ok "tcp:5001  → backend"
  adb reverse tcp:50011 tcp:50011 >/dev/null 2>&1 && ok "tcp:50011 → face-back"
  KA="$RUNDIR/adb-reverse-keepalive.sh"
  cat > "$KA" <<'EOF'
#!/bin/bash
# saacms adb-reverse-keepalive — re-applies the USB port forwards every 5s.
while sleep 5; do
  adb reverse tcp:5001 tcp:5001   >/dev/null 2>&1
  adb reverse tcp:50011 tcp:50011 >/dev/null 2>&1
done
EOF
  chmod +x "$KA"
  nohup "$KA" >/dev/null 2>&1 &
  disown 2>/dev/null
  ok "keepalive running (survives unplug/replug; stopped on next ./run.sh)"
  # bounce the app so it starts fresh now that the tunnel is up
  adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
fi

# ── 7. summary ───────────────────────────────────────────────────────────────
echo ""
bold "✅ Up and running"
echo "   Backend   →  http://$IP:5001        (console: 'saacms-backend' window · logs/backend.log)"
echo "   Face-back →  http://$IP:50011       (console: 'saacms-faceback' window · logs/faceback.log)"
echo "   Web (HOI) →  http://localhost:3005   (console: 'saacms-client' window · logs/client.log)"
echo "   API host  →  http://$HOST/api  (baked into BOTH the app build and the web client)"
if [ "$USE_USB" = "1" ]; then
  echo "   App host  →  $HOST  (USB tunnel — keep the cable plugged in; no Wi-Fi needed)"
else
  echo "   App host  →  $HOST  (Wi-Fi — phone and Mac must share the same network)"
fi
echo ""
echo "   3 Terminal windows show the live consoles. Closing a window stops that service."
echo "   Re-run ./run.sh to restart everything (it closes the old windows first)."
