$ErrorActionPreference = 'Stop'
$processFile = Join-Path $PSScriptRoot '.local/processes.json'
if (Test-Path -LiteralPath $processFile) {
  foreach ($entry in (Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json)) {
    $runningProcess = Get-Process -Id $entry.Id -ErrorAction SilentlyContinue
    $expectedNode = Join-Path $PSScriptRoot '.local/runtime/node_modules/node/bin/node.exe'
    if ($runningProcess -and $runningProcess.Path -eq $expectedNode) { Stop-Process -Id $entry.Id }
  }
}
& (Join-Path $PSScriptRoot '.local/runtime/node_modules/node/bin/node.exe') (Join-Path $PSScriptRoot '.local/manage-db.mjs') stop
Write-Host 'Local app stopped. Demo data has been preserved.'
