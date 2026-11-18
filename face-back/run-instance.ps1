# Runs a single face-back instance with the given port/thread count. Called
# by start-instances.ps1 in its own window per instance — kept as a separate
# file (instead of an inline -Command string) so there's no fragile nested
# quoting between the launcher and the child process.
param(
  [Parameter(Mandatory = $true)][int]$Port,
  [int]$Threads = 8
)

$env:FACE_API_PORT = "$Port"
$env:FACE_API_THREADS = "$Threads"
Write-Host "face-back instance on port $Port (FACE_API_THREADS=$Threads)" -ForegroundColor Green
python check.py
