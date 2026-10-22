#!/usr/bin/env bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f ".venv/bin/activate" ]; then
    echo "[!] Virtual environment not found. Creating .venv..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install --upgrade pip
    pip install -r server/requirements.txt
    pip install -r client/requirements.txt
else
    source .venv/bin/activate
fi

echo "[*] Launching ApexMonitor Server on http://0.0.0.0:8000..."
python3 -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
