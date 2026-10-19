# Vendor requirements (feasibility checklist)

Source: https://www.aem.live/docs/ew/administering/translation-service-connection (sections "Connector requests" and "Implement your own connector"). Re-fetch it before every intake; this file is a working summary, not the source of truth.

## Go/no-go requirements

All must hold. Record evidence (doc link or quote) for each in the intake report.

1. **Cloud-hosted, public HTTPS.** No self-hosted, on-prem, VPN-only or IP-allowlisted instances. (Per-tenant cloud hostnames are fine; GlobalLink's `endpoint` is one.)
2. **Documented REST API** covering: create project, upload source files, start it, read status, download results. Translators and reviewers may work in the vendor's tools in between, but **status must reflect that work** and **downloads must return the latest reviewed content**.
3. **Non-interactive auth.** OAuth 2.0 client credentials, API key or token. No per-user logins, SSO prompts or MFA challenges. Credentials stay server-side and are exchanged for a token on the user's behalf.
4. **Standard language/locale codes** (for example `fr-FR`) and a **defined source language per request**. If the vendor uses its own codes (DeepL's `EN-US`, `ZH-HANS`), plan a mapping function and prefer resolving against the vendor's live supported-language list over a hardcoded table.
5. **Rate limits tolerate bursts.** Connectors retry `429` and `5xx` with exponential backoff and download up to **five files at a time**.
6. **Stable identifiers** for each uploaded file and each translated output, so a translation maps back to its source page.
7. **Clear terminal states** for finished, failed and canceled work.
8. **HTML in, HTML out.** The service must preserve markup and treat `translate="no"` as untranslatable. (DNT markers come from `addDnt`/`removeDnt` in `nx/blocks/loc/dnt`; confirm the vendor round-trips them.)

CORS is not a no-go. If the vendor blocks cross-origin requests, calls go through the proxy. New connectors use the proxy anyway; see [auth-and-proxy.md](auth-and-proxy.md).

## Operations the API must support

| Operation | Needed for | Required |
|---|---|---|
| Create project/job/submission with title, source language, ≥1 target languages | Sending | Yes |
| Upload HTML source files, each with a name or path, and get back an ID per file | Sending | Yes |
| Start or submit for translation | Sending | Yes |
| Read status per target language and per file/task | Status checks | Yes |
| List translated files and download each as HTML | Saving results | Yes |
| Cancel a project, language or file | Cancel action | Optional |
| List projects, workflows, templates | Options-step dropdowns (`serviceOptions`) | Optional |

If a required operation is missing, ask whether the vendor can add it or whether a documented workaround exists. If the workaround means the connector guesses (fuzzy file-name matching, polling a different resource that merely correlates), say No-go or flag it as high risk.

## Questions the API docs usually don't answer

Ask the user, or test in the sandbox, before planning:

- What does the vendor call "translated" vs "reviewed" vs "approved" vs "delivered"? Which one means the download is final?
- Does the status endpoint report per language, per file, or per job? Are completed items reported forever?
- Is the upload synchronous? Is there a "ready/processed" state to wait for before starting?
- Is there a per-submission file limit (GlobalLink silently splits uploads across submissions)?
- Are there mandatory custom fields or metadata (GlobalLink `customAttributes`, Lionbridge `providerId`)? These become `translation.service.custom.*` options or config keys.
- Max file size, name length (Lionbridge: 250 bytes), allowed characters, and whether `.json` sheets are accepted.
- Does the vendor allow connector-initiated cancel or delete? (Lionbridge forbids it; the connector must omit `cancelTranslation`.)
- Are there vendor developer guidelines or a certification process? Follow them (Lionbridge's retry and naming rules shaped its connector).
- Does one environment map to sandbox and another to production (`translation.service.all.env`: `stage, prod`)?

## Verdict values

- **Go**: browser can call the vendor directly. Rare; still prefer the proxy.
- **Go with proxy**: the standard outcome. Adobe adds the da-translate service and da-etc login.
- **No-go**: list the failing requirements, and what the vendor would have to change.
