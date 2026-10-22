@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\activate.bat" (
    echo [!] Virtual environment not detected. Running setup_venv.bat first...
    call setup_venv.bat
)

echo [*] Activating venv and launching ApexMonitor Server...
call .venv\Scripts\activate.bat
cd server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause
