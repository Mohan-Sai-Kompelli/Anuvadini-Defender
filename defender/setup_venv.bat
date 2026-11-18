@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo    ApexMonitor Enterprise - Virtual Environment Setup
echo ======================================================

echo [1/3] Creating Python Virtual Environment in .venv...
python -m venv .venv
if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment. Ensure Python 3.9+ is in PATH.
    pause
    exit /b 1
)

echo [2/3] Activating virtual environment and upgrading pip...
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip

echo [3/3] Installing Client EXE build dependencies...
if exist "requirements-client.txt" (
    pip install -r requirements-client.txt
) else (
    pip install websockets Pillow pygetwindow psutil qrcode pyrect pyinstaller
)

echo.
echo ======================================================
echo  [SUCCESS] ApexMonitor build environment is ready!
echo  Run build_exe.bat to compile the standalone .exe
echo ======================================================
pause
