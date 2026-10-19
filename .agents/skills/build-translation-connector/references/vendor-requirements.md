# Vendor requirements (feasibility checklist)

Source: https://www.aem.live/docs/ew/administering/translation-service-connection (sections "Connector requests" and "Implement your own connector"). Fetch it fresh for every intake. This file holds only what the page doesn't: the operations a connector needs, open questions and verdict values.

## Go/no-go requirements

The aem.live page is the only source for the requirements. Do not copy them into this skill, the intake report or a PR.

1. Fetch the page and read the "Connector requests" section (and "Implement your own connector" for the connector interface).
2. List each requirement as written there in the intake report's requirements table, one row per requirement.
3. Mark each Pass, Fail or Unknown, with evidence (doc link or quote).
4. Any Fail means No-go.

Skill-specific notes for judging evidence. They add repo context and do not restate the requirements:

- Per-tenant cloud hostnames are fine (GlobalLink's `endpoint` is one).
- Vendor-specific locale codes (DeepL's `EN-US`, `ZH-HANS`) need a mapping function. Prefer the vendor's live supported-language list over a hardcoded table.
- Connectors retry and download concurrently through shared utils; check how the vendor's rate limits fit (see [connector-contract.md](connector-contract.md)).
- DNT markers come from `addDnt`/`removeDnt` in `nx/blocks/loc/dnt`. Confirm the vendor round-trips them.
- CORS is never a No-go. If the vendor blocks cross-origin requests, calls go through the proxy. New connectors use the proxy anyway; see [auth-and-proxy.md](auth-and-proxy.md).

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
