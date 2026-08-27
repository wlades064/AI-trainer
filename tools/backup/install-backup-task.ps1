param(
  [ValidatePattern('^(?:[01]\d|2[0-3]):[0-5]\d$')][string]$DailyAt = '03:30',
  [string]$TaskName = 'AI-тренер D1 Backup'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$cycleScript = Join-Path $PSScriptRoot 'run-backup-cycle.ps1'
if (-not (Test-Path -LiteralPath $cycleScript -PathType Leaf)) { throw 'Сценарий резервирования не найден.' }
$powershell = Join-Path $PSHOME 'powershell.exe'
if (-not (Test-Path -LiteralPath $powershell -PathType Leaf)) { $powershell = (Get-Command powershell.exe).Source }

$parts = $DailyAt.Split(':')
$at = [DateTime]::Today.AddHours([int]$parts[0]).AddMinutes([int]$parts[1])
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$cycleScript`""
$action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At $at
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Зашифрованная копия Cloudflare D1 AI-тренера с пробным восстановлением; хранится 30 проверенных архивов.' -Force | Out-Null
Write-Output "Задание «$TaskName» установлено: ежедневно в $DailyAt, с запуском при первой возможности после пропуска."
