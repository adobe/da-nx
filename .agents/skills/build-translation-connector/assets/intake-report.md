# Connector intake: <Vendor>

Date: <YYYY-MM-DD>   Requested by: <name>   API docs: <url>   Schema (OpenAPI/Postman): <url or "none found">
Sandbox/staging account: <yes/no, how credentials are shared>

## 1. aem.live requirements (https://www.aem.live/docs/ew/administering/translation-service-connection)

One row per requirement in the page's "Connector requests" section, copied fresh at intake time (the page changes).

| Requirement (as written on the page) | Pass / Fail / Unknown | Evidence (link or quote) |
|---|---|---|
| | | |

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

## 4. Decision log and live probe results

Every vendor-dependent decision needs evidence: a live call, the schema or developer docs, or the user's answer. No row may rest on an assumption.

| Decision | Choice | Evidence (live call + response / doc link / user answer) | Differs from docs? |
|---|---|---|---|
| | | | |

## 5. Plan

- Verdict: Go / Go with proxy / No-go
- Auth archetype: A (token exchange) / B (static key); upstream origin: fixed / per tenant (allowlist)
- Persisted state (project, language, url): 
- Config keys admins set (translate config vs credential sheet): 
- `serviceOptions`: 
- `cancelTranslation`: yes / no (why)
- Language-code mapping: 
- Risks and open questions: 
