Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   ApexMonitor Enterprise - Virtual Environment Setup" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

Write-Host "[1/3] Creating Python Virtual Environment in .venv..." -ForegroundColor Yellow
python -m venv .venv
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Failed to create virtual environment. Ensure Python is installed." -ForegroundColor Red
    exit 1
}

Write-Host "[2/3] Activating virtual environment & upgrading pip..." -ForegroundColor Yellow
$envPath = Join-Path $scriptDir ".venv\Scripts\Activate.ps1"
if (Test-Path $envPath) {
    & $envPath
} else {
    $pythonExe = Join-Path $scriptDir ".venv\Scripts\python.exe"
}

python -m pip install --upgrade pip

Write-Host "[3/3] Installing Client EXE build dependencies..." -ForegroundColor Yellow
if (Test-Path "requirements-client.txt") {
    pip install -r requirements-client.txt
} else {
    pip install websockets Pillow pygetwindow psutil qrcode pyrect pyinstaller
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host " [SUCCESS] ApexMonitor build environment is ready!" -ForegroundColor Green
Write-Host " Run .\build_exe.ps1 or build_exe.bat to compile the standalone .exe" -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
