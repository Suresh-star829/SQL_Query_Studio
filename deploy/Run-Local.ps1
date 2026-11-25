# Local smoke test only. For production, use a Windows service and IIS HTTPS binding.
$ErrorActionPreference = "Stop"
$AppPath = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $AppPath ".venv\Scripts\python.exe"
if (!(Test-Path $Python)) { throw "Run Install-App.ps1 first." }
Set-Location $AppPath
& $Python -m waitress --listen=127.0.0.1:8000 --threads=8 --connection-limit=100 app:app
