# Run in an elevated PowerShell prompt on the Windows server.
# Installs Python dependencies in a dedicated virtual environment.
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$AppPath,
  [string]$PythonExe = "py"
)
$ErrorActionPreference = "Stop"
$AppPath = [System.IO.Path]::GetFullPath($AppPath)
if (!(Test-Path (Join-Path $AppPath "app.py"))) { throw "app.py not found in $AppPath" }
Push-Location $AppPath
try {
  & $PythonExe -3.12 -m venv (Join-Path $AppPath ".venv")
  if ($LASTEXITCODE -ne 0) { throw "Could not create virtual environment. Install Python 3.12 first or pass an appropriate Python launcher." }
  $pip = Join-Path $AppPath ".venv\Scripts\python.exe"
  & $pip -m pip install --upgrade pip
  if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }
  & $pip -m pip install -r (Join-Path $AppPath "requirements.txt")
  if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed" }
  if (!(Test-Path (Join-Path $AppPath ".env"))) {
    Copy-Item (Join-Path $AppPath "deploy\.env.production.example") (Join-Path $AppPath ".env")
    Write-Warning "Created .env from example. Edit it and set GEMINI_API_KEY, SQL server aliases, and real hostnames before starting the service."
  }
  Write-Host "Dependencies installed. Next configure .env and follow deploy\DEPLOYMENT.md."
}
finally { Pop-Location }
