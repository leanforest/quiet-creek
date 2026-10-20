@echo off
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
start "" "http://127.0.0.1:5173/"
call npm run dev
pause
