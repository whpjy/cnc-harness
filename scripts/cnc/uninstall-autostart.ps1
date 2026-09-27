param([string]$TaskName = 'DeepSeek-Harness-CNC-3081')

$ErrorActionPreference = 'Stop'
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Output "Removed scheduled task: $TaskName"
} else {
  Write-Output "Scheduled task is not installed: $TaskName"
}
