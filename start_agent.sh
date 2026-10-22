#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f ".venv/bin/activate" ]; then
    echo "[!] Virtual environment not found. Run ./start_server.sh or python3 -m venv .venv first."
    exit 1
fi

source .venv/bin/activate
echo "[*] Launching ApexMonitor Client Agent..."
python3 client/agent.py
