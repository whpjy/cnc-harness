param([int]$Port = 3081)

. (Join-Path $PSScriptRoot 'web-common.ps1')
$paths = Get-CncWebPaths -Port $Port
$listener = Get-CncWebListener -Port $Port
$healthy = Test-CncWebHttp -Port $Port

Write-Output "URL: http://127.0.0.1:$Port/"
Write-Output "Healthy: $healthy"
Write-Output "Listener PID: $(if ($listener) { $listener.OwningProcess } else { 'none' })"
Write-Output "DSH_HOME: $($paths.DshHome)"
Write-Output "Qwen overlay: $($paths.Overlay)"
if (Test-Path -LiteralPath $paths.State) {
  Write-Output 'Supervisor state:'
  Get-Content -LiteralPath $paths.State
} else {
  Write-Output 'Supervisor state: unavailable'
}
