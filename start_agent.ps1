$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$venvActivate = Join-Path $scriptDir ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $venvActivate)) {
    Write-Host "[!] Virtual environment not found. Running setup..." -ForegroundColor Yellow
    & (Join-Path $scriptDir "setup_venv.ps1")
}

& $venvActivate
Set-Location (Join-Path $scriptDir "client")
Write-Host "[*] Launching ApexMonitor Client Agent..." -ForegroundColor Cyan
python agent.py
