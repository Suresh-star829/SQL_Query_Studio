# Run elevated. NSSM must be obtained from its official project and extracted locally.
# This creates the service but deliberately does not set a service-account password.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$AppPath,
  [Parameter(Mandatory=$true)][string]$NssmExe,
  [string]$ServiceName = "GeminiSqlCopilot"
)
$ErrorActionPreference = "Stop"
$AppPath = [System.IO.Path]::GetFullPath($AppPath)
$NssmExe = [System.IO.Path]::GetFullPath($NssmExe)
$Python = Join-Path $AppPath ".venv\Scripts\python.exe"
if (!(Test-Path $Python)) { throw "Python venv not found. Run Install-App.ps1 first." }
if (!(Test-Path (Join-Path $AppPath ".env"))) { throw ".env missing. Configure it before installing service." }
if (!(Test-Path $NssmExe)) { throw "NSSM executable not found." }
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) { throw "Service $ServiceName already exists." }
& $NssmExe install $ServiceName $Python
if ($LASTEXITCODE -ne 0) { throw "NSSM service install failed." }
& $NssmExe set $ServiceName AppParameters "-m waitress --listen=127.0.0.1:8000 --threads=8 --connection-limit=100 app:app"
& $NssmExe set $ServiceName AppDirectory $AppPath
& $NssmExe set $ServiceName DisplayName "Gemini SQL Copilot"
& $NssmExe set $ServiceName Description "Internal Gemini-powered SQL Server assistant"
& $NssmExe set $ServiceName Start SERVICE_DELAYED_AUTO_START
& $NssmExe set $ServiceName AppStdout (Join-Path $AppPath "logs\stdout.log")
& $NssmExe set $ServiceName AppStderr (Join-Path $AppPath "logs\stderr.log")
& $NssmExe set $ServiceName AppRotateFiles 1
& $NssmExe set $ServiceName AppRotateOnline 1
& $NssmExe set $ServiceName AppRotateBytes 10485760
New-Item -ItemType Directory -Force -Path (Join-Path $AppPath "logs") | Out-Null
Write-Host "Service created. IMPORTANT: set Log On account in services.msc to a dedicated domain service account, then grant that identity SQL CONNECT and SELECT-only permissions."
Write-Host "Keep listener bound to 127.0.0.1. Put IIS with HTTPS and Windows Authentication in front of it."
Write-Host "Start after account and .env are configured: Start-Service $ServiceName"
