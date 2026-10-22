---
name: build-translation-connector
description: Builds a new translation-service connector for the Experience Workspace Translate app (nx/blocks/loc) end to end. Covers the vendor feasibility check against the aem.live connector requirements, the da-nx connector, the da-translate proxy service, the da-etc credential endpoint, tests, live validation, docs and PRs. Use whenever someone wants to add, integrate, port, review or estimate a translation vendor, TMS or machine-translation connector (Lionbridge, GlobalLink, DeepL, Lilt, Smartling, Trados, Translated, Phrase, memoQ, etc.), mentions nx/blocks/loc/connectors, sendAllLanguages, getStatusAll or saveItems, receives a "connector request", or asks whether a vendor's API can be supported, even if they never say the word "connector".
compatibility: Adobe-internal workflow. Needs git, gh, Node 20+, and sibling checkouts of adobe/da-nx, adobe/da-translate (private) and da-sites/da-etc. Needs network access to the vendor's API docs.
metadata:
  author: adobe-da-nx
  version: "1.0"
---

# Build a translation connector

A connector lets the Translate app (`nx/blocks/loc`) send Experience Workspace pages to a translation vendor, poll status, and save the results back. Adobe engineering normally builds these. The public contract is at https://www.aem.live/docs/ew/administering/translation-service-connection.

A working connector spans **three repos plus docs**. Skipping any piece produces a connector that works on a laptop and fails in production.

| Piece | Repo / location | What it does |
|---|---|---|
| Connector | `adobe/da-nx` → `nx/blocks/loc/connectors/<name>/` | Browser-side module the Translate app imports by service name |
| Proxy service | `adobe/da-translate` (private) → `src/services/<name>.js` | Forwards browser calls to the vendor; solves CORS, injects credentials |
| Credential endpoint | `da-sites/da-etc` → `src/routes/ints.js` | Resolves the site's vendor credentials server-side (token exchange or key check) |
| Docs | Experience Workspace `adobe/aem-website` → `docs/ew/administering/…` | Supported-connector list, config keys, config samples |

## Working rules

- **Make no assumptions.** Verify every vendor-dependent decision against, in order: a live sandbox call, the vendor's API schema or developer documentation, or the user. If none answers it, ask; don't guess. Vendor behavior (what "done" means, how cancel works, file naming rules) is rarely what the docs imply. Log each decision and its evidence in the intake report. See [references/live-api-verification.md](references/live-api-verification.md).
- **Read the vendor's API schema first** (OpenAPI/Swagger/Postman, not marketing docs) and confirm endpoints, request/response shapes and enum values from it. If you can't find a machine-readable schema, ask the user for one.
- **Prove it live.** Probe each endpoint with a real call before writing code, and exercise every connector function and vendor call end-to-end against the sandbox before opening PRs. Passing mocks are not evidence.
- **Branch names and bases.** Name the branch `feat/<name>-connector` in all three repos (da-nx, da-translate, da-etc). Ask the user which base branch to use in each repo (usually `main`, but the Lilt-era da-translate work may live on another branch), and create each branch in a `git worktree` from that `origin/<base>` so dirty or unrelated local checkouts stay untouched. Unset the upstream (`git branch --unset-upstream`) so a push can't go to the base branch.
- **Get confirmation before any write outside the working tree**: pushing, opening PRs, posting comments, deploying, or touching vendor accounts.
- **Reuse, don't re-implement.** The shared utilities in `nx/blocks/loc/utils/` (`fetchWithRetry`, `downloadQueue`, `auth`) exist because earlier connectors each copy-pasted them and reviewers rejected it.

## Workflow

Copy this checklist and tick it as you go:

```
- [ ] 1. Intake and feasibility verdict
- [ ] 2. Map the vendor API to the connector operations
- [ ] 3. Probe the vendor API live (every endpoint, before coding)
- [ ] 4. Choose the auth/transport archetype
- [ ] 5. Present the cross-repo plan; get a go-ahead
- [ ] 6. da-etc: credential endpoint
- [ ] 7. da-translate: proxy service
- [ ] 8. da-nx: connector (+ options, cancel if supported)
- [ ] 9. Tests in all three repos
- [ ] 10. Validate: lint, tests, checker script, every function live end-to-end
- [ ] 11. Docs
- [ ] 12. PRs (companion PRs, cross-linked)
```

### 1. Intake and feasibility verdict

Read [references/vendor-requirements.md](references/vendor-requirements.md). It points to the live aem.live requirements (the single source, deliberately not copied here) and adds the operations map, open questions and verdict values.

