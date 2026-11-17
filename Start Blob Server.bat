@echo off
rem Runs a copy of this file so an update can replace the original without breaking the running script.
if not "%~1"=="_run" (
  copy /y "%~f0" "%TEMP%\blob-server.bat" >nul
  "%TEMP%\blob-server.bat" _run "%~dp0"
  exit /b
)
set "ROOT=%~2"
title Blob Server
cd /d "%ROOT%"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%PATH%"
echo ==========================================
echo              BLOB SERVER
echo ==========================================

:start
rem ---- Auto-update from GitHub ----
set "BEFORE="
set "AFTER="
if exist ".git" (
  for /f %%i in ('git rev-parse HEAD 2^>nul') do set "BEFORE=%%i"
  echo Checking GitHub for updates...
  git pull --ff-only --quiet
  for /f %%i in ('git rev-parse HEAD 2^>nul') do set "AFTER=%%i"
)
if not "%BEFORE%"=="%AFTER%" (
  echo Update downloaded! Installing...
  goto install
)
if not exist "server\node_modules" goto install
if not exist "client\node_modules" goto install
if not exist "client\dist\index.html" goto install
goto run

:install
pushd server
call npm install --omit=dev --no-audit --no-fund
popd
pushd client
call npm install --no-audit --no-fund
call npm run build
popd

:run
cd /d "%ROOT%server"
if not exist "livekit\livekit-server.exe" (
  echo Downloading LiveKit (voice and video server^)...
  powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing 'https://github.com/livekit/livekit/releases/download/v1.13.11/livekit_1.13.11_windows_amd64.zip' -OutFile \"$env:TEMP\livekit.zip\"; Expand-Archive -Force \"$env:TEMP\livekit.zip\" livekit"
)
node src\setup.js
tasklist /FI "IMAGENAME eq livekit-server.exe" | find /I "livekit-server.exe" >nul || start "LiveKit (Blob voice and screen)" /min "%ROOT%server\livekit\livekit-server.exe" --config "%ROOT%server\livekit\livekit.yaml"
echo.
echo Server running! Keep this window open.
echo.
node src\index.js
if %errorlevel%==42 (
  echo.
  echo New version found, updating and restarting...
  cd /d "%ROOT%"
  goto start
)
echo.
echo The server stopped. If there is an error above, send a screenshot to Claude.
pause
