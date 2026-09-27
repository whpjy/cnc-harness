param([int]$Port = 3081)

. (Join-Path $PSScriptRoot 'web-common.ps1')
$paths = Get-CncWebPaths -Port $Port
$processIds = @()

if (Test-Path -LiteralPath $paths.State) {
  $state = Get-Content -LiteralPath $paths.State -Raw | ConvertFrom-Json
  $processIds += [int]$state.supervisorPid
  $processIds += [int]$state.childPid
}
$listener = Get-CncWebListener -Port $Port
if ($listener) { $processIds += [int]$listener.OwningProcess }

$processIds | Select-Object -Unique | ForEach-Object {
  if (Test-ProcessId -ProcessId $_) {
    Stop-CncProcessTree -RootProcessId $_
    Write-Output "Stopped PID $_."
  }
}

Remove-Item -LiteralPath $paths.State -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $paths.SupervisorPid -Force -ErrorAction SilentlyContinue
if (-not $processIds) { Write-Output "No Harness process was found on port $Port." }
