$ErrorActionPreference = "Stop"
$AppPath = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $AppPath ".venv\Scripts\python.exe"
if (!(Test-Path $Python)) { throw "Missing .venv; run Install-App.ps1 first." }
Write-Host "Python:"
& $Python --version
Write-Host "`nODBC drivers:"
& $Python -c "import pyodbc; print('\n'.join(pyodbc.drivers()))"
Write-Host "`nRequired imports:"
& $Python -c "import flask, pyodbc, dotenv, google.genai, waitress; print('OK')"
if ($LASTEXITCODE -ne 0) { throw "One or more Python dependencies are missing." }
Write-Host "`nEnvironment check complete. SQL access must be tested while running as the final service identity."
