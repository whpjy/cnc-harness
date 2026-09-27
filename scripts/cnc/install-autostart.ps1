param(
  [int]$Port = 3081,
  [string]$TaskName = 'DeepSeek-Harness-CNC-3081'
)

$ErrorActionPreference = 'Stop'
$startScript = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'start-web.ps1')).Path
$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`" -Port $Port -Repair"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$triggers = @(
  (New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"),
  (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5))
)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $triggers `
  -Settings $settings `
  -Description 'Keeps the local CNC DeepSeek Harness Web service available on port 3081.' `
  -Force | Out-Null

Write-Output "Registered scheduled task: $TaskName"
Write-Output "Launcher: $startScript"
