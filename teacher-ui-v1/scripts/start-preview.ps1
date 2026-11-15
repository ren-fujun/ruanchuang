param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$previewUrl = 'http://127.0.0.1:5180/'
$runtimeDir = Join-Path $projectRoot '.runtime'
$viteEntry = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'

function Test-PreviewReady {
    try {
        $response = Invoke-WebRequest -Uri $previewUrl -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200 -and $response.Content.Contains('content="zhihui-counselor"')
    } catch { return $false }
}

try {
    if (Test-PreviewReady) {
        Write-Host "Teacher workspace is already running: $previewUrl"
        if (-not $NoBrowser) { Start-Process $previewUrl }
        exit 0
    }
    $occupied = Get-NetTCPConnection -LocalPort 5180 -State Listen -ErrorAction SilentlyContinue
    if ($occupied) { throw 'Port 5180 is occupied by another application. Close that application and run start.cmd again.' }
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    if (-not (Test-Path -LiteralPath $viteEntry)) {
        Push-Location $projectRoot
        try {
            & npm.cmd ci
            if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check your network and run start.cmd again.' }
        } finally { Pop-Location }
    }
    New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
    $arguments = @(('"' + $viteEntry + '"'), '--host', '127.0.0.1', '--port', '5180', '--strictPort')
    $server = Start-Process -FilePath $nodePath -ArgumentList $arguments -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'preview.log') -RedirectStandardError (Join-Path $runtimeDir 'preview-error.log')
    Set-Content -LiteralPath (Join-Path $runtimeDir 'preview.pid') -Value $server.Id -Encoding ASCII
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-PreviewReady) {
            Write-Host "Teacher workspace is ready: $previewUrl"
            Write-Host 'The service keeps running in the background. Run stop.cmd to stop it.'
            if (-not $NoBrowser) { Start-Process $previewUrl }
            exit 0
        }
        $server.Refresh()
        if ($server.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    throw "Startup failed. Read the logs in $runtimeDir."
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
