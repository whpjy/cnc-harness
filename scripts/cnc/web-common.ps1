$ErrorActionPreference = 'Stop'

function Get-CncWebPaths {
  param(
    [int]$Port = 3081,
    [string]$DshHome = (Join-Path $env:USERPROFILE '.dsh')
  )

  $repository = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
  $runDirectory = Join-Path $repository '.dsh\run'
  $backupDirectory = Join-Path $DshHome 'backups\cnc-web'
  [pscustomobject]@{
    Repository = $repository
    RunDirectory = $runDirectory
    BackupDirectory = $backupDirectory
    DshHome = [System.IO.Path]::GetFullPath($DshHome)
    Overlay = Join-Path $PSScriptRoot 'qwen-cnc.patch.yml'
    State = Join-Path $runDirectory "cnc-web-$Port.state.json"
    SupervisorPid = Join-Path $runDirectory "cnc-web-$Port.supervisor.pid"
    Port = $Port
  }
}

function Test-CncWebHttp {
  param([int]$Port)

  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5
    return $response.StatusCode -lt 500
  } catch {
    if ($_.Exception.Response) {
      return [int]$_.Exception.Response.StatusCode -lt 500
    }
    return $false
  }
}

function Get-CncWebListener {
  param([int]$Port)
  Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

function Test-ProcessId {
  param([Nullable[int]]$ProcessId)
  if (-not $ProcessId) { return $false }
  return $null -ne (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
}

function Stop-CncProcessTree {
  param([int]$RootProcessId)

  $children = Get-CimInstance Win32_Process -Filter "ParentProcessId = $RootProcessId" -ErrorAction SilentlyContinue
  foreach ($child in $children) {
    Stop-CncProcessTree -RootProcessId $child.ProcessId
  }
  Stop-Process -Id $RootProcessId -Force -ErrorAction SilentlyContinue
}

function Test-CncHarnessProcess {
  param(
    [int]$ProcessId,
    [int]$Port
  )

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction SilentlyContinue
  if (-not $process) { return $false }
  return $process.CommandLine -match 'apps/cli/src/bin\.ts' -and $process.CommandLine -match "--port[`"' ]+$Port(?:[`"' ]|$)"
}
