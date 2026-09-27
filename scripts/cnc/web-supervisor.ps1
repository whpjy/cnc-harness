param(
  [int]$Port = 3081,
  [string]$DshHome = (Join-Path $env:USERPROFILE '.dsh')
)

. (Join-Path $PSScriptRoot 'web-common.ps1')
$paths = Get-CncWebPaths -Port $Port -DshHome $DshHome
$mutex = [Threading.Mutex]::new($false, "Local\DeepSeekHarnessCncWeb$Port")
$ownsMutex = $false
$child = $null

try {
  $ownsMutex = $mutex.WaitOne(0)
  if (-not $ownsMutex) { throw "A CNC Harness supervisor already owns port $Port." }

  New-Item -ItemType Directory -Path $paths.RunDirectory -Force | Out-Null
  Set-Content -LiteralPath $paths.SupervisorPid -Value $PID -Encoding ascii
  $env:DSH_HOME = $paths.DshHome
  $failureCount = 0
  $restartDelaySeconds = 2

  while ($true) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $stdout = Join-Path $paths.RunDirectory "cnc-web-$Port-$stamp.out.log"
    $stderr = Join-Path $paths.RunDirectory "cnc-web-$Port-$stamp.err.log"
    $arguments = @(
      '--import', 'tsx/esm',
      'apps/cli/src/bin.ts',
      'web',
      '--patch', $paths.Overlay,
      '--no-open',
      '--host', '127.0.0.1',
      '--port', [string]$Port
    )

    $child = Start-Process -FilePath (Get-Command node).Source `
      -ArgumentList $arguments `
      -WorkingDirectory $paths.Repository `
      -RedirectStandardOutput $stdout `
      -RedirectStandardError $stderr `
      -WindowStyle Hidden `
      -PassThru

    [pscustomobject]@{
      supervisorPid = $PID
      childPid = $child.Id
      port = $Port
      dshHome = $paths.DshHome
      overlay = $paths.Overlay
      stdout = $stdout
      stderr = $stderr
      startedAt = (Get-Date).ToString('o')
    } | ConvertTo-Json | Set-Content -LiteralPath $paths.State -Encoding utf8

    $failureCount = 0
    while (-not $child.HasExited) {
      Start-Sleep -Seconds 10
      $child.Refresh()
      if ($child.HasExited) { break }
      if (Test-CncWebHttp -Port $Port) {
        $failureCount = 0
        $restartDelaySeconds = 2
      } else {
        $failureCount++
        if ($failureCount -ge 5) {
          Stop-CncProcessTree -RootProcessId $child.Id
          $child.WaitForExit(10000) | Out-Null
          break
        }
      }
    }

    Start-Sleep -Seconds $restartDelaySeconds
    $restartDelaySeconds = [Math]::Min($restartDelaySeconds * 2, 30)
  }
} finally {
  if ($child -and -not $child.HasExited) {
    Stop-CncProcessTree -RootProcessId $child.Id
  }
  Remove-Item -LiteralPath $paths.State -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $paths.SupervisorPid -Force -ErrorAction SilentlyContinue
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
