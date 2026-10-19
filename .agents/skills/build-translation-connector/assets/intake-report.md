# Connector intake: <Vendor>

Date: <YYYY-MM-DD>   Requested by: <name>   API docs: <url>   Schema (OpenAPI/Postman): <url or "none found">
Sandbox/staging account: <yes/no, how credentials are shared>

## 1. aem.live requirements (https://www.aem.live/docs/ew/administering/translation-service-connection)

| # | Requirement | Pass / Fail / Unknown | Evidence (link or quote) |
|---|---|---|---|
| 1 | Cloud-hosted, public HTTPS | | |
| 2 | Documented REST API; status and downloads reflect human review | | |
| 3 | Non-interactive auth (OAuth client credentials / API key); no SSO/MFA | | |
| 4 | Standard locale codes; source language per request | | |
| 5 | Rate limits tolerate bursts (429/5xx retry; 5 concurrent downloads) | | |
| 6 | Stable ids per uploaded file and per translated output | | |
| 7 | Terminal states: finished, failed, canceled | | |
| 8 | HTML round-trip; honors `translate="no"` | | |
| 9 | CORS (if no, proxy is required; the proxy is the default anyway) | | |

## 2. Operation map

| Operation | Vendor endpoint | Identifier returned | Notes |
|---|---|---|---|
| Create project/job (title, source, targets) | | | |
| Upload file | | | name/size/char limits: |
| Start/submit | | | |
| Status (per language, per file) | | | pagination params: |
| List/download translated files | | | id of output vs source: |
| Cancel (optional) | | | allowed by vendor guidelines? |
| List projects/workflows/templates (optional) | | | → `serviceOptions` |

## 3. Vendor state → host status

| Vendor state | Host status (`created / in progress / translated / error / cancelled`) |
|---|---|
| | |

What "done" means (translated vs reviewed vs approved vs delivered): 
Mandatory custom fields / metadata: 

## 4. Plan

- Verdict: Go / Go with proxy / No-go
- Auth archetype: A (token exchange) / B (static key); upstream origin: fixed / per tenant (allowlist)
- Persisted state (project, language, url): 
- Config keys admins set (translate config vs credential sheet): 
- `serviceOptions`: 
- `cancelTranslation`: yes / no (why)
- Language-code mapping: 
- Risks and open questions: 
