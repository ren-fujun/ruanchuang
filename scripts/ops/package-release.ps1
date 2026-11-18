param(
  [string]$Tag = (Get-Date -Format 'yyyyMMdd-HHmmss'),
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repo

if (-not $SkipBuild) {
  npm.cmd run typecheck
  npm.cmd run build:portals
}

node scripts\ops\package-release.mjs $Tag

$releaseDir = Join-Path $repo "release\$Tag"
$archive = Join-Path $repo "release\zhihui-$Tag.zip"
if (Test-Path -LiteralPath $archive) {
  throw "发布压缩包已存在：$archive"
}

Compress-Archive -Path (Join-Path $releaseDir '*') -DestinationPath $archive -CompressionLevel Optimal
Write-Host "发布压缩包：$archive"
