param(
  [Parameter(Mandatory=$true)][string]$SourceFile,
  [Parameter(Mandatory=$true)][string]$OutputFile
)
$ErrorActionPreference = 'Stop'
Write-Host '请先停止使用该数据文件的服务。此工具只生成新文件，不覆盖原文件。'
if ((Read-Host '输入 STOPPED 确认已停止服务') -cne 'STOPPED') { throw '未确认停止服务。' }
$adminId = Read-Host '管理员编号（字母、数字、下划线或短横线）'
$adminAccount = Read-Host '登录账号'
$adminName = Read-Host '管理员姓名'
$adminExpires = Read-Host '到期时间（例如 2027-01-01T00:00:00+08:00）'
$securePassword = Read-Host '临时密码（至少10字符，输入不回显）' -AsSecureString
$secureConfirm = Read-Host '再次输入临时密码' -AsSecureString
$passwordPtr = [IntPtr]::Zero
$confirmPtr = [IntPtr]::Zero
try {
  $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  $confirmPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureConfirm)
  $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
  $plainConfirm = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmPtr)
  if ($plainPassword -cne $plainConfirm) { throw '两次输入的密码不一致。' }
  $payload = @{id=$adminId;account=$adminAccount;name=$adminName;expiresAt=$adminExpires;password=$plainPassword} | ConvertTo-Json -Compress
  $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
  $entry = Join-Path $PSScriptRoot 'init-trial-admin.mjs'
  $payload | & node $entry $SourceFile $OutputFile
  if ($LASTEXITCODE -ne 0) { throw '管理员初始化未成功。' }
} finally {
  if ($passwordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr) }
  if ($confirmPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmPtr) }
  $plainPassword = $null; $plainConfirm = $null; $payload = $null
  $securePassword.Dispose(); $secureConfirm.Dispose()
}
