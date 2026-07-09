# music 프로젝트 — 실행 안내
Write-Host ""
Write-Host "=== music (distribution) ===" -ForegroundColor Magenta
Write-Host ""
Write-Host "개발 (2개 터미널):" -ForegroundColor White
Write-Host "  Terminal 1:  .\run-backend.ps1   -> http://127.0.0.1:8020" -ForegroundColor Green
Write-Host "  Terminal 2:  .\run-frontend.ps1  -> http://127.0.0.1:5173" -ForegroundColor Green
Write-Host ""
Write-Host "배포형 (1개 터미널, API+UI 통합):" -ForegroundColor White
Write-Host "  .\run-prod.ps1                   -> http://127.0.0.1:8080" -ForegroundColor Cyan
Write-Host ""
Write-Host "Docker:" -ForegroundColor White
Write-Host "  docker compose up --build        -> http://127.0.0.1:8080" -ForegroundColor Cyan
Write-Host ""
