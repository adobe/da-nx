# Reference connectors and review lessons

Open the one closest to the new vendor's shape; don't read them all. Sources: `nx/blocks/loc/connectors/<name>/index.js`. Some live on feature branches or open PRs, so check `git branch -a` and `gh pr list` first.

## Which to imitate

| Vendor shape | Imitate | Where |
|---|---|---|
| Static key, instant machine translation or file-based jobs, proxy | **Lilt** (`connectors/lilt/`, PR #789; da-translate#16, da-etc#8) | feature branch `feat/lilt-translation-connector` |
| OAuth, TMS submissions, project picker, zip upload, custom attributes, cancel | **GlobalLink** (`connectors/globallink/`) | `main` |
| OAuth, jobs with human review, no cancel allowed | **Lionbridge** (`connectors/lionbridge/`) | `main` |
| Shared job per language set, per-locale cancel | **Smartling** (`connectors/smartling/`, its `cancelTranslation`) | `main` |
| Instant MT with per-language-pair endpoints | **DeepL** (`connectors/deepl/`, PR #746) | feature branch `deepl-translation-connector`; per-document ids, partial-failure handling |
| Empty stubs | `connectors/sample/index.js` | `main` (lint-ignored) |

Trados and GLaaS are older direct-to-vendor connectors; use them only for vendor-specific behavior.

## Per-connector notes

**Lilt**: key resolved server-side; `x-translate-env` header; `serviceOptions` with a static mode list (AI vs Verified); `toFileName` escapes underscores before flattening; `fileIds`, `translationIds` persisted as JSON `{ value }`; `TERMINAL_LANG_STATUSES = ['complete', 'cancelled']`; per-language errors rolled up into one `sendMessage`; early-return failures leave `lang.translation` untouched so the project is retryable; polls `isProcessing` for export readiness with a bounded loop. Known soft spot: the Verified path re-downloads one zip per language and matches entries with `endsWith(fileName)`; prefer exact-name matching.

**GlobalLink**: two-layer auth (IMS plus vendor token in `x-globallink-authorization`; origin in `x-globallink-origin`, validated by an allowlist in da-translate). One zip upload via `fflate` with `extractArchive=true`. Vendor may split a zip into several submissions, so `submissionIds` and a `documentIds` map are persisted as JSON `{ value }`. Target lists paginate (`pageSize` ≤ 200). `getStatusAll` skips terminal languages. `markTargetsDelivered` runs only after confirmed saves. `customAttributes` come from `translation.service.custom.*`. `cancelTranslation` is implemented. Open caveat: the zip is built synchronously on the main thread.

**Lionbridge**: direct to vendor with a da-etc OAuth login. Persists a connector GUID in `.da/translate.json`. `jobName` is truncated to 250 bytes. Calls `approve` only after `url.status === 'success'`. No `cancelTranslation` by vendor guideline. Own `RETRY_CONFIG` (429/503). Groups status by `translation.jobId`. Its `statusFor` emits `canceled` (one l), which the host doesn't treat as terminal; don't copy.

**Smartling**: one job shared by many locales; its `cancelTranslation` removes the locale only. Direct-to-vendor, pre-proxy.

**DeepL** (open PR): the review asked for these changes: don't poll for 30 s inside `sendAllLanguages` and then mark `error`; set `created` and let `getStatusAll` finish it. Don't reimplement `downloadQueue`. Download needs the `/result` suffix. Resolve language codes from the live languages endpoint plus variant hints (`EN-US`, `PT-BR`, `ZH-HANS`) rather than a hardcoded table.

## Shared utilities (reuse, don't fork)

- `utils/fetchWithRetry.js`: `fetchWithRetry(url, opts, { maxRetries, baseDelayMs, maxDelayMs, isRetryable, onUnauthorized })`.
- `utils/downloadQueue.js`: `downloadQueue(urls, cb, concurrency = 5)`; sets `inProgress`; resolves when every url has a truthy `status`.
- `utils/auth.js`: `getAccessToken`, `login`, `checkConnection`, `imsAccessToken`, `imsAuthHeader`, `hasImsSession`; cached tokens in `sessionStorage`, five-minute buffer.
- `utils/steps.js`: terminal-status handling.
- `../../dnt/dnt.js`: `addDnt`, `removeDnt`.
- `nx2/deps/fflate`: zip/unzip, already bundled.

## Review lessons by theme

Each of these cost a review round on a real PR.

**Pagination and API fidelity**
- Every list endpoint is paginated until proven otherwise. Verify the param names against the real API: Trados ignored `offset/limit` silently and needed `skip/top`.
- Read the schema, then run against the vendor's staging API. Mock-only tests hid wrong paths and wrong enum values.
- Don't discard return values of readiness checks (`waitForSubmissionReady` returned a boolean the caller ignored).

**Identity and matching**
- Never match results to sources by substring (`ba.html` vs `a.html`). Persist an identifier map at upload time.
- Escape the separator before flattening paths into upload names; reject duplicate flattened names.
- Persist ids per language / per submission through `saveState`; the shared `service` is not durable.

**Status and state**
- Skip `complete` and `cancelled` in `getStatusAll`.
- Group by job id; dependent languages create multiple jobs per project.
- Use `options['source.language'].code` for the source code, not `en-US`.
- Either persist `error` on every early-return branch or deliberately leave `lang.translation` untouched. A branch that does neither strands the UI.
- Don't clear an error with a trailing `sendMessage()`.
- Don't mark a language `error` for slow-but-healthy jobs; time-outs are `in progress`.
- When new statuses appear, add status pill/style entries.

**Side effects**
- Approve/mark-delivered only after confirmed saves; surface failures from those calls.
- Check `url.status === 'success'` after `saveFn`.

**Security**
- No secrets in `localStorage`; use `sessionStorage` through `utils/auth.js`.
- Always proxy through da-translate for new connectors; `Authorization` is reserved for IMS.
- Validate caller-supplied upstream origins against an allowlist; never log keyed URLs.

**Code quality**
- Use `nx2/utils/api.js` helpers (`source.get/save`), not hand-rolled `daFetch`.
- Don't mutate shared exported option objects (`BASE_OPTS.headers`).
- Avoid large synchronous work on the main thread (zip building).
- Guard `onUnauthorized` against a missing auth context.
- Comments: one concise line, only for non-obvious constraints. JSDoc on every new function.

**Host-side issues found alongside connectors**
- Saves of `mergeUrls` and the project-save queue raced; fixed in `loc.js` `mergeProjectUrls` and the `handleSave` queue.
- A failed save was displaying a stale message (PR #821). If your connector surfaces errors oddly, look at the host before hacking around it.

**Tests reviewers asked for**
- More urls than the concurrency cap (six or more).
- More targets than one page.
- Config mapping (`customAttributes`).
- Every non-2xx branch.
- No reliance on test order: seed module state in each test.
