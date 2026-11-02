param(
  [switch]$OpenBrowser,
  [switch]$CheckOnly,
  [ValidateRange(10, 600)]
  [int]$StartupTimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$localNode = Join-Path $appRoot '.local/runtime/node_modules/node/bin/node.exe'
foreach ($requiredFile in @($localNode, (Join-Path $appRoot '.local/manage-db.mjs'), (Join-Path $appRoot '.env'), (Join-Path $appRoot 'node_modules/vite/bin/vite.js'), (Join-Path $appRoot 'node_modules/tsx/package.json'))) {
  if (!(Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required local setup file is missing: $requiredFile. This launcher uses the existing installation on this device; see LOCAL-RUN.md."
  }
}
if ($CheckOnly) {
  Write-Host 'Local startup prerequisites are present. No services were started.'
  return
}
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
$processFile = Join-Path $appRoot '.local/processes.json'
if ($processes.Count) {
  $previousProcesses = @()
  if (Test-Path -LiteralPath $processFile) {
    $previousProcesses = @(Get-Content -LiteralPath $processFile -Raw | ConvertFrom-Json | Where-Object { $_.Name -in @('api','web') -and $_.Id -match '^\d+$' })
  }
  $startedNames = @($processes | ForEach-Object { $_.Name })
  $retainedProcesses = @($previousProcesses | Where-Object { $_.Name -notin $startedNames })
  $tracked = @()
  foreach ($entry in @($retainedProcesses) + @($processes)) { $tracked += [pscustomobject]@{ Name = [string]$entry.Name; Id = [int]$entry.Id } }
  foreach ($expected in @(@{Name='api';Port=3000},@{Name='web';Port=5173})) {
    if ($expected.Name -in @($tracked.Name)) { continue }
    $listener = Get-NetTCPConnection -LocalPort $expected.Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
      $owned = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
      if ($owned -and $owned.Path -eq $localNode) { $tracked += [pscustomobject]@{Name=$expected.Name;Id=$owned.Id} }
    }
  }
  ConvertTo-Json -InputObject $tracked -Depth 3 | Set-Content -LiteralPath $processFile
}
foreach ($serviceUrl in @('http://127.0.0.1:3000/api/v1/health', 'http://127.0.0.1:5173/')) {
  $serviceReady = $false
  Write-Host "Waiting for $serviceUrl ..."
  $startupTimer = [System.Diagnostics.Stopwatch]::StartNew()
  while ($startupTimer.Elapsed.TotalSeconds -lt $StartupTimeoutSeconds) {
    try {
      $serviceResponse = Invoke-WebRequest -Uri $serviceUrl -UseBasicParsing -TimeoutSec 1
      if ($serviceResponse.StatusCode -eq 200) { $serviceReady = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (!$serviceReady) { throw "Local service did not become ready: $serviceUrl. Inspect logs in $appRoot\.local (api.log, api.error.log, web.log, web.error.log)." }
}
Write-Host 'AhmedStore: http://localhost:5173'
Write-Host 'Local login: .local/credentials.json'
if ($OpenBrowser) { Start-Process 'http://localhost:5173' }
