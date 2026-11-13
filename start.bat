@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao foi encontrado neste computador.
  echo Instale a versao LTS em https://nodejs.org e execute este arquivo novamente.
  echo.
  pause
  exit /b 1
)

echo.
echo Iniciando a Rede Fab Lab Presidente Prudente...
echo O navegador abrira em http://localhost:3000
echo Para encerrar o sistema, feche esta janela ou pressione Ctrl+C.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"
node server.js

pause
