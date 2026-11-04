@echo off
REM Inicia la plataforma de cotizaciones (deja esta ventana abierta).
REM Para que arranque sola con Windows, usa instalar-servicio-windows.ps1
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta Node.js 22 o superior: https://nodejs.org & pause & exit /b 1)
node servidor.js
pause
