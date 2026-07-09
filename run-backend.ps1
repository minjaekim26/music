$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\backend

$MusicPort = 8020

Write-Host "[music] Installing Python dependencies..." -ForegroundColor Cyan
python -m pip install -r requirements.txt

# 기존 music uvicorn 프로세스 정리 (8000/8020 등)
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
        $_.CommandLine -and
        $_.CommandLine -match 'uvicorn\s+main:app' -and
        $_.CommandLine -match 'Projects\\music'
    } |
    ForEach-Object {
        Write-Host "[music] Stopping old backend PID $($_.ProcessId)..." -ForegroundColor Yellow
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

$portInUse = Get-NetTCPConnection -LocalPort $MusicPort -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    foreach ($conn in $portInUse) {
        $procId = $conn.OwningProcess
        Write-Host "[music] Freeing port $MusicPort (PID $procId)..." -ForegroundColor Yellow
        Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
}

$headersFile = Join-Path $PSScriptRoot "backend\data\ytmusic_headers.json"
if (-not (Test-Path $headersFile)) {
    Write-Host ""
    Write-Host "NOTE: YouTube Music headers not set yet." -ForegroundColor Yellow
    Write-Host "  Run once: .\setup-ytmusic.ps1" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "[music] Backend -> http://127.0.0.1:$MusicPort" -ForegroundColor Green
Write-Host "[music] API docs -> http://127.0.0.1:$MusicPort/docs" -ForegroundColor Green
python -m uvicorn main:app --reload --host 127.0.0.1 --port $MusicPort
