@echo off
setlocal
cd /d "%~dp0"

echo ======================================================
echo    Building ApexMonitor Standalone Executable (.exe)
echo ======================================================

if not exist ".venv\Scripts\pyinstaller.exe" (
    echo [*] Installing PyInstaller in .venv...
    call .venv\Scripts\activate.bat
    pip install pyinstaller
)

call .venv\Scripts\activate.bat

echo [*] Compiling app.py into ApexMonitor.exe...
pyinstaller --noconsole --onefile --name "ApexMonitor" --clean --noconfirm --hidden-import websockets --hidden-import PIL --hidden-import psutil --hidden-import pygetwindow --hidden-import pyrect app.py


if exist "dist\ApexMonitor.exe" (
    echo.
    echo ======================================================
    echo  [SUCCESS] Executable built successfully!
    echo  Location: dist\ApexMonitor.exe
    echo ======================================================
    copy "dist\ApexMonitor.exe" "ApexMonitor.exe" /y
    echo  Copied to project root: %~dp0ApexMonitor.exe
) else (
    echo [ERROR] Build failed. Check errors above.
)

pause
