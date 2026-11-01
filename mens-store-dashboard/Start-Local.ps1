$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$localNode = Join-Path $appRoot '.local/runtime/node_modules/node/bin/node.exe'
if (!(Test-Path -LiteralPath $localNode)) { throw 'Local runtime is missing. Run the local setup first.' }
& $localNode (Join-Path $appRoot '.local/manage-db.mjs') start
if ($LASTEXITCODE -ne 0) { throw 'Could not start local PostgreSQL.' }
$processes = @()
foreach ($service in @(
  @{ Name = 'api'; Port = 3000; Args = @('--env-file=.env', '--import', 'tsx', 'apps/api/src/main.ts') },
  @{ Name = 'web'; Port = 5173; Args = @('node_modules/vite/bin/vite.js', 'apps/web', '--config', 'apps/web/vite.config.ts', '--host', '127.0.0.1', '--port', '5173', '--strictPort') }
)) {
  if (Test-NetConnection -ComputerName 127.0.0.1 -Port $service.Port -InformationLevel Quiet -WarningAction SilentlyContinue) { continue }
  $process = Start-Process -FilePath $localNode -ArgumentList $service.Args -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $appRoot ".local/$($service.Name).log") -RedirectStandardError (Join-Path $appRoot ".local/$($service.Name).error.log")
  $processes += @{ Name = $service.Name; Id = $process.Id }
}
if ($processes.Count) { $processes | ConvertTo-Json -AsArray | Set-Content -LiteralPath (Join-Path $appRoot '.local/processes.json') }
foreach ($serviceUrl in @('http://127.0.0.1:3000/api/v1/health', 'http://127.0.0.1:5173/')) {
  $serviceReady = $false
  for ($serviceAttempt = 0; $serviceAttempt -lt 20; $serviceAttempt++) {
    try {
      $serviceResponse = Invoke-WebRequest -Uri $serviceUrl -UseBasicParsing -TimeoutSec 1
      if ($serviceResponse.StatusCode -eq 200) { $serviceReady = $true; break }
    } catch { Start-Sleep -Milliseconds 250 }
  }
  if (!$serviceReady) { throw "Local service did not become ready: $serviceUrl. Inspect .local service logs." }
}
Write-Host 'AhmedStore: http://localhost:5173'
Write-Host 'Local login: .local/credentials.json'
