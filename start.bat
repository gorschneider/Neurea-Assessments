@echo off
REM Romberg-Assessment starten (Windows)
cd /d "%~dp0"
where py >nul 2>nul && (py -3 server.py %*) || (python server.py %*)
pause
