@echo off
setlocal enabledelayedexpansion
title Anuvadini Detector - Enterprise Workstation Setup
color 0B

:: Self-unblock Mark-of-the-Web zone identifier if downloaded from browser
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Unblock-File -Path '%~f0' -ErrorAction SilentlyContinue } catch {}" >nul 2>&1

:: ==============================================================================
:: Anuvadini Detector - Enterprise Workstation Client Installer (v2.4)
:: Automated deployment wizard, Employee ID binding & self-cleaning stealth launcher
:: ==============================================================================

set "SERVER_URL=%~1"
if "%SERVER_URL%"=="" set "SERVER_URL=http://127.0.0.1:8055"

set "TARGET_DIR=C:\ProgramData\AnuvadiniDetector"
if not exist "%TARGET_DIR%" mkdir "%TARGET_DIR%" >nul 2>&1

echo ======================================================================
echo   ANUVADINI DETECTOR - ENTERPRISE CLIENT SETUP
echo   Zero-Bypass ^& Tamper-Resistant Security Engine
echo   Connecting to Central Server: %SERVER_URL%
echo ======================================================================
echo.

:: 1. Check Python runtime environment
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python 3.10+ is required but not found in PATH!
    echo Please install Python from https://www.python.org/downloads/
    pause
    exit /b 1
)

:: 2. Check if local package exists, else download from Central Server
if not exist "%~dp0anuvadini_detector" (
    echo [+] Downloading client security bundle from Central Server...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
        "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; " ^
        "try { Invoke-WebRequest -Uri '%SERVER_URL%/api/download/client-bundle.zip' -OutFile '%TARGET_DIR%\bundle.zip' -TimeoutSec 30 } catch { exit 1 }"
    
    if exist "%TARGET_DIR%\bundle.zip" (
        echo [+] Extracting client security package...
        powershell -NoProfile -ExecutionPolicy Bypass -Command ^
            "Expand-Archive -Path '%TARGET_DIR%\bundle.zip' -DestinationPath '%TARGET_DIR%' -Force"
        del /f /q "%TARGET_DIR%\bundle.zip" >nul 2>&1
    ) else (
        echo [!] Server download failed. Checking local files...
    )
) else (
    echo [+] Copying local repository files to protected system folder...
    xcopy /e /y /i /q "%~dp0anuvadini_detector" "%TARGET_DIR%\anuvadini_detector" >nul 2>&1
    copy /y "%~dp0requirements.txt" "%TARGET_DIR%\" >nul 2>&1
    copy /y "%~dp0installer_wizard.py" "%TARGET_DIR%\" >nul 2>&1
    copy /y "%~dp0python_agent_launcher.vbs" "%TARGET_DIR%\" >nul 2>&1
)

:: 3. Install lightweight dependencies quietly
echo [+] Verifying dependencies...
python -m pip install -r "%TARGET_DIR%\requirements.txt" --quiet >nul 2>&1

:: 4. Launch GUI Onboarding & Employee ID Login Screen
echo.
echo [+] Launching Workstation Onboarding Wizard...
cd /d "%TARGET_DIR%"
python "%TARGET_DIR%\installer_wizard.py"

:: 5. Self-Hiding Cleanup: Delete installer batch script from Downloads
echo.
echo [+] Cleaning up installation traces...
del /f /q "%~f0" >nul 2>&1

exit /b 0
