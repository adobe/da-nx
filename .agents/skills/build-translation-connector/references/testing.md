# Testing

All three repos need tests. A connector PR without them gets blocked.

## da-nx (`test/loc/connectors/<name>/index.test.js`)

Runner: web-test-runner with `@esm-bundle/chai` (`describe/it/beforeEach/afterEach` globals, mocha UI).

```bash
npm run test:file -- test/loc/connectors/<name>/index.test.js
npm run lint
```

Start from [../assets/connector.test.js.tmpl](../assets/connector.test.js.tmpl). It mirrors `test/loc/connectors/globallink/index.test.js`:

- **Mock `window.fetch`** with `installFetch(handler)`; record `{ url, method, body, headers }` in `calls`; restore in `afterEach`. A `defaultHandler` routes by URL.
- **IMS**: `const imsPath = '../../../../nx2/utils/ims.js'; const { setMockIms, resetMockIms } = await import(imsPath);` The dynamic import path keeps `@web/dev-server-import-maps` from rewriting it. Call `resetMockIms()` (restores a default token) and `sessionStorage.clear()` in `beforeEach`; `setMockIms({ anonymous: true })` for the no-session case. The mock lives at `nx2/test/mocks/ims.js` and is wired through the import map in `web-test-runner.config.mjs`.
- **Proxy URL**: assert calls go to `${DA_TRANSLATE}/translate/<name>/${org}/${site}/…` (import `DA_TRANSLATE` from `nx2/utils/utils.js`).
- **da-etc**: `DA_ETC` is undefined in tests, so `utils/auth.js` falls back to `https://da-etc.adobeaem.workers.dev`. Archetype A mocks `/integrations/<name>/login`; B mocks `/integrations/<name>/status` returning `{ connected: true }`.
- `baseService(overrides)` returns `{ org, site, env, … }`. Seed module and sessionStorage state explicitly in each test; never depend on test order.
- Build `langs` and `urls` helpers: `urls` items with `daBasePath`, `ext: 'html'`, `content: '<p>hi</p>'`; `langs` with `code`, `name`, and optional `translation`.
- Keep tests fast: no real timers (stub `setTimeout`-based polls or make the poll interval injectable).

## Required test cases

Each of these has caught a real bug or been requested in review.

| Area | Cases |
|---|---|
| `isConnected` / `connect` | Connected, not connected, missing org/site, no IMS token |
| `sendAllLanguages` | Happy path: uploads, creates, sets `created`, `sent`, persists ids via `saveState`; uses `options['source.language'].code` and defaults when the option is absent; not connected → error message and no mutation; upload failure → **one** rolled-up error and `lang.translation` untouched; job-creation failure (error or response without an id) leaves lang retryable, with no `lang.translation` and no persisted ids; per-language submissions: only the languages that succeeded get `translation`; file-name flattening escapes underscores and rejects duplicates; more than five urls |
| `getStatusAll` | Each vendor state → host status; skips `complete`/`cancelled`; groups by job id for multi-job calls; **paginates** (more rows than one page; assert the real pagination param names); unknown state leaves status unchanged; non-2xx leaves state unchanged |
| `saveItems` | Downloads, calls `removeDnt`, calls `saveFn`; **six or more urls** (beyond the concurrency cap); a failed download sets `url.status = 'error'`; approve/delivered only after `url.status === 'success'`; failure of approve surfaces; matches by id, not substring |
| `cancelTranslation` (if exported) | Success → `cancelled`; vendor rejects → `{ ok: false }`; already done → `{ ok: true, skipped: true }`; `cancelPending` path |
| `serviceOptions` (if exported) | Returns `{ value, label }` list; empty and error cases |
| Config mapping | Any `translation.service.custom.*` / config → request mapping |
| Retry | 429/5xx retried (use shared `fetchWithRetry`), 401 re-auth once (archetype A) |
| Language-code mapping | Each mapped and unsupported code; unsupported codes refuse the submission before any vendor write; a failed languages lookup does not block |
| Persistence | Reload simulation: rebuild `service` from persisted `{ value }` strings and confirm status/save still work |

For error paths, assert both the message (`type: 'error'`, includes the vendor message) and that state is what you intend (persisted `error` vs untouched).

## da-translate (`test/services/<name>.test.js`)

mocha + chai + esmock; `npm test`. Mirror `test/services/lilt.test.js` using `executePostHandler` and `createMockRequest` from `test/helpers.js`. Cases: routed through `postHandler`; IMS required (401 without); forwarded-header allowlist; IMS `Authorization` never forwarded; credential injection; allowlist 403 (A) or key-resolution failure statuses (B); 504 on timeout; invalid `x-translate-env` → 400.

## da-etc (`test/routes/<name>.test.js`)

mocha with `node:assert/strict`; `npm test`. Cases: `fetchXToken` success, each missing field, vendor non-OK → `{ error, status }`; for archetype B no network call; `status` returns `{ connected }` and never the key.

## Live validation

Mocks only prove your assumptions. Before opening PRs, run against the vendor's staging API:

1. Run da-etc and da-translate (`wrangler dev`) locally or use stage. Point the connector at them (`?nx=<branch>` on a consuming page, with `DA_TRANSLATE`/`DA_ETC` overrides as the repo documents).
2. Create and configure a test site. Offer the user the guided flow in [test-site.md](test-site.md) (repo from the boilerplate, AEM Code Sync, `.da/translate.json`, test pages). Ask before editing anything remote.
3. Walk through the Translate app: connect, options, send, status polling, save. Verify the saved page in Experience Workspace, including `translate="no"` content left untouched.
4. Exercise the scenarios in [test-site.md](test-site.md): more than five pages; a dependent-language project; a vendor-side failure; a reload mid-job; cancel (if supported); a second project on the same site.
5. Record observations in the PR (what you ran, what the vendor did). Capture any vendor behavior the docs didn't state and add it to the connector's docs.

## Checker script

```bash
node .agents/skills/build-translation-connector/scripts/check-connector.mjs <name> \
  [--translate ../da-translate] [--etc ../da-etc] [--json]
```

Static checks for the contract, known gotchas and cross-repo wiring. It does not replace the tests or the live run. Exit code 1 on any FAIL.
