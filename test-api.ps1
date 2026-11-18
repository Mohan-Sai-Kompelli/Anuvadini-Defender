# Test script for the student lookup API
# Replace YOUR_UID with an actual student UID from your database

$apiUrl = "http://192.168.1.33:5001/api/auth/student/lookup"
$studentUid = "8117882067"  # Test student from database

Write-Host "Testing Student Lookup API" -ForegroundColor Cyan
Write-Host "URL: $apiUrl" -ForegroundColor Gray
Write-Host "UID: $studentUid" -ForegroundColor Gray
Write-Host "---" -ForegroundColor Gray

try {
    $body = @{
        uid = $studentUid
    } | ConvertTo-Json

    Write-Host "Request body: $body" -ForegroundColor Yellow

    $response = Invoke-WebRequest -Uri $apiUrl `
        -Method POST `
        -Headers @{ "Content-Type" = "application/json" } `
        -Body $body `
        -UseBasicParsing

    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Response:" -ForegroundColor Green
    Write-Host ($response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 5) -ForegroundColor Green
}
catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
        Write-Host "Response Body:" -ForegroundColor Red
        Write-Host ($_.Exception.Response.Content.ReadAsStream() | ForEach-Object { [System.Text.Encoding]::UTF8.GetString($_) }) -ForegroundColor Red
    }
}
