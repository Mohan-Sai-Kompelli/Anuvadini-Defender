$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$venvActivate = Join-Path $scriptDir ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $venvActivate)) {
    Write-Host "[!] Virtual environment not found. Running setup..." -ForegroundColor Yellow
    & (Join-Path $scriptDir "setup_venv.ps1")
}

& $venvActivate
Set-Location (Join-Path $scriptDir "server")
Write-Host "[*] Launching ApexMonitor Server on 0.0.0.0:8000..." -ForegroundColor Cyan
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
