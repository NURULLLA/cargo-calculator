@echo off
cd /d "%~dp0"
echo Starting SkyGuard Web App Server...
echo.
echo NOTE: Keep this window open while using the app.
echo.
start "" "http://localhost:8000"
python -m http.server 8000
pause
