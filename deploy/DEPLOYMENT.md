# Windows Server deployment guide — Integrated Windows Authentication

## Architecture

Browser -> IIS (HTTPS + Windows Authentication) -> Waitress on `127.0.0.1:8000` -> SQL Server using the Windows identity of the Waitress Windows service.

The app is intentionally bound to loopback. Do not expose port 8000 to the network. The IIS Windows Authentication setting authenticates users to the web front end; SQL connections use the **service account**, not automatically the browser user's identity. This avoids unintended Kerberos delegation/double-hop complexity.

## 1. Prepare the Windows server

1. Install a supported 64-bit Python version (Python 3.12 recommended) and Microsoft ODBC Driver 18 for SQL Server.
2. Copy this project to a stable path such as `C:\Apps\GeminiSqlCopilot`.
3. Open elevated PowerShell:
   ```powershell
   Set-ExecutionPolicy -Scope Process RemoteSigned
   .\deploy\Install-App.ps1 -AppPath 'C:\Apps\GeminiSqlCopilot'
   ```
   If the Python launcher differs, pass `-PythonExe` as appropriate.
4. Edit `C:\Apps\GeminiSqlCopilot\.env`. Use one-line valid JSON for `SQL_SERVERS_JSON`; specify actual SQL Server DNS names and aliases. Set a Gemini API key. Never commit `.env`.
5. Run `.\deploy\Check-Environment.ps1`.

## 2. Create a dedicated Active Directory service account

Ask your AD/Windows administrator to create a managed service account or dedicated domain account for this app, e.g. `DOMAIN\svc_gemini_sqlcopilot`. Prefer a gMSA where your service-management policy supports it. Do not run as Domain Admin, LocalSystem, or a personal employee account.

Grant that identity:
- `Log on as a service` on the web server (managed by policy where applicable)
- Read/execute access to the application and `.venv`
- Modify access only to the `logs` directory
- Network access to the SQL Server and required outbound access to the Gemini API

Do not grant it local administrator rights.

## 3. Grant least-privilege SQL access

On each target SQL Server, the DBA should create a login for the service identity and a database user. Example DBA-reviewed SQL (replace domain/account and database; repeat only for approved databases):

```sql
-- Run as a DBA on the target SQL Server.
USE [master];
CREATE LOGIN [DOMAIN\svc_gemini_sqlcopilot] FROM WINDOWS;
GO
USE [YourApprovedDatabase];
CREATE USER [DOMAIN\svc_gemini_sqlcopilot]
    FOR LOGIN [DOMAIN\svc_gemini_sqlcopilot];
GO
GRANT CONNECT TO [DOMAIN\svc_gemini_sqlcopilot];
GRANT SELECT TO [DOMAIN\svc_gemini_sqlcopilot];
GO
```

If database/table metadata discovery is needed, ensure the identity can view metadata for the approved tables. Prefer explicit `GRANT SELECT ON SCHEMA::[approved_schema]` rather than database-wide `GRANT SELECT` where practical. To list databases from `master`, grant only the minimum required metadata visibility; if policy requires, replace database discovery with a fixed allowlist in the application. Avoid `db_datareader` if it exposes more data than intended.

**Important:** the app's SQL text filter is not a security boundary. The SQL login's permissions are the real enforcement. SELECT statements can still be expensive or access sensitive rows; apply row-level security, approved views, query governance, and monitoring as needed.

## 4. Install as a Windows service

NSSM is a third-party service wrapper. Obtain it from its official project/source and validate the download according to your organization's software policy. Then run elevated PowerShell, for example:

```powershell
.\deploy\Install-Nssm-Service.ps1 `
  -AppPath 'C:\Apps\GeminiSqlCopilot' `
  -NssmExe 'C:\Tools\nssm\win64\nssm.exe'
```

Open `services.msc` -> **Gemini SQL Copilot** -> Properties -> **Log On**:
- Select **This account** and enter `DOMAIN\svc_gemini_sqlcopilot`, or configure the approved gMSA according to your organization's service tooling.
- For a normal domain account, set the password using the Windows service UI/approved secret workflow. Never put it in a script or source control.
- Apply, then start the service.

The service must run under the identity that has the SQL Server Windows login. Confirm the service is running and inspect `logs\stdout.log` / `logs\stderr.log`. Local smoke test:
`Invoke-RestMethod http://127.0.0.1:8000/health`

## 5. Put IIS in front (recommended)

Install IIS with:
- IIS Web Server
- Windows Authentication role service
- URL Rewrite module
- Application Request Routing (ARR), with proxy enabled

In IIS Manager:
1. Create a dedicated website and HTTPS binding with a valid TLS certificate.
2. Configure **Windows Authentication: Enabled**, **Anonymous Authentication: Disabled** for the site.
3. In ARR Server Proxy Settings, enable proxy.
4. Use the included `web.config.example` as a starting point in the IIS site root, after reviewing/replacing settings. Ensure the URL Rewrite rule proxies requests to `http://127.0.0.1:8000/{R:1}`.
5. Restrict inbound firewall access to HTTPS from your corporate network/VPN. Do not open port 8000.

Windows Authentication at IIS protects the site front end. It does not pass the end user's identity into SQL in this configuration; SQL uses the service account. If you need per-user SQL authorization, design Kerberos constrained delegation/impersonation with your AD/SQL administrators rather than assuming IIS auth does it automatically.

## 6. Update and restart

Stop the service, deploy reviewed code, install dependencies if requirements changed, confirm `.env` is preserved, then start service:
```powershell
Stop-Service GeminiSqlCopilot
# Deploy code while preserving .env and logs.
& 'C:\Apps\GeminiSqlCopilot\.venv\Scripts\python.exe' -m pip install -r 'C:\Apps\GeminiSqlCopilot\requirements.txt'
Start-Service GeminiSqlCopilot
```

## Production checklist

- HTTPS and Windows Authentication enabled in IIS.
- Anonymous access disabled.
- Waitress bound only to `127.0.0.1`.
- Service runs as a dedicated AD service identity, not an administrator.
- SQL identity has only approved SELECT permissions.
- `.env` readable only by administrators and the app service identity; no secrets in source control.
- Logs are ACL-restricted and rotated/collected according to policy.
- Gemini use is approved by your organization; prompts/schema are sent to Google's API.
- Test SQL execution safeguards; they are only a secondary filter.
- Add monitoring, backups, dependency patching, access review, rate limits, and application authentication/audit logging as required by your security policy.
