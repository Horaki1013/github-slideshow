# Registra la plataforma como tarea que arranca sola al encender el servidor (Windows Server 2016 o superior).
# Ejecutar en PowerShell como administrador:  powershell -ExecutionPolicy Bypass -File instalar-servicio-windows.ps1
$ErrorActionPreference = 'Stop'
$dir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw 'Falta Node.js 22 o superior (https://nodejs.org). Instálalo y vuelve a ejecutar.' }
$v = (& $node -v).TrimStart('v').Split('.')
if ([int]$v[0] -lt 22 -or ([int]$v[0] -eq 22 -and [int]$v[1] -lt 13)) { throw "Node.js $(& $node -v) es antiguo: se requiere 22.13 o superior." }
$accion   = New-ScheduledTaskAction -Execute $node -Argument "`"$dir\servidor.js`"" -WorkingDirectory $dir
$inicio   = New-ScheduledTaskTrigger -AtStartup
$ajustes  = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0) -StartWhenAvailable
$cuenta   = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'Plataforma de cotizaciones' -Action $accion -Trigger $inicio -Settings $ajustes -Principal $cuenta -Force | Out-Null
$puerto = 8080; if (Test-Path "$dir\config.json") { $c = Get-Content "$dir\config.json" -Raw | ConvertFrom-Json; if ($c.puerto) { $puerto = $c.puerto } }
New-NetFirewallRule -DisplayName "Plataforma de cotizaciones ($puerto)" -Direction Inbound -Protocol TCP -LocalPort $puerto -Action Allow -Profile Domain,Private -ErrorAction SilentlyContinue | Out-Null
Start-ScheduledTask -TaskName 'Plataforma de cotizaciones'
Write-Host "Listo. La plataforma arranca sola con Windows. Abre http://$env:COMPUTERNAME`:$puerto desde cualquier PC de la red."
