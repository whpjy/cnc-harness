param(
  [int]$Port = 3081,
  [string]$DshHome = (Join-Path $env:USERPROFILE '.dsh'),
  [switch]$Replace,
  [switch]$Repair
)

. (Join-Path $PSScriptRoot 'web-common.ps1')
$paths = Get-CncWebPaths -Port $Port -DshHome $DshHome

$requiredPaths = @(
  (Join-Path $paths.Repository 'node_modules\tsx'),
  (Join-Path $paths.Repository 'apps\cli\src\bin.ts'),
  (Join-Path $paths.DshHome 'profiles\web\cordis.yml'),
  (Join-Path $paths.DshHome '.credentials.yaml'),
  $paths.Overlay
)
foreach ($requiredPath in $requiredPaths) {
  if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Required Harness path is missing: $requiredPath" }
}

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 22) { throw "Node 22 or newer is required; found $(node --version)." }

$credentialDocument = Get-Content -LiteralPath (Join-Path $paths.DshHome '.credentials.yaml') -Raw
if ($credentialDocument -notmatch '(?m)^\s{2}DASHSCOPE_API_KEY:') {
  throw 'DASHSCOPE_API_KEY is absent from the persistent Harness credential store. Save it from the Models page before starting.'
}

$listener = Get-CncWebListener -Port $Port
if ($listener) {
  if (-not $Replace) {
    $supervised = $false
    $ownedOrphan = $false
    if (Test-Path -LiteralPath $paths.State) {
      $existingState = Get-Content -LiteralPath $paths.State -Raw | ConvertFrom-Json
      $supervised = Test-ProcessId -ProcessId ([int]$existingState.supervisorPid)
      $ownedOrphan = (
        -not $supervised -and
        [int]$existingState.childPid -eq [int]$listener.OwningProcess -and
        (Test-CncHarnessProcess -ProcessId ([int]$listener.OwningProcess) -Port $Port)
      )
    }
    if ($supervised -and (Test-CncWebHttp -Port $Port)) {
      Write-Output "Harness is already healthy at http://127.0.0.1:$Port/ (PID $($listener.OwningProcess))."
      exit 0
    }
    if (-not ($Repair -and $ownedOrphan)) {
      throw "Port $Port is occupied by an unmanaged process (PID $($listener.OwningProcess)). Re-run with -Replace after checking that process."
    }
  }
  Stop-CncProcessTree -RootProcessId $listener.OwningProcess
  Start-Sleep -Seconds 2
}

New-Item -ItemType Directory -Path $paths.RunDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $paths.BackupDirectory -Force | Out-Null
$backupStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $paths.BackupDirectory $backupStamp
New-Item -ItemType Directory -Path $backupRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $paths.DshHome 'profiles\web\cordis.patch.yml') -Destination $backupRoot -ErrorAction SilentlyContinue
Copy-Item -LiteralPath (Join-Path $paths.DshHome '.credentials.yaml') -Destination $backupRoot

$supervisorLog = Join-Path $paths.RunDirectory "cnc-web-$Port-supervisor.log"
$supervisorErrorLog = Join-Path $paths.RunDirectory "cnc-web-$Port-supervisor.err.log"
$process = Start-Process -FilePath 'powershell.exe' `
  -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'web-supervisor.ps1'), '-Port', [string]$Port, '-DshHome', $paths.DshHome) `
  -WorkingDirectory $paths.Repository `
  -RedirectStandardOutput $supervisorLog `
  -RedirectStandardError $supervisorErrorLog `
  -WindowStyle Hidden `
  -PassThru

$deadline = (Get-Date).AddSeconds(60)
do {
  Start-Sleep -Seconds 2
  if ($process.HasExited) {
    $detail = if (Test-Path -LiteralPath $supervisorErrorLog) { Get-Content -LiteralPath $supervisorErrorLog -Raw } else { '' }
    throw "Harness supervisor exited during startup. $detail"
  }
  if (Test-CncWebHttp -Port $Port) {
    Write-Output "Harness is healthy at http://127.0.0.1:$Port/."
    Write-Output "Supervisor PID: $($process.Id)"
    Write-Output "Persistent configuration: $($paths.DshHome)"
    Write-Output "Configuration backup: $backupRoot"
    Write-Output "Runtime state: $($paths.State)"
    exit 0
  }
} while ((Get-Date) -lt $deadline)

throw "Harness did not become healthy within 60 seconds. Review $supervisorErrorLog."