Ask the user, one question at a time:
- Vendor name, API docs link, and a sandbox or staging account (and whether credentials can be shared with the proxy's secret store).
- Which Translate-app operations the vendor needs to support and whether human review sits between "translated" and "done".
- Whether vendor guidelines restrict anything (Lionbridge forbids connector-initiated cancel, for example).

Produce a verdict with [assets/intake-report.md](assets/intake-report.md): **Go**, **Go with proxy**, or **No-go** with the failing requirements. Stop on No-go and tell the user which requirement fails and what the vendor would need to change.

### 2. Map the API to the connector operations

Fill the operation table in the intake report: for each of create project, upload, start, status, list/download, cancel, list projects, record the vendor endpoint, its identifier, and its terminal states. Find where the vendor's identifiers live (per file, per language, per job) because that decides what you persist (see [references/connector-contract.md](references/connector-contract.md), "State and persistence").

### 3. Probe the vendor API live

Before writing any code, make a real call to every endpoint in the operation map against the sandbox and record the actual responses, including deliberate failures, status values, pagination and limits. Follow [references/live-api-verification.md](references/live-api-verification.md). Add the findings to the intake report's decision log and note every place the live behavior differs from the docs. If you have no sandbox credentials, ask the user; don't proceed on docs alone. Never paste credentials into chat or commit them.

### 4. Choose the auth/transport archetype

Read [references/auth-and-proxy.md](references/auth-and-proxy.md). Default for new connectors: **route every call through da-translate** and keep credentials server-side.

- OAuth or token-exchange vendors → archetype A (GlobalLink pattern).
- Static API key vendors → archetype B (Lilt pattern): the key never reaches the browser; da-etc exposes only a boolean `/status`. The archetype B template imports `checkConnection` from `nx/blocks/loc/utils/auth.js`, which isn't on `main` until a connector PR adds it (Lilt #789, or the Translated connector #877). Check `main` first; if it's missing, branch from one of those PRs rather than re-implementing it.
- Do not copy the direct-to-vendor pattern from Lionbridge, Trados or Smartling for a new connector; it predates the proxy.

### 5. Present the plan

Show the user: verdict, archetype, base branch per repo, config keys the site admin will set, files to touch in each repo, persisted state, how status maps to `created / in progress / translated / error / cancelled`, and open questions. Wait for a go-ahead.

### 6. da-etc

Add a token fetcher (archetype A) or key validator (archetype B) in `src/routes/ints.js`, register it in `TOKEN_FETCHERS` (and `STATIC_KEY_SERVICES` for B), and add tests in `test/routes/`. Templates and rules are in [references/auth-and-proxy.md](references/auth-and-proxy.md) and [assets/da-etc-fetcher.js.tmpl](assets/da-etc-fetcher.js.tmpl). Missing-config errors must name each missing key.

### 7. da-translate

Add `src/services/<name>.js`, route it in `src/handlers/postHandler.js`, add the service to the IMS-auth list there, and add tests. Templates: [archetype B](assets/da-translate-service-key.js.tmpl), [archetype A](assets/da-translate-service-token.js.tmpl), and the [wiring notes](assets/da-translate-wiring.md.tmpl). Forward only allowlisted headers, set an upstream timeout, never log URLs that carry keys, and validate any caller-supplied upstream origin against an env allowlist.

### 8. da-nx connector

Create `nx/blocks/loc/connectors/<name>/index.js` (plus `auth.js` if the pattern needs one) from [assets/connector-index.js.tmpl](assets/connector-index.js.tmpl) and the matching auth template ([B](assets/connector-auth-key.js.tmpl) or [A](assets/connector-auth-token.js.tmpl)). The exports, argument shapes, status vocabulary and persistence rules are in [references/connector-contract.md](references/connector-contract.md); read it before writing `sendAllLanguages`. For how the shipped connectors solved specific problems, see [references/reference-connectors.md](references/reference-connectors.md).

Service names resolve dynamically: `translation.service.name` lower-cased with spaces replaced by `-` becomes the directory name, so the directory must match what admins type.

### 9. Tests

Read [references/testing.md](references/testing.md). Reviewers have blocked connector PRs without tests and with specific gaps (pagination, more than five files, error persistence). Use [assets/connector.test.js.tmpl](assets/connector.test.js.tmpl).

### 10. Validate

```bash
npm run lint
npm run test:file -- test/loc/connectors/<name>/index.test.js
node .agents/skills/build-translation-connector/scripts/check-connector.mjs <name> \
  [--translate ../da-translate] [--etc ../da-etc]
```

Fix every `FAIL`; read each `WARN` and justify or fix it. Then verify **every** connector function and vendor call live against the sandbox, first with a function harness and then through the real Translate UI: connect, send, status, save, and cancel if supported. Follow [references/live-api-verification.md](references/live-api-verification.md) and put its coverage table in the PR. A function with no live evidence is not done: run it, or tell the user which one you couldn't run and why. Live runs have found bugs mocks never did (wrong pagination params that the API silently ignored, status values missing from the docs, mandatory custom attributes). When a live result contradicts the code, fix it and add a test that captures the real behavior.

**Offer a test site.** Ask the user whether to create a disposable Experience Workspace site with the new connector configured. If yes, follow [references/test-site.md](references/test-site.md): prompt for the org and site name, create the GitHub repo from `adobe/aem-boilerplate`, have the user install the AEM Code Sync app, write the `.da` translation config and a set of test pages through the DA MCP tools, and hand over a scenario plan. Every remote write needs the user's go-ahead; credentials never go through chat or into a commit.

### 11. Docs

Read [references/docs-and-prs.md](references/docs-and-prs.md). Draft updates for the three aem.live pages and hand them to the user to publish; do not edit published Experience Workspace content yourself without confirmation.

### 12. PRs

One PR per repo, cross-linked. Conventional Commit titles. Details and the PR body checklist are in [references/docs-and-prs.md](references/docs-and-prs.md). Never hand-edit `CHANGELOG.md`; semantic-release generates it.

## Gotchas

These are the mistakes reviewers actually caught. Each cost a review round.

- **`sendAllLanguages` must return after upload with status `created`.** Don't poll for completion inside it (DeepL's first draft capped at 30 s and marked slow jobs `error`). `getStatusAll` does the polling, run by the user's Get status click. The host doesn't call it after sending, so an instant-MT vendor whose result is ready on return should set `translated` instead (see the contract).
- **Only create `lang.translation` for a language whose vendor submission succeeded.** If any step of job/submission creation fails for a locale (upload, create, or an unusable response with no id), leave that language's `translation` untouched and persist no ids for it. A `translation` object makes "Get Status" available, so a user must never be able to poll a project the vendor never received. Vendors that submit per language: set `created` only after that language's own id is returned, and report failures in one rolled-up message. Dependent (`waitingFor`) languages arrive with a host-created `translation: { status: 'not started' }`; on failure send the error message and the host reverts them to `waiting` for a retry, and `getStatusAll` must skip entries with no vendor id.
- **Paginate every list call and follow the API's own cursor/page params.** GlobalLink fetched one page of 200 targets; Trados's first version used `offset/limit` which the API silently ignored (it wanted `skip/top`). Confirm the param names from the schema, then test with more rows than one page.
- **Never match a result to a source page by substring or file name.** `ba.html` contains `a.html`. Persist an identifier map (`daBasePath → documentId/requestId`) at upload time and look results up by identifier.
- **Flattened upload names must be collision-free.** Escape the separator char before collapsing paths so `/a/b_c` and `/a_b/c` can't collide, and reject duplicates.
- **Persist everything you'll need after a reload.** `service` is the live object; set persisted strings as `service.key = { value: JSON.stringify(x) }` and call `saveState({ options })`. Persist per-language/per-job ids, not only the first. Reload after an error path and check the status survived.
- **Every early-return error branch must either persist `error` or leave `lang.translation` untouched.** Pick one on purpose. Don't mix.
- **Don't clear an error you just showed.** `sendMessage` is a single slot: `sendMessage()` after a failure erases it. Only clear on full success, and roll multiple per-language errors into one message.
- **Skip `complete` and `cancelled` languages when polling.** Vendors keep reporting delivered work as done forever, which would flip a saved language back to `translated` and trigger a re-save.
- **Only call vendor "approve/delivered" after the Experience Workspace save reports `url.status === 'success'`.** `saveFn` resolves even when the write failed. Check and surface the failure of the delivered/approve call.
- **Group languages by job before computing status.** Dependent (`waitingFor`) languages are sent later as separate jobs, so `langs` can span several jobs. Send the language's own source code (`options['source.language']?.code`, falling back to `en-US` only when the option is absent).
- **Use two L's: `cancelled`.** The UI and `utils/steps.js` treat only `cancelled` as terminal. Lionbridge's `statusFor` emits `canceled`; do not copy that.
- **Don't put the vendor credential in `Authorization`.** da-translate reserves it for the IMS token. Use `x-<name>-authorization` (archetype A) or let the proxy resolve the key (archetype B).
- **Never store secrets in `localStorage`.** Cached tokens use `sessionStorage` through the shared `utils/auth.js`.
- **Don't fork shared helpers.** Use `downloadQueue(urls, cb)` (max five concurrent, per the aem.live requirement) and `fetchWithRetry`. Don't mutate shared option objects: `headers: { ...BASE.headers, Authorization }`, not `BASE.headers.Authorization = …`.
- **Wait for an upload or deliverable to be *ready* before the next call, and check the result.** GlobalLink had dead code that ignored a "failed" readiness result and a `markDelivered` call whose failure was dropped.
- **Large uploads freeze the tab.** Synchronous zipping of hundreds of pages needs chunking or a worker.

More detail and the long tail are in [references/reference-connectors.md](references/reference-connectors.md).

## Code conventions (repo-specific)

- Every new or changed JS function gets complete JSDoc (params, returns); keep it terse. Default to no inline comments; one concise line only for non-obvious constraints. Longer rationale belongs in `docs/*.md`.
- Network helpers return a consistent shape (`{ error, status }` or `{ json }`); never throw across the connector boundary for expected failures.
- Exported functions with two or more parameters take a destructured object.
- No `window` globals. No TypeScript, no build step. Lit and other deps are already bundled; check `package.json` and `nx2/deps` before adding one (GlobalLink added `fflate` that way).
- `lang.translation ??= {}` before every mutation.
- Use `daFetch`/`source` from `nx2/utils/api.js` for Experience Workspace reads/writes, not hand-rolled fetches.
