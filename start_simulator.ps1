$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$venvActivate = Join-Path $scriptDir ".venv\Scripts\Activate.ps1"
if (-not (Test-Path $venvActivate)) {
    Write-Host "[!] Virtual environment not found. Running setup..." -ForegroundColor Yellow
    & (Join-Path $scriptDir "setup_venv.ps1")
}

& $venvActivate
Write-Host "[*] Launching 50-node synthetic load simulator..." -ForegroundColor Cyan
python mock_clients.py
