@echo off
cd /d "%~dp0"
echo Starting Cargo Optimizer Server...
echo.
echo ===================================================
echo  DO NOT CLOSE THIS WINDOW WHILE USING THE APP
echo ===================================================
echo.
echo Opening browser...
start http://localhost:8080
echo.
echo Server is running on PORT 8080.
echo Press Ctrl+C to stop.
python -m http.server 8080
pause
