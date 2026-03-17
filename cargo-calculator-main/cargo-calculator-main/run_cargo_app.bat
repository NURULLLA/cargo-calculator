@echo off
cd /d "%~dp0"
echo Starting SkyGuard Cargo Calculator...
python cargo_calculator.py --interactive
echo.
echo Calculation Complete. Data exported.
echo You can now open visualizer_3d.html or visualizer_main_deck.html
pause
