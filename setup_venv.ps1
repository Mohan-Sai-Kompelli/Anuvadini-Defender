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

Write-Host "[3/3] Installing Server & Client dependencies..." -ForegroundColor Yellow
pip install -r server\requirements.txt
pip install -r client\requirements.txt

Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host " [SUCCESS] ApexMonitor virtual environment is ready!" -ForegroundColor Green
Write-Host " Run .\start_server.bat or .\start_server.ps1 to start." -ForegroundColor Green
Write-Host "======================================================" -ForegroundColor Green
