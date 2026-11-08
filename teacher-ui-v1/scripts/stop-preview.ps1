$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot '.runtime\preview.pid'
try {
    if (-not (Test-Path -LiteralPath $pidFile)) {
        Write-Host 'No background preview was started by this launcher.'
        exit 0
    }
    $previewProcessId = [int](Get-Content -LiteralPath $pidFile -Raw).Trim()
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $previewProcessId"
    $expectedEntry = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
    if ($process) {
        if ($process.Name -ne 'node.exe' -or -not $process.CommandLine.Contains($expectedEntry)) {
            throw 'The recorded PID belongs to another process. Nothing was stopped.'
        }
        Stop-Process -Id $previewProcessId
    }
    Remove-Item -LiteralPath $pidFile
    Write-Host 'Teacher workspace stopped.'
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
