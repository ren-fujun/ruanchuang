# push.ps1 - one-command commit + push for this repository.
# Usage: .\push.cmd "your commit message"
#        .\push.cmd                 (uses a timestamp message)
#        .\push.cmd "msg" -NoPush   (commit only, skip push)
#
# Run it through push.cmd: this machine has PowerShell execution policy = Restricted,
# which blocks .ps1 files. push.cmd supplies -ExecutionPolicy Bypass for us.

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Message = '',
  [switch]$NoPush,
  [int]$Retries = 3
)

# NOTE: git writes its normal progress output to stderr. With
# $ErrorActionPreference='Stop' PowerShell turns that into a terminating error and
# would kill this script mid-push, so we deliberately stay on 'Continue' and judge
# every git call by $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $PSScriptRoot
$env:GIT_TERMINAL_PROMPT = '0'

function Write-Step($text) { Write-Host "`n>> $text" -ForegroundColor Cyan }
function Write-Ok($text)   { Write-Host "   $text" -ForegroundColor Green }
function Write-Warn2($text){ Write-Host "   $text" -ForegroundColor Yellow }
function Write-Err2($text) { Write-Host "   $text" -ForegroundColor Red }

# ---------- 0. sanity checks ----------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Err2 'git was not found on PATH.'
  exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.git'))) {
  Write-Err2 "Not a git repository: $PSScriptRoot"
  exit 1
}

# Do NOT pipe this through Select-Object: piping into a cmdlet overwrites
# $LASTEXITCODE (it becomes -1 even on success), which made this check always fail.
$branch = git rev-parse --abbrev-ref HEAD
$branchExit = $LASTEXITCODE
if ($branchExit -ne 0 -or [string]::IsNullOrWhiteSpace($branch) -or $branch -eq 'HEAD') {
  Write-Err2 'Cannot determine the current branch (detached HEAD?).'
  exit 1
}
$branch = "$branch".Trim()

Write-Step "Repository: $PSScriptRoot"
Write-Ok "Branch: $branch"

# ---------- 1. stage everything ----------
Write-Step 'Staging changes (git add -A)'
git add -A
if ($LASTEXITCODE -ne 0) { Write-Err2 'git add failed.'; exit 1 }

# ---------- 2. safety net: catch staged secrets ----------
$stagedFiles = @(git diff --cached --name-only)
if ($stagedFiles.Count -gt 0) {
  $secretHits = @()
  foreach ($f in $stagedFiles) {
    if ($f -match '\.env' -and (Test-Path -LiteralPath (Join-Path $PSScriptRoot $f))) {
      $hit = Select-String -LiteralPath (Join-Path $PSScriptRoot $f) -Pattern 'sk-[A-Za-z0-9_\-]{12,}' -ErrorAction SilentlyContinue
      if ($hit) { $secretHits += $f }
    }
  }
  if ($secretHits.Count -gt 0) {
    Write-Warn2 'WARNING: staged env file(s) appear to contain a real API key:'
    $secretHits | ForEach-Object { Write-Warn2 "     $_" }
    $answer = Read-Host '   Continue and commit anyway? (y/N)'
    if ($answer -ne 'y' -and $answer -ne 'Y') {
      Write-Warn2 'Aborted. Nothing was committed.'
      exit 1
    }
  }

  # ---------- 3. commit ----------
  if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = 'update: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm')
    Write-Warn2 "No message given, using: $Message"
  }
  Write-Step "Committing $($stagedFiles.Count) file(s)"
  git commit -m $Message
  if ($LASTEXITCODE -ne 0) { Write-Err2 'git commit failed.'; exit 1 }
  Write-Ok "Committed: $Message"
} else {
  Write-Step 'Nothing to commit - working tree is clean'
}

if ($NoPush) {
  Write-Step 'Done (-NoPush: skipped push)'
  exit 0
}

# ---------- 4. push, with retries ----------
Write-Step "Pushing to origin/$branch"
$pushed = $false
for ($i = 1; $i -le $Retries; $i++) {
  Write-Host "   attempt $i/$Retries ..."
  git push origin $branch
  if ($LASTEXITCODE -eq 0) { $pushed = $true; break }
  if ($i -lt $Retries) { Start-Sleep -Seconds 2 }
}

if (-not $pushed) {
  Write-Err2 'Push failed after all attempts. Common causes:'
  Write-Err2 '  - no network / GitHub unreachable'
  Write-Err2 "  - remote has commits you do not have -> run:  git pull --rebase origin $branch"
  Write-Err2 '  - SSH key not loaded or removed from GitHub'
  exit 1
}

Write-Host ''
Write-Host '==========================================' -ForegroundColor Green
Write-Host " Pushed successfully to origin/$branch" -ForegroundColor Green
Write-Host '==========================================' -ForegroundColor Green
git log --oneline -3
exit 0
