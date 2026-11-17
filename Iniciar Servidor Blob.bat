@echo off
rem Roda uma copia deste arquivo, assim a atualizacao pode substituir o original sem quebrar nada.
if not "%~1"=="_run" (
  copy /y "%~f0" "%TEMP%\blob-servidor.bat" >nul
  "%TEMP%\blob-servidor.bat" _run "%~dp0"
  exit /b
)
set "ROOT=%~2"
title Servidor Blob
cd /d "%ROOT%"
set "PATH=%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%PATH%"
echo ==========================================
echo           SERVIDOR BLOB
echo ==========================================

:inicio
rem ---- Atualizacao automatica pelo GitHub ----
set "ANTES="
set "DEPOIS="
if exist ".git" (
  for /f %%i in ('git rev-parse HEAD 2^>nul') do set "ANTES=%%i"
  echo Procurando atualizacoes no GitHub...
  git pull --ff-only --quiet
  for /f %%i in ('git rev-parse HEAD 2^>nul') do set "DEPOIS=%%i"
)
if not "%ANTES%"=="%DEPOIS%" (
  echo Atualizacao baixada! Instalando...
  goto instalar
)
if not exist "server\node_modules" goto instalar
if not exist "client\node_modules" goto instalar
if not exist "client\dist\index.html" goto instalar
goto rodar

:instalar
pushd server
call npm install --omit=dev --no-audit --no-fund
popd
pushd client
call npm install --no-audit --no-fund
call npm run build
popd

:rodar
cd /d "%ROOT%server"
if not exist "livekit\livekit-server.exe" (
  echo Baixando o LiveKit (servidor de voz e video^)...
  powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing 'https://github.com/livekit/livekit/releases/download/v1.13.11/livekit_1.13.11_windows_amd64.zip' -OutFile \"$env:TEMP\livekit.zip\"; Expand-Archive -Force \"$env:TEMP\livekit.zip\" livekit"
)
node src\setup.js
tasklist /FI "IMAGENAME eq livekit-server.exe" | find /I "livekit-server.exe" >nul || start "LiveKit (voz e tela do Blob)" /min "%ROOT%server\livekit\livekit-server.exe" --config "%ROOT%server\livekit\livekit.yaml"
echo.
echo Servidor rodando! Nao feche essa janela.
echo.
node src\index.js
if %errorlevel%==42 (
  echo.
  echo Nova versao encontrada, atualizando e reiniciando...
  cd /d "%ROOT%"
  goto inicio
)
echo.
echo O servidor parou. Se apareceu um erro acima, mande um print pro Claude.
pause
