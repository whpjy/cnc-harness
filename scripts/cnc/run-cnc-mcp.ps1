$ErrorActionPreference = 'Stop'

$candidates = @()
if ($env:CNC_MCP_PYTHON) { $candidates += $env:CNC_MCP_PYTHON }
$candidates += 'D:\anaconda\python.exe'
$candidates += 'C:\Users\wanghang\AppData\Local\Programs\Python\Python314\python.exe'

$python = $null
foreach ($candidate in $candidates | Select-Object -Unique) {
  if (-not (Test-Path -LiteralPath $candidate)) { continue }
  & $candidate -c 'import mcp; import app.cnc_mcp' 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) {
    $python = $candidate
    break
  }
}

if (-not $python) {
  [Console]::Error.WriteLine('No Python interpreter can import mcp and app.cnc_mcp. Set CNC_MCP_PYTHON to a compatible interpreter.')
  exit 1
}

& $python -m app.cnc_mcp
exit $LASTEXITCODE
