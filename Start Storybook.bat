@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul && (py -3 serve.py & goto done)
where python >nul 2>nul && (python serve.py & goto done)
echo Please install Python 3 or serve the web folder over HTTPS.
:done
pause
