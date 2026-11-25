param(
  [switch]$Reset
)

$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repo

$demoDir = Join-Path $repo '.tmp\local-trial-demo'
$dataFile = Join-Path $demoDir 'store.json'
if ($Reset -and (Test-Path -LiteralPath $dataFile)) {
  $resolved = (Resolve-Path -LiteralPath $dataFile).Path
  $expected = Join-Path $repo '.tmp\local-trial-demo'
  if (-not $resolved.StartsWith($expected, [StringComparison]::OrdinalIgnoreCase)) {
    throw "演示数据路径校验失败：$resolved"
  }
  Remove-Item -LiteralPath $resolved -Force
}
if (-not (Test-Path -LiteralPath $dataFile)) {
  node scripts\ops\create-trial-demo.mjs $dataFile
}
node scripts\ops\verify-trial-demo.mjs $dataFile

$env:ZHIHUI_DATA_FILE = $dataFile
$env:TRIAL_MODE = 'false'
$env:PORTAL_API_URL = 'http://127.0.0.1:8787'

Write-Host ''
Write-Host '本地试用演示入口：'
Write-Host '  学生端   http://127.0.0.1:5191'
Write-Host '  辅导员端 http://127.0.0.1:5192'
Write-Host '  后勤端   http://127.0.0.1:5194'
Write-Host '按 Ctrl+C 结束全部服务。'
Write-Host ''

npx.cmd --no-install concurrently `
  --kill-others-on-fail `
  --names API,STUDENT,COUNSELOR,LOGISTICS `
  --prefix-colors green,cyan,magenta,yellow `
  "node server/index.js" `
  "vite --config apps/student/vite.config.mjs" `
  "vite --config apps/counselor/vite.config.mjs" `
  "vite --config apps/logistics/vite.config.mjs"
