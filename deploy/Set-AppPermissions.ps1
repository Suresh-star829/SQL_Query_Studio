[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$AppPath,
  [Parameter(Mandatory=$true)][string]$ServiceIdentity
)
$ErrorActionPreference = "Stop"
$AppPath = [System.IO.Path]::GetFullPath($AppPath)
$logs = Join-Path $AppPath "logs"
New-Item -ItemType Directory -Force -Path $logs | Out-Null
# Restrict the app tree; preserve SYSTEM and local Administrators, grant service read/execute.
icacls $AppPath /inheritance:r | Out-Null
icacls $AppPath /grant:r "SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "${ServiceIdentity}:(OI)(CI)RX" | Out-Null
# Logs need modify; .env is explicitly restricted to service identity and admins.
icacls $logs /grant:r "${ServiceIdentity}:(OI)(CI)M" | Out-Null
icacls (Join-Path $AppPath ".env") /inheritance:r | Out-Null
icacls (Join-Path $AppPath ".env") /grant:r "SYSTEM:F" "BUILTIN\Administrators:F" "${ServiceIdentity}:R" | Out-Null
Write-Host "ACLs applied. Verify them with icacls and ensure the service identity can read .env and write logs."
