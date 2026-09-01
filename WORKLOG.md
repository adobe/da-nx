# Worklog

## 2026-08-27

### Standalone quick-edit — authenticate before embedding preview

Replaced the unauthenticated top-level redirect from `aem.page` to
`preview.da.live` with a standalone shell flow. The existing quick-edit portal
first obtains the preview cookie, after which the shell embeds the authenticated
preview page with `controller=parent` and relays the unchanged quick-edit
protocol between the two frames. The da-live Canvas host remains unchanged.

## 2026-08-25

### nx2 editortoggle — label copy update

Updated `nx2/blocks/editortoggle/editortoggle.js` toggle label text from **"New editor"** to **"New Authoring"** so both the opt-in toggle and the switch-back context use the same updated wording.
Also updated the switch-back feedback modal title in `nx2/blocks/editortoggle/switchback-dialog.js` from **"Help us improve the new editor"** to **"Help us improve the new authoring experience"**.
Matched the profile-menu toggle hover state to the surrounding menu buttons in `nx2/blocks/editortoggle/editortoggle.css`, including blue text, background, and full-width separators.
Added matching 0.2s transitions for the toggle row and separator expansion animation.

## 2026-08-26

### nx2/blocks/chat-ao — update Coworker destinations

Replaced the retired `coworker.experience.adobe.io` skills and chat URLs with
their Experience Cloud routes. Capabilities now opens
`https://experience.adobe.com/#/coworker/customizations`; continuing an episode
opens `https://experience.adobe.com/#/coworker/{episodeId}`.

### nx2/blocks/chat-ao — PR CSS cleanup

Removed the unused `button.action-btn` rule and split the malformed
`max-height`/`border-left` declaration in the tool-call detail styles.

### nx2/blocks/chat-ao — contain background request failures

Made session warming catch both HTTP and WebSocket failures, and explicitly
consumed rejected background episode-list refreshes. Added controller tests for
both rejection paths.

### nx2/blocks/chat-ao — scope skills cache by IMS tenant

Replaced the manifest-only skills cache with tenant-specific localStorage keys
derived from AO's `x-tenant-id`. Cache hydration now waits for IMS context,
preventing one organization from rendering another's cached skills. Added
cross-tenant utility tests and controller cache-hydration coverage.

## 2026-08-25

### nx2/utils/api.js — hlx6 rename/move via copy + delete (#687)

The source bus has no move operation, so `source.move` on hlx6 (used by da-live's
rename) failed. Reimplemented the hlx6 branch as `source.copy` then `source.delete`
of the original, reusing the sibling methods (same delegation pattern as
`save`→`_saveHlx6`). This also inherits copy's `/org/site/` destination-prefix
stripping, which the old inline move branch was missing. Fails safe: if the copy is
not ok, it returns that response and never deletes. Legacy (hlx5) `${DA_ADMIN}/move`
path unchanged. Tests: hlx6 move now asserts copy-then-delete, plus a failure-path
test asserting no DELETE when the copy fails.

## 2026-08-19

### nx2 — restore lazy-loaded RUM (regression from nx1)

nx1 lazy-loaded `deps/rum.js` at the tail of `loadArea` (via `scripts/lazy.js`); nx2 dropped it. Restored:

- Copied `deps/rum.js` (vendored helix `sampleRUM`) into `nx2/deps/`.
- Added `scripts/lazy.js` (self-invoking, like nx1): holds `rumWC` (RUM click tracking for `[data-rum]` web components) + a `loadLazy` IIFE that imports `../deps/rum.js`, calls `sampleRUM()`, and registers `rumWC` after 3s.
- `nx.js` does `if (isDoc) import('./lazy.js')` **after the section loop** for every doc, matching nx1's post-loop timing. To reach that point on non-app-frame / no-nav pages, the `idx === 0` header setup was extracted into `loadHeader(isSession)`; its `return true` (the old early `return`s) now `break`s the loop instead of returning from `loadArea`, so section-loading semantics are unchanged but control still falls through to the lazy import.
- nx2 has no `[data-rum]` elements yet, so `rumWC` is currently a no-op — kept for parity/forward-compat.

## 2026-08-14

### editortoggle — UI + first-time/switch-back tracking (stacked on ew-user-flag)

The editor-toggle UI and its one-time guidance flows, stacked on top of the `ew-user-flag` branch (which owns the core `isEWUserEnabled` / `setEWUserEnabled` / `isEWEnabled` short-circuit logic). This branch consumes that flag; it does not define it.

- **`nx2/blocks/editortoggle/`**: `<nx-editortoggle>` Lit element — a `role="switch"` "New editor" toggle. Reflected `variant` prop: `toolbar` (default, renders only on `/edit`) and `menu` (renders only on `/canvas`). `_toggle()` calls `setEWUserEnabled`, then swaps `/edit` ↔ `/canvas` preserving `search`+`hash` (or reloads). `connectedCallback` reconciles the persisted flag to the pathname on direct/bookmarked landings, and scopes rendering to `EDITOR_PATHS` only.
- **Placement**: `nav.js` TEMP-injects the toolbar toggle into the action `<ul>` (strip once the nav fragment carries its own `<li>`); `profile.js` drops `<nx-editortoggle variant="menu">` into the profile popover for `/canvas`.
- **First-time tracking (welcome guide)**: `armEwWelcome()` / `isEwWelcomePending()` / `consumeEwWelcome()` over `nx2:ew-welcome-pending` + `nx2:ew-welcome-seen` (armed at toggle-on, first-time-only). `welcome-dialog.js` (`nx-ew-welcome-dialog`) loads `/nx/fragments/guides/welcome` and shows once on `/canvas`.
- **Switch-back tracking (feedback)**: `armEwSwitchbackFeedback()` / `isEwSwitchbackPending()` / `consumeEwSwitchback()` over `nx2:ew-switchback-pending` + `nx2:ew-switchback-seen`, armed on toggle-off, shown once on `/edit`. `switchback-dialog.js` POSTs to `DA_FEEDBACK` with `category: 'Editor switch-back'`.
- These tracking flags all live in `ewFlags.js` alongside the inherited core logic; tests for them are in `ewFlags.test.js` (welcome + switch-back describe blocks). The double-fire guard keeps welcome/switch-back firing from the toolbar instance only.

## 2026-08-14

### nx2/utils/ewFlags.js — user-level Experience Workspace opt-in

Core logic split out of the `editortoggle` work so it can land on its own. Adds a browser-scoped opt-in to the new (canvas) editor that mirrors the site-level `ew.enabled` flag, letting individual users preview EW on sites that haven't been switched over yet.

- New `EW_USER_KEY = 'nx2:ew-user-enabled'` in localStorage, with `isEWUserEnabled()` / `setEWUserEnabled(bool)` accessors (both storage-safe — `isEWUserEnabled` returns `false` and `setEWUserEnabled` no-ops when storage is unavailable).
- Split the old site-only check into `isEWEnabledBySite({ org, site })`, and made `isEWEnabled({ org, site })` short-circuit to `true` when the user override is on — so `da-browse`'s existing `isEWEnabled` call site opts the user into the new editor with zero changes there. The short-circuit intentionally runs before the `fetchDaConfigs` network call.
- `?ew` query-param seeding, mirroring da-live's `?da-admin` pattern (`blocks/shared/constants.js` `getDaEnv`): `isEWUserEnabled()` reads `?ew` from the URL and persists it before returning — `?ew=true` opts in, `?ew=false`/`?ew=reset` opts out — so the choice survives navigations that drop the param. `isEWUserEnabled(location?)` takes an injectable `location` for testing; `syncEWUserFromQuery` is the private read-through helper.
- `isEwChatDisabled` / `isCoworkerEnabled` stay site-only on purpose.
- Tests in `nx2/test/unit/nx/utils/ewFlags.test.js`: default state, set/unset roundtrip, the user-override short circuit in `isEWEnabled` (uses a bogus org/site so an accidental network call would surface as a rejection, not a false positive), and `?ew=true`/`false`/`reset`/absent query-param seeding.

The toggle UI, welcome guide, and switch-back feedback prompt that consume this flag live on the stacked `editortoggle` branch.

## 2026-08-07

### nx2/utils/api.js — remove stage-content.da.live rewrite workaround

`80f9db79` removed the `content.da.live` → `stage-content.da.live` contentUrl rewrite from `source.uploadMedia`'s non-hlx6 branch (added `3300b1ee`/`3070fa63`, see `2026-08-06` below), plus its three dedicated tests. Server-side fix landed on stage-admin.da.live — it now returns the correct content host directly, so the client-side rewrite is no longer needed. This makes bug fix #2 in the `2026-08-06` entry below (the body-stream-already-read fix) moot: it only mattered inside the now-deleted rewrite branch.

## 2026-08-06

### nx2/utils/api.js — tests for `source.uploadMedia`, plus two bug fixes found while writing them

Added test coverage for the new `source.uploadMedia({ org, site, path, body })` method (added in `3300b1ee`, "feat: add media upload api"): legacy delegation to `_saveDA` as FormData, the stage `content.da.live` → `stage-content.da.live` contentUrl rewrite, hlx6 POSTs to the AEM media route with the correct `content-type` header, `contentUrl` prefix-stripping against the site's `aem.page` origin, non-ok passthrough for both branches, and the `/org/site/path` string call form. 11 new tests in `test/nx2/utils/api.test.js`.

Two bugs surfaced while writing the tests (both fixed, confirmed with the author):
1. The non-hlx6 branch fell through to the hlx6 media POST whenever `DA_ADMIN` wasn't exactly `'https://stage-admin.da.live'` — i.e. for any ordinary non-hlx6 site in most environments, `uploadMedia` made a second, unintended request to the hlx6-only endpoint after `_saveDA` had already completed. Fixed by returning after the `_saveDA` call unconditionally.
2. In this repo's test/dev env `DA_ADMIN` *is* `'https://stage-admin.da.live'`, so the stage-content rewrite branch always runs for non-hlx6 uploads. When the returned `contentUrl`'s host wasn't `content.da.live` (no rewrite needed), the code had already consumed the response body via `resp.json()` and then returned that same (now-drained) `Response` — any caller subsequently calling `resp.json()` would get a "body stream already read" error. Fixed by always returning `adaptJsonResponse(resp, json)` in that branch, rewritten or not, so callers get a fresh readable response either way.

## 2026-07-30

### nx2/utils/api.js — normalize hlx6 `source.save` response to `{ source: { contentUrl } }` (#631)

The hlx6 source-bus save endpoint (`${AEM_API}/{org}/sites/{site}/source{path}`) returns a **200 with an empty body**, whereas DA returns `{ source: { contentUrl } }`. da-live's image-upload plugin (`blocks/edit/prose/plugins/imageDrop.js`) calls `resp.json()` on the save result and reads `json.source.contentUrl`; on hlx6 the empty body made `resp.json()` throw `SyntaxError: Unexpected end of JSON input`. Because the caller is an un-awaited async fn, the throw became an unhandled rejection and the FPO-placeholder → real-image swap never ran — the placeholder stuck around and published with a stale hlx5 fragment, so preview couldn't find the image.

Fix: on a successful hlx6 save, shadow the Response's `json()` (new `withSourceJson` helper) so it resolves to `{ source: { contentUrl } }` with `contentUrl` = the source URL just written (`${AEM_API}/{org}/sites/{site}/source{path}`). Non-ok responses pass through untouched so callers' error handling is unchanged. Only `imageDrop.js` reads the save body — every other da-live `source.save` consumer checks `resp.ok` only — so the change is contained. Updated `nx2/utils/api.md`; added two tests.

## 2026-07-23

### nx2/utils/api.js — org-level listing merges DA-legacy and hlx6 source-bus sites (da-live#1169)

`source.list({ org })` (no `site`) previously only queried `${DA_ADMIN}/list/{org}`, so hlx6-upgraded sites were invisible in org-level listings. Now, when `site` is omitted, it fires both the DA-legacy list and `org.listSites({ org })` in parallel, normalizes each via `hlx6ToDaList`, and dedupes the combined items by `name` (legacy entry wins on a name collision). `ok` is true if either call succeeds, so a 404 from either side (non-migrated org, or an org with no legacy DA content) doesn't blank out the other's results. Only DA returns a `continuationToken` — hlx6 has no pagination — so `org.listSites` is only queried on the first page (`continuationToken` absent); later pages skip it entirely instead of redundantly re-merging the same unpaginated site list each time (caught in review).

Also fixed `org.listSites`: was hitting the wrong (unused/stubbed) endpoint `${AEM_API}/{org}/sites`; corrected to `${AEM_API}/{org}/source/` per the source-bus API.

New internal helpers `parseListItems` (ok-check + parse-or-`[]`) and `dedupeByName`, alongside `hlx6ToDaList`. Updated `api.d.ts`/`api.md` accordingly. Consumers in `da-live` (`da-sites.js`/`da-list.js`) and its `test/fixtures/nx2/utils/api.js` mirror need no da-nx-side change but should be synced manually — out of scope for this repo.

**Test-suite flake fixed in passing:** `test/nx2/utils/api.test.js`'s outer `beforeEach` did a blanket `localStorage.removeItem('hlx6-upgrade')`. Since `tree.test.js` seeds the same shared-origin key for its own hlx6 tests, and wtr runs test files concurrently (`--concurrent-browsers 4`) with a shared localStorage, this occasionally wiped `tree.test.js`'s seeded entry mid-run, causing intermittent unrelated failures. Removed the clear — every `org`/`site` pair in `api.test.js` already comes from a randomized `uniq()` helper, so the blanket clear was never actually load-bearing.

## 2026-07-14

### nx2/styles/styles.css — pin to light mode

Changed `:root { color-scheme: light dark; }` → `color-scheme: light;` and `.dark-scheme { color-scheme: dark; }` → `color-scheme: light;`. Matches nx1 (`nexter.css`) which pins `:root` to light, and da-live browse which forces both `.light-scheme` and `.dark-scheme` to `color-scheme: light` so the profile toggle can't override.

## 2026-07-09

### nx/blocks/secure-org — migrate secure-org block to nx2

Added `'secure-org'` to `NX_BLOCKS` in `nx2/scripts/nx.js`. Block stays in `nx/blocks/secure-org/` per migration convention.

Import updates in `secure-org.js`:
- Dropped `getConfig` from nexter.js; icon URLs built via `new URL('../../public/icons/...', import.meta.url).href` (icons live only in nx1)
- `../../utils/ims.js` `loadIms` → `../../../nx2/utils/ims.js`
- `../../utils/styles.js` default `getStyle` → `{ loadStyle }` from `../../../nx2/utils/utils.js`
- `../../utils/svg.js` `getSvg` → default `loadIcons` from `../../../nx2/utils/svg.js`

Import updates in `utils.js`:
- `../../public/utils/constants.js` (DA_ORIGIN) → `../../../nx2/public/utils/constants.js`
- `../../utils/daFetch.js` (daFetch) → `../../../nx2/utils/api.js`; call site updated from positional `daFetch(url, opts)` to destructured `daFetch({ url, opts })`

CSS variables in `secure-org.css`:
- `--grid-container-width` → `--se-grid-container-width` with nx1 fallback
- `--spacing-800` → `--s2-spacing-800` with nx1 fallback

Verified live at `/apps/sandbox?nx=local` — block renders correctly (nx-path input, orange warning alert with AlertDiamond icon), no console errors.

### nx/blocks/bulk — migrate bulk operations block to nx2

Added `'bulk'` to `NX_BLOCKS` in `nx2/scripts/nx.js`. Block stays in `nx/blocks/bulk/` per migration convention.

Import updates in `bulk.js`:
- `../../deps/lit/lit-core.min.js` → `da-lit`
- Dropped `getConfig` from nexter.js; icon URL built via `new URL('../../img/icons/...', import.meta.url).href` (icon only exists in nx1)
- `../../public/utils/tree.js` → `../../../nx2/public/utils/tree.js` (Queue)
- `../../utils/svg.js` `getSvg` → `../../../nx2/utils/svg.js` default `loadIcons` (compatible `{ paths } → Promise<svg[]>` signature)
- `../../utils/styles.js` default `getStyle` → `{ loadStyle }` from `../../../nx2/utils/utils.js`

Import updates in `index.js`:
- `../../public/utils/getExt.js` → `../../../nx2/public/utils/getExt.js`
- `../../utils/daFetch.js` → `../../../nx2/utils/api.js`
- `../../public/utils/constants.js` → `../../../nx2/public/utils/constants.js`
- **API signature change:** nx2's `daFetch` uses destructured args, so `daFetch(url, opts)` → `daFetch({ url, opts })`

CSS variables in `bulk.css` mapped to nx2-first-nx1-fallback:
- `--grid-container-width` → `--se-grid-container-width`
- `--spacing-*` → `--s2-spacing-*`
- `--body-font-family` → `--s2-font-family`
- `--s2-radius-100` → `--s2-corner-radius-500`
- `--s2-font-size-600` (31px) → `--s2-heading-size-xl` (36px, closest available)

### nx/blocks/tree/tree.js — migrate tree block to nx2

Added `'tree'` to `NX_BLOCKS` in `nx2/scripts/nx.js` so the block always loads from `/nx/blocks`.

Updated imports in `nx/blocks/tree/tree.js` to nx2 equivalents (block stays in place per migration convention):
- `../../deps/lit/lit-core.min.js` → `da-lit` (importmap)
- `../../scripts/nexter.js` → `../../../nx2/scripts/nx.js` (for `getConfig`)
- `../../public/utils/tree.js` → `../../../nx2/public/utils/tree.js` (for `crawl`)
- `../../utils/styles.js` (default `getStyle`) → `{ loadStyle }` from `../../../nx2/utils/utils.js`

## 2026-06-26

### nx2/blocks/chat/chat.js — skill selection preserves pending attachments (feat/da-skill-attachment-fix)

`_onSlashSelect()` was calling `sendMessage(message, [], { requestedSkills: [skillId] })`, discarding any pending file pills in `this._items`. Fixed by mirroring `_submit()`'s attachment-building logic: split `this._items` into `fileItems` (truthy `dataBase64`) and `contextItems`, build the `attachments` array with the same field/sizeBytes pattern, revoke thumbnail object URLs, clear `this._items`, then pass `{ requestedSkills: [skillId], attachments }` and `contextItems` to `sendMessage`.

Post-review follow-up (fe049a9b):
- Extracted `_buildAttachmentPayload(items)` shared by both `_submit` and `_onSlashSelect`
- Moved `this._items = []` to after `sendMessage` call (was before, losing attachments on throw)
- Guard `attachments` key: only spread into opts when `attachments.length > 0`
- Read `this._items` once into local `const items` before filter calls
- Renamed loop variable `i` → `item` in `_onSlashSelect` callbacks
- Added regression tests in `test/nx2/blocks/chat/chat.test.js` (8 tests, all pass)

## 2026-06-25

### exp block — fix IMS timeout, restore SL typography

The iframe palette failed with `Error: IMS timeout` from `nx2/utils/ims.js` on `?nx=nx2-exp` URLs. Root cause: da-live's `/plugins/exp` page lacks a `<meta name="nxver">`, so the iframe boots in **nx1 mode** — `nxJS = '/scripts/nexter.js'`, `getNx()` returns `…/nx` (not `…/nx2`), and da-live's `initIms()` imports `nx/utils/ims.js`. But this branch's `nx/blocks/exp/exp.js` statically imports `nx2/blocks/profile/profile.js`, which statically imports `nx2/utils/ims.js`. Two `loadIms` modules in the same window, each with its own memoization, each tries to bootstrap imslib independently — first one wins; the second's `onReady` is never re-fired (imslib reads `window.adobeid` once at load time), and we time out.

Fix in `nx/public/plugins/exp/exp.js`: append `&nxver=2` to the iframe `src`. da-live then boots the iframe in nx2 mode, loads `nx2/utils/ims.js` for `initIms`, and shares memoization with exp's statics. Single setup, single bootstrap. (Applied to both the `main` and branched URLs so the fix holds once the migration lands on main.)

Other changes needed to support exp on nx2 profile:
- `nx/blocks/exp/exp.js`: swapped `'../profile/profile.js'` → `'../../../nx2/blocks/profile/profile.js'` so exp shares the nx2 ims memoization with da-live's `initIms` (now also nx2 thanks to the `nxver=2` flip above).
- `nx2/blocks/profile/profile.js`: `handleLoaded` now also dispatches `CustomEvent('loaded', { detail: this._ims, bubbles, composed })`, matching the nx1 contract that exp's `@loaded=${this.handleProfileLoad}` listens for.
- `nx/blocks/exp/exp.js`: adopt the SL stylesheet on `document` as well as the shadow root. SL targets `:root`, which doesn't match inside a shadow tree, so without document adoption the `--s2-*` custom-property cascade was never set up and typography (e.g. the "Edit experiment" heading, the slider's `%` label) fell back to browser defaults. nx1 got this for free because the previous `loadStyle` had a document-level side effect; nx2's `loadStyle` returns a constructable sheet only.
- `nx2/scripts/nx.js` `loc()`: `strings.get(key) ?? key` → `strings?.get(key) ?? key`. Latent bug — when `getConfig()` returns the `{ error }` stub (config not set yet), `strings` is undefined and the throw masked the design-intended `?? key` fallback.

Things that looked load-bearing during investigation but weren't (all reverted once the iframe-mode mismatch was identified):
- Short-circuit / "reuse existing `window.adobeIMS`" in `nx2/utils/ims.js` `setup()` — only needed when two `loadIms` modules race against the same imslib, which the `nxver=2` flip prevents.
- `loginPopup` / `modalMode` plumbing in `loadIms`.
- Async setup + per-call `resolveNxConfig()` re-read.
- `IMS_TIMEOUT` bump to 15s.
- Defensive `config.log` / `_ims` guards in `nx2/blocks/profile/profile.js`.

### exp block — completed nx2 migration (importer pattern)

Block stays under `nx/blocks/exp/`; all nx2 API imports use relative paths into `nx2/`.

- `nx/blocks/exp/exp.js`: removed nx1 `loadStyle` (nexter.js) and `getStyle` (utils/styles.js); imports `loadStyle` from `nx2/utils/utils.js`; SL components updated to `nx2/public/sl/components.js`; dropped document-level `loadStyle` side effect (nx2 version returns constructable sheet directly).
- `nx/blocks/exp/views/edit.js`: removed `getConfig` from nx1 `nexter.js` (returns `{ error }` in nx2 context since nx1 config is never initialized); replaced `nxBase` with `new URL(import.meta.url).origin + '/nx'` pattern; switched to nx2 `loadStyle`.
- All other views (`actions`, `dialog`, `login`, `new`, `view`): `getStyle` (nx1) → `loadStyle` from `nx2/utils/utils.js`.

Previously done (2026-06-24):
- `nx2/scripts/nx.js`: added `'exp'` to `NX_BLOCKS`.
- `nx/blocks/exp/utils.js`: `DA_ORIGIN` → `DA_ADMIN`, `AEM_ORIGIN` → `HLX_ADMIN`, `loadIms` → `nx2/utils/ims.js`.

## 2026-06-23

### nx2/blocks/shared/dialog — configurable panel sizing (dialog-css-vars branch)

Exposes four CSS custom properties on `.panel` so consumers can resize the dialog without forking it:

- `--nx-dialog-min-width` (default `400px`)
- `--nx-dialog-max-width` (default `480px`)
- `--nx-dialog-max-height` (default `90vh` / `90dvh`)
- `--nx-dialog-padding` (default `var(--s2-spacing-500)`)

Values stay clamped to the viewport via the existing `min(<custom>, calc(100vw - 2 * --s2-spacing-500))` envelope, so a too-large custom value won't overflow. Purely additive — existing usage of `<nx-dialog>` is unchanged (each fallback in the `var()` call matches the previous literal).

Driving use case is da-live's new EW block library modal, which needs a ~960px wide 2-column tree+preview layout that the previous fixed 480px cap couldn't accommodate.

## 2026-05-28

### nx2/utils/api.js — consistency refactor (api-refactor branch)

Method-name + arg-shape alignment across the public surface, plus a return-shape simplification.

**Renames** (object-form arg names unchanged otherwise):
- `source.load` → `source.get`
- `source.save({ data })` → `source.save({ body })`
- `config.put` → `config.save`
- `snapshot.update` → `snapshot.save` (aligns with AEM's documented `createSnapshot` upsert)
- `wrapActionResp` removed; `HLX6_ONLY` constant kept (still used by `config.getAggregated`).

**Return-shape unification:** every namespace method now returns a raw augmented `Response` except `source.list` (which legitimately merges body + header continuation token + normalized items). Concrete changes:
- `source.delete/copy/move` no longer wrap into `{ ok, status }`.
- `source.getMetadata` returns `Response` directly; caller reads `resp.headers`.
- `status.get` returns `Response` (was: parsed JSON | undefined).
- `aem.*` drops the `returnJson` flag and the `204 → { ok, status: 204 }` wrapper on `unPreview` / `unPublish`. `callPath` no longer parses JSON.

**Opt-in unwrappers added:** `asJson` / `asText`. Both return `{ ok, data, status, error }` where `data` is parsed (populated on non-ok when the body parses — matches axios), `status` is the HTTP code, `error` is one of `'no-response' | 'not-ok' | 'parse-failed'` or `null`. Considered `asOk` and dropped it — `const { ok } = await foo()` is the same length.

**Other fixes:**
- `snapshot.addPath` / `snapshot.removePath` auto-prepend `/` to path (latent bug: callers passing `'index.html'` would build `…/{id}index.html`). New `normalizePath` helper handles string and array forms.
- `snapshot` review action gained no new args; bulk-`removePath` `POST {paths, delete:true}` shape kept although it's not in the published AEM spec — flagged in known-issues but left alone pending verification against the server.

**File layout:** reorganized so the public namespaces are at the top in alphabetical order, then response helpers, then low-level (`daFetch` / `isHlx6` / `fromPath`), then internal helpers (constants, URL builders, `withArgs`, etc.). Internal helpers converted from arrow-consts to function declarations so hoisting lets the top-of-file exports reference them. `/* eslint-disable no-use-before-define */` at file top.

**Gotcha discovered:** `chai.deep.equal(<Response>, {...})` hangs Chrome by traversing the `body` ReadableStream. One test (`source.delete sends DELETE and returns { ok, status } on 204`) hit this when `source.delete` switched to returning a `Response`. Fix is `expect(resp.ok)` / `expect(resp.status)` separately. Worth remembering — symptoms were "wtr reports 0 passed / 0 failed, Chrome never returns results."

**Tests:** 90/90 in `test/nx2/utils/api.test.js`. Updated assertions for new shapes; dropped one `returnJson: false` test that no longer applies.

**Docs:** `api.d.ts` and `api.md` updated; new `UnwrapResult<T>` type, new return-values section, new helpers section.

**Out of scope, flagged as future work:**
- No per-call `headers` / `opts` on most methods (biggest remaining gap — blocks `If-Match` / tracing / `Accept-Language`).
- No `AbortController` signal plumbing.
- No retry on 429/5xx.
- `org.listSites` vs `source.list({ org })` naming inconsistency.
- `source.delete/copy/move` have no bulk variants (unlike `aem.*` and `snapshot.addPath/removePath`).

## 2026-05-11

### Remove `/index` stripping from `nx2/utils/utils.js`

Removed the 3-line block in `parseWindowPath` that redirected `#/org/site/path/index` → `#/org/site/path`:

```js
if (location.hash.endsWith('/index')) {
  const clean = location.hash.slice(0, -5);
  history.replaceState(null, '', clean);
}
```

**Reasoning:** `parseWindowPath` is shared by both browse and canvas. In canvas (da-live), this silently redirected hash URLs before the editor could read the path, breaking direct links to `index` files (e.g. `/canvas#/org/site/path/index`). The stripping was introduced by Claude in commit `9626865e` with no explanation — likely a browse UX convention (index ≡ directory) applied incorrectly to a shared parser. Removed from `nx2` only; `nx` is left unchanged as it's a separate code path.

## 2026-05-08

### quick-edit merge conflict

Resolved `origin/main` ↔ branch conflict in `nx/public/plugins/quick-edit/quick-edit.js`: kept a single `handleReady`, retained branch `checkDomain` + parent-controller flow, removed duplicate `checkDomain()` invocation left from the merge.

## 2026-05-06

### Phase 3 continued — chat and tool-panel moved into da-live

Moved `nx2/blocks/chat/` and `nx2/blocks/tool-panel/` from da-nx into da-live as `blocks/ew-chat/` and `blocks/ew-tool-panel/`, following the same procedure as canvas/inventory.

**What landed in da-live `ew`:**
- `blocks/ew-chat/` — full chat block with sub-components (`pills`, `prompts`, `welcome`), controller, persistence, renderers, utils
- `blocks/ew-tool-panel/` — tool panel (picker, fullsize-dialog, header actions)
- `deps/mdast/` — copied from da-nx; used by `renderers.js` for markdown rendering

**Custom element renames:**
- `nx-chat` → `ew-chat`
- `nx-tool-panel` → `ew-tool-panel`
- Internal sub-elements (`nx-chat-welcome`, `nx-chat-pills`, `nx-prompts`) kept as-is

**Import adaptations:**
- `../../utils/utils.js` → `../shared/nxutils.js` (loadStyle, hashChange, getNx, DA_ADMIN)
- `../../utils/api.js` daFetch → `../shared/utils.js` daFetch (positional signature); api.js call site updated
- `../../utils/ims.js` loadIms → `../shared/utils.js` initIms (aliased as loadIms)
- `../shared/menu/menu.js` (static) → `await import(\`\${getNx()}/blocks/shared/menu/menu.js\`)` (top-level dynamic; menu stays in shell)
- `../../shared/picker/picker.js` (static) → `await import(\`\${getNx()}/blocks/shared/picker/picker.js\`)` in prompts.js and tool-panel.js

**Icon migration applied (per feedback_icon_migration.md):**
- Removed `loadHrefSvg` / `ICONS_BASE` / `loadChatIcons` from all files
- chat.js: `ICON_SRCS` map with `/img/icons/s2-icon-*-20-n.svg` URLs; `icon()` returns `<img>` TemplateResult
- tool-panel.js: close icon now `<img src="/img/icons/s2-icon-splitright-20-n.svg">`
- CSS: `svg` selectors → `img`; removed `path { fill: ... }` rules; `/nx2/img/icons/` → `/img/icons/` (lowercase kebab); added `filter: invert(1)` on `.action-btn img` for dark-background buttons

**canvas.js + inventory.js updated:**
- Dynamic imports now point to local `../ew-chat/chat.js` and `../ew-tool-panel/tool-panel.js`
- `document.createElement('nx-chat/nx-tool-panel')` → `ew-chat/ew-tool-panel`
- `querySelector('nx-tool-panel')` selectors updated to `ew-tool-panel`
- Removed `getNx` from canvas.js imports (no longer needed there)

## 2026-04-28

### nx2 canvas — library vs extension panel split
- **`nx-panel-library.js`**: OOTB block library / templates / icons / placeholders UI (fetch, insert, preview, sprites); shares **`nx-panel-extensions.css`** with the iframe host.
- **`nx-panel-extensions.js`**: **`nx-panel-extension`** only chooses **`nx-panel-library`** vs BYO **`iframe`** + **`iframe-protocol`**.

### nx2 canvas — tool panel sections (Editor / Library / Extensions)
- **`helpers.js`**: **`getCanvasToolPanelViews`** — Editor placeholder tab (`editor-coming-soon`), **Library** = OOTB plugins + **`aem-assets`** (sorted **`blocks` → `aem-assets` → `icons` → `templates` → `placeholders`**), **Extensions** = other configured plugins.
- **`tool-panel.js` / `.css`**: Picker items built with **`nx-picker`** **`section`** headings; initial tab is **`views[0]`**; prune **`_loaded`** / clear content when **`views`** empty or ids change. Placeholder host class **`.nx-tool-panel-editor-placeholder`**.
- **`canvas.js`**: loads **`getCanvasToolPanelViews`** instead of **`getExtensionViews`**.

### nx2 utils — DA config API
- **`nx2/utils/daConfig.js`**: **`getFirstSheet`**, **`fetchDaConfigs`** (moved from **`nx-panel-extensions/config.js`**). Canvas **`helpers.js`** / **`aem-assets.js`** import from utils; branch **`ref`** stays local to **`helpers.js`**.

### nx2 canvas — library panel action icons (da.live parity)
- **`nx-panel-extensions.js` / `.css`**: Add / Preview use the same **`/blocks/edit/img/`** SVGs and **`<use href="#S2_Icon_Experience_Add">` / `#S2_Icon_ExperiencePreview`** pattern as da.live **`da-library`** (via shared **`inlinesvg`** preload). Source SVGs live in **`.ext-svg-sprites`** (visually hidden) so they are not laid out in the panel body.

### nx2 canvas — block variants: no inline DOM preview
- **`nx-panel-extensions.js` / `.css`**: variant rows no longer embed **`v.dom`** in the Lit tree (avoids cloning / ownership issues). Insert still uses **`variant.dom`** via **`_insertBlock`**.

### nx2 canvas — AEM Assets Cancel closes panel
- **`aem-assets.js`**: pass **`onClose`** through to **`PureJSSelectors.renderAssetSelector`** (same hook as da.live **`da-assets.js`**).
- **`nx-panel-extensions.js`**: **`onClose`** dispatches **`nx-panel-close`** so **`panel.js`** hides the right aside.

### nx2 canvas — `experience` for picker / tab bypass (`window`, `fullsize-dialog`)
- **`helpers.js`**: **`extensionToPanelView`** passes through **`experience`** and **`sources`** from the extension config (no separate URL / modal flags).
- **`aem-assets.js`**: **`getAssetsPlugin`** uses **`experience: 'fullsize-dialog'`** (was **`aem-assets`**).
- **`picker.js` / `.css`**: **`experience === 'window'`** + **`sources[0]`** → new tab; **`fullsize-dialog`** → **`nx-picker-experience-dialog`** (no **`change`**); open-in icon for those rows.
- **`tool-panel.js` / `.css`**: same rules in **`_activate`** / **`showView`**; **`_fullsizeDialogViewId`** drives **`.tool-panel-fullsize-dialog`**; body mounts **`await view.load()`**. **`@nx-panel-close`** on **`dialog`** stops propagation and closes the dialog (not the whole panel).
- **`nx-panel-extensions.js`**: **`fullsize-dialog` + `aem-assets`** renders the assets host div and runs **`renderAssets`** from **`updated`**; other **`fullsize-dialog`** third-party configs use the iframe path as today.
- **`nx-panel-extensions.js`**: no inline AEM Assets mount (modal-only).

## 2026-04-27

### nx2 chat — collab after approval
- **`chat-controller.js`**: **`_pageContextForAgent()`** shared by **`sendMessage`** and **`approveToolCall`** so post-approval **`/chat`** resumes include **`pageContext`** (da-agent collab gate).

### nx-breadcrumb — drop large variant
- **`breadcrumb.js` / `breadcrumb.css`**: removed **`variant`** (was only **`large`**); typography and chevrons use the default **M** component tokens everywhere.
- **`nav.js`**: nav breadcrumb no longer sets **`variant="large"`**.

## 2026-04-24

### nx2 canvas — slash “Open library” → Blocks tab
- **`command-defs.js`**: `nx-canvas-open-panel` detail includes `viewId: 'blocks'` so the after tool panel selects the Blocks extension when present.
- **`canvas.js`**: `openCanvasPanel` accepts optional `preferredViewId` from event `viewId`; after `syncToolPanelViews`, waits for `updateComplete` then calls **`nx-tool-panel` `showView`** only if `views` contains that id.
- **`tool-panel.js`**: public **`showView(id)`** wraps `_activate` for external callers.

### nx2 nav / browse — hash breadcrumbs (minimal)
- **`nx2/blocks/shared/breadcrumb/`**: **`nx-breadcrumb`** — optional **`.baseUrl`**, **`.pathSegments`**; parent steps are plain **`<a href>`** (hash-only or resolved via **`resolveBreadcrumbHref`** + current **`location.search`**). **`hashStateToPathSegments`** / **`pathSegmentsToCrumbs`** in **`utils.js`**. No custom events.
- **`nav.js` / `nav.css`**: **`decorateBreadcrumbs(fragment)`** — same idea as **`decorateBrand`**: mutates the loaded fragment, returns **`null`** or **`{ baseUrl }`**; **`loadNav`** sets **`_navBreadcrumbs`** (@state) and plain **`_breadcrumbBaseHref`**. **`HashController`**, **`brand-cluster`**, **`brand-area`** on the brand **`<a>`**.
- **`browse.js`**: unchanged integration — **`nx-breadcrumb`** with segments only (default / medium typography).

### nx2 canvas — split editor view
- **`nx-canvas-header`**: third segmented control option `split` (grid-compare icon, `aria-label` / `title` “Split view”); `EDITOR_VIEWS` includes `split`.
- **`canvas.js` / `canvas.css`**: `normalizeCanvasEditorView` persists `split`. Split layout, gutter DOM, drag/persist ratio, and split-only CSS live in **`nx-editor-split/`** (`nx-editor-split.js` + `nx-editor-split.css`, adopted on import): **`nx-canvas-editor-mount--split`** row (**WYSIWYG left**, 2px **`nx-canvas-split-gutter`**, **doc right**), **`--nx-canvas-split-ratio`**, pointer-drag 15–85% → sessionStorage (`nx-canvas-split-ratio`). Split-mode **`nx-editor-wysiwyg`** uses matching **`flex-basis` / `width` / `min-width`** so the preview column does not collapse before the iframe is ready.
- **`nx-editor-doc` / `nx-editor-wysiwyg`**: visibility treats `split` like both single-pane modes (doc + preview visible when iframe port is ready). **`nx-editor-wysiwyg`**: host `hidden` only when the canvas mode hides the preview entirely; while cookies / quick-edit port load, **`.nx-editor-wysiwyg-surface`** is `hidden` so the custom element still participates in split flex sizing without a layout jump.
- **`selection-toolbar.js`**: ProseMirror selection toolbar sync runs in `split` as well as `content`.
- **`selection-toolbar.js` / `handlers.js`**: iframe `selection-change` marks PM transactions with meta and plugin state (`fromIframe`); doc-based `syncToolbar` / doc scroll positioning skip while the mirrored range came from WYSIWYG so split view does not draw the bar from doc `coordsAtPos`. Collapsed iframe selection dispatches a no-op tr to clear that origin.

## 2026-04-23

### Canvas actions — no constructor
- `canvas-actions.js`: `HashController` and initial `_busy` moved to class fields so the custom constructor can be dropped; `_sendIcon` is not a reactive property (set once in `firstUpdated` + `requestUpdate()`); dropped redundant `requestUpdate()` after `_busy` / `_error` changes (Lit `@state` assignments schedule updates).

### Canvas prose — undo/redo keymap
- `prose.js`: removed custom `handleUndo` / `handleRedo` that duplicated `yUndo` / `yRedo` from y-prosemirror (same pattern as `nx-editor-wysiwyg/utils/handlers.js` and da.live’s underlying commands).

## 2026-04-22

### Canvas prose — keymap order aligned with da.live
- `prose.js`: moved `keymap(baseKeymap)` to after `buildKeymap` + `handleTableBackspace` (and `codemark` after `baseKeymap`), matching `da-live/blocks/edit/prose/index.js`, so full-table delete with Backspace and Enter in lists behave like da.live.

### Canvas prose — plugins ported from da.live
- Added `nx2/blocks/canvas/nx-editor-doc/prose-plugins/`: `codemark`, `columnResizing` (from `da-y-wrapper`), `imageDrop`, `imageFocalPoint`, `tableSelectHandle`, `sectionPasteHandler`, `base64Uploader`, plus `sourceUploadContext`, `tableUtils`, `inlinesvg`, `focalPointDialog` (native `<dialog>`; no face-api).
- Wired plugins in `prose.js` for writable sessions; styles in `nx-editor-doc.css`. Upload paths derive from the editor `source` URL. Focal-point block metadata still loads from `https://da.live/.../da-library/helpers/`.

## 2026-04-21

### Canvas editor — selection toolbar + slash shared helpers
- **`selection-toolbar.js`**: exports `EDITOR_TEXT_FORMAT_ITEMS` and prose helpers (`applyHeadingLevel`, `wrapInBlockquote`, `setCodeBlock`, `setParagraph`, list wraps) for slash menu; block-type picker from `BLOCK_TYPE_PICKER_DEFS`; `STRUCTURE_COMMANDS` (`isActive` + `run`); `markIsActiveInSelection`; structure buttons from a toolbar subset of `EDITOR_TEXT_FORMAT_ITEMS`.
- **`slash-menu-items.js` / `slash-menu-handlers.js`**: import shared catalog/helpers from `selection-toolbar.js` (slash-only rows stay in items).

## 2026-03-21

### AGENTS.md creation

Created AGENTS.md to capture conventions not derivable from the code. Key entries:

- `undefined` vs empty array for loading state detection
- `somethingUrl` (URL object) vs `href` (string) naming convention
- Avoid attaching custom properties to `window` (built-in browser APIs are fine)
- Error return shape (`{ error }` vs `{ json }`)
- Lazy loading with `firstUpdated` + null check pattern
- IIFE memoization pattern
- Functional style with companion utils

### Nav/sidenav semantic markup

Decided to wrap nav and sidenav in semantic HTML elements:

- `<header>` wraps `<nx-nav>`
- `<nav>` wraps `<nx-sidenav>` — gives `navigation` landmark for free
- header and nav are siblings in the DOM
- Skipping `aria-label` on `<nav>` unless multiple nav landmarks are needed

## 2026-03-22

### AGENTS.md expanded

- Added Adobe Spectrum design language section — Nexter uses Spectrum _design_ but not Spectrum libraries. Reference sites: express.adobe.com, experience.adobe.com.
- Added light/dark mode as a hard requirement with `light-dark()` CSS tip.
- Expanded lazy loading strategies: DOM-first hydrate-later, event-driven loading.
- Added iframe/customer code isolation convention (`setInterval` polling over `setTimeout`).
- Renamed "sidecar" utils to "companion" utils.

### CLAUDE.md & WORKLOG.md workflow

- Added `CLAUDE.md` instruction to read AGENTS.md for conventions.
- Added worklog trimming rule: delete git-recoverable info, condense completed work, keep open questions and key decisions.

### README.md updated

- Added "Context" section linking to AGENTS.md and WORKLOG.md with descriptions.

## 2026-04-02

### nx2 `blocks/panel/` (app-frame side panels)

- Added `panel.js`: Lit `nx-panel` (shadow shell, default slot, resize handle in shadow), `createPanel` / `showPanel` (`{ width, beforeMain }`), `setPanelsGrid` for app-frame column/area CSS vars. Shell is `aside.panel` with `data-position` before/after main; `createPanel` / `showPanel` return the `nx-panel` element. Empty `aside` after removing `nx-panel` is dropped in `disconnectedCallback`.
- `decorate(block)`: if the block has an anchor → `loadFragment(a.href)` → `createPanel`, move fragment children onto `nx-panel` with DOM APIs, remove the block.
- Styling split: `styles.css` keeps app-frame grid (`--app-frame-*`, `body.app-frame` row); `panel.css` holds panel surface and resize affordance.
- Mobile-first: default `body.app-frame` uses fixed panel insets + `:has(aside.panel)::before` scrim; `@media (width >= 600px)` restores grid layout and clears modal positioning. `setPanelsGrid` always sets `--app-frame-*` (only applied at 600px+).

## 2026-04-03

### utils.js rewrite — multi-environment DA service config

- Replaced stub `DA_ORIGIN`/`daFetch` exports with real environment-aware origins for DA services (admin, collab, content, preview, etc.).
- `getEnv(key, envs)` resolves origin per service: checks query param → localStorage → default (stage for dev/stage, prod for prod).
- Removed `HashController` reactive controller; sidenav no longer uses it.
- `parseWindowPath` now returns `null` for missing/invalid hashes and strips trailing `/index` from hash.

### New api.js — extracted API layer

- `daFetch` handles auth token injection, checks URL against `ALLOWED_TOKEN` origins before attaching bearer.
- `ping`, `source`, `list`, `signout` — thin wrappers for DA/AEM endpoints.
- Profile block now imports `signout` from api.js instead of inlining the fetch.

### CSS: class selectors → meta-content selectors

- Spectrum Edge and app-frame layouts no longer rely on JS adding classes (`spectrum-edge`, `app-frame`).
- Replaced with `html:has(meta[content="edge-delivery"])` and `html:has(meta[content="app-frame"])` — pure CSS, no JS decoration needed.
- Removed `spectrum-edge` class addition from `decorateDoc` in nx.js.
- App-frame grid extracted to its own top-level rule block.

### profile.js — handleScheme simplification

- Color scheme toggle simplified: remove both classes, add the toggled one. No intermediate object.

### AGENTS.md — "parse, don't validate" convention

- Added to JS conventions section. Core idea: push validation to the boundary where data enters, return `null` or a well-formed result — no ambiguous middle ground. Downstream code trusts the shape without re-checking.
- Codifies the distinct meaning of `null` (absent), `undefined` (not yet loaded), and `''` (explicitly cleared).
- `parseWindowPath` is the canonical example: returns a clean `{ view, org, site, path }` or `null`.

## 2026-05-07

### nx2/utils/api.js — namespaced helpers + Helix 6 endpoint coverage
- Replaced flat exports (`getSource`, `putSource`, etc.) with namespaced objects: `source`, `versions`, `config`, `org`, `status`, `aem` (combined preview + live), `log`, `snapshot`, `jobs`. Low-level primitives (`daFetch`, `isHlx6`, `signout`, `hlx6ToDaList`) stay top-level.
- Two private URL builders: `getDaApiPath` for DA ↔ AEM endpoints (source/list/config/versions), `getAemApiPath` for AEM-only endpoints. AEM-only legacy fallback hits `HLX_ADMIN` with hardcoded `ref=main`.
- Bulk endpoints inlined: `status.get`, `aem.preview`/`unPreview`/`publish`/`unPublish`, `snapshot.addPath`/`removePath` accept `daPath` as string or array. Array of length ≥ 2 dispatches to `/*` with JSON body `{ paths, delete? }`.
- hlx6-only methods (`source.copy`/`move`, `versions.get`, `org.listSites`, `config.getAggregated`, `jobs.test`) return `{ error, status: 501 }` on legacy.
- IMS import refactored from doubly-dynamic IIFE to relative `import { loadIms, handleSignIn } from './ims.js';` — same production behavior, no top-level await, lets the wtr importmap mock cleanly.
- Snapshots: new API uses plural `/snapshots/{path}`, legacy uses singular `/snapshot/{org}/{site}/main{path}` — handled in `getAemApiPath`. Same singular/plural switch for `jobs`/`job`.
- Migrated `nx/blocks/importer/index.js` from `putSource` to `source.put`.
- New tests at `test/nx2/utils/api.test.js` (68 tests) covering daFetch, isHlx6, every namespace method, bulk dispatcher, hlx6-only short-circuits, hlx6ToDaList, signout. Added `/nx2/utils/ims.js` → `/nx2/test/mocks/ims.js` to the top-level `web-test-runner.config.mjs` importmap.

### Out of scope
- `code`, `cache`, `index`, `sitemap`, `media`, `discover` namespaces — explicitly skipped.
- Login/logout/profile, config sub-namespaces (users/secrets/apikeys/tokens), nested config, profile config, org profiles — DA uses IMS, none of these are needed in the DA flow.
- `versions.get` legacy — DA's versionsource get-by-id pattern isn't documented and existing repo usage only has POST-to-create. Marked hlx6-only with 501 on legacy.

## 2026-04-08

### nx2 canvas — split toggle moved into panel chrome

- Canvas chat/tool panels get the same split-left / split-right control as `nx-canvas-header`, placed top-right inside `.panel-body`; the header copy is hidden while that side's panel is visible. `restorePanels` still fires `nx-panels-restored` so restored panels get the bar.

### nx2 canvas — panel toggling owned by `canvas.js`

- `toggleCanvasPanel` and fragment URLs live in `blocks/canvas/canvas.js`; `nx-canvas-header` dispatches `nx-canvas-toggle-panel` (`detail.position`: `before` | `after`, aligned with `aside.panel[data-position]`) and the decorate step listens on the host.

### nx2 canvas block — load `canvas.css`

- `canvas.js` now calls `loadStyle(import.meta.url)` and adopts the sheet on `document` once (deduped), matching nx's automatic block CSS for light-DOM rules (e.g. `.fragment-content`).

### nx2 doc editor (canvas migration, no toolbar / no quick-edit)
- **`nx2/utils/daFetch.js`**: `DA_ORIGIN`, `COLLAB_ORIGIN`, `CON_ORIGIN`, `AEM_ORIGIN` with `?da-admin=` / localStorage overrides (aligned with da-live); `daFetch` attaches bearer for allowlisted admin/content/AEM URLs. **`utils.js`** re-exports `DA_ORIGIN` and `daFetch`; **profile** imports from `daFetch.js`.
- **Deps**: `da-y-wrapper` + `da-parser` dist copied from da-live into `nx2/deps/…`; **`head.html`** importmap; **`npm run nx2:copy:editor-deps`** (`nx2/scripts/copy-editor-deps.mjs`, optional `DA_LIVE_ROOT`).
- **Superseded 2026-04-09** — see **nx-editor-doc** / **nx-editor-wysiwyg** below (renamed from `nx-doc-editor` / `nx-wysiwyg-frame`; `prose.js` + `extraPlugins`; quick-edit + preview utils under wysiwyg).

### nx2 canvas — quick-edit (controller=parent) WYSIWYG
- **Superseded 2026-04-09** — structure was `nx-doc-editor` + `nx-wysiwyg-frame`; see next section.

## 2026-04-17

### nx2 canvas — selection toolbar block types + inline code
- **`selection-toolbar.js`**: “Change into” picker includes **Code block** (`setBlockType(code_block)`); new **Inline code** toggle uses the schema `code` mark (`toggleMarkOnSelection`). Toolbar order: block-type picker, then mark buttons, then structure actions (separators between groups).
- **`canvas.css`**: monospace styling for the inline-code toolbar button.

## 2026-04-14

### nx2 canvas — PR #351 review follow-up
- **`canvas.js`**: `nx-canvas-editor-active` on the mount root replaces direct `hidden` toggling on `nx-editor-doc` / `nx-editor-wysiwyg`; each editor listens on `parentElement` and updates its own visibility (wysiwyg still gates on `data-nx-wysiwyg-port-ready`).
- **`nx-editor-wysiwyg`**: close unused parent-side `MessageChannel` ports before each init retry and on disconnect; keep the port handed to `nx-editor-doc` open.
- **`nx-editor-doc`**: `port.close()` when clearing the quick-edit controller port.

### nx2 canvas — document paths without `.html`
- Hash / `ctx.path` is `org/site/...` with no `.html` suffix; **`buildSourceUrl`** no longer appends `.html`**. Quick-edit pathname / iframe URL / controller pathname use the path segments as-is (removed `.replace(/\.html$/i)`); **`image.js`** `getPageName` no longer strips `.html`.

## 2026-04-09

### nx2 canvas — editor layout rename + file split
- **`nx2/blocks/canvas/nx-editor-doc/`**: `nx-editor-doc` Lit element + CSS; **`prose.js`** — Yjs + ProseMirror init only, `extraPlugins` for injected plugins; **`utils/source.js`** (source URL, HEAD permissions); **`utils/collab.js`** (awareness color + identity).
- **`nx2/blocks/canvas/nx-editor-wysiwyg/`**: `nx-editor-wysiwyg` Lit iframe + cookie + MessageChannel; **`quick-edit-controller.js`** (MessagePort → ProseMirror).
- **`nx2/blocks/canvas/editor-utils/`** (2026-04-14): shared editor plumbing — **`preview.js`**, **`document.js`**, **`state.js`**; **`prose-diff.js`** (`createTrackingPlugin`, doc diff helpers for ProseMirror → iframe sync; wired from `nx-editor-doc.js` into `initProse`).
- **`canvas.js` / `canvas.css`**: lazy-import `nx-editor-doc` + `nx-editor-wysiwyg`; `nx-editor-doc` listens on `parentElement` for `nx-wysiwyg-port-ready` and sets `quickEditPort`.

## 2026-04-04

### Panel-aware default-content max-width

- When either side panel is visible (`aside.panel:not([hidden])`), `.default-content` inside `main` now uses `max-width: 83.4%` instead of the fixed `--se-grid-container-width` value.
- Uses sibling selectors: `main:has(~ aside.panel:not([hidden]))` for panels after main, `aside.panel:not([hidden]) ~ main` for panels before main.
- The fixed `1200px` media query (`@media (width >= 1440px)`) remains for the no-panel case.

## 2026-05-13

### `replaceHtml` da-metadata serialization
- `replaceHtml` was interpolating `${value}` directly into the `<div class="da-metadata">` rows. `getElementMetadata` returns values as `{ content, text }` objects, so any caller that round-tripped existing metadata (`rolloutCopy`, `mergeCopy`) wrote `[object Object]` into the saved HTML.
- Fix unwraps `value.text` when present, falls back to the raw value, and emits `''` for nullish — so the function handles both shapes (object from `getElementMetadata`, plain string from `daMetadata['diff-label-local'] = labelLocal`).
- Kept `getElementMetadata`'s `{ content, text }` shape since `regional-diff` callers use `.content` (the DOM element) directly for diffing.

## 2026-04-14

### nx2 chat — tool approval UI

- Approval popover: persistent `nx-popover` (added `persistent` flag to skip light-dismiss) positioned above the chat form via `getBoundingClientRect()` on the host element. Auto-shows/closes in `updated()` when `toolCards` changes.
- Approval card (`renderApprovalCard` in `renderers.js`): tool name, summary line, three action buttons (Reject/Always approve/Approve) with `<kbd>` shortcut hints.
- Approval summary priority: `humanReadableSummary` → `sourcePath→destinationPath` → `path` → `skillId` → `name`. `content` excluded. Field names extracted to `TOOL_INPUT` in `constants.js` (same TODO as `AGENT_EVENT`).
- Auto-approve: if tool is in `_autoApprovedTools`, card goes straight to `approved` state — skips `approval-requested` entirely to avoid flash.
- "Always approve" is conversation-scoped — resets on `clear()` only, not per message.
- Conversation history keyed by `org--site--userId` — site-scoped, not path-scoped.
- Agent stream contract and persistence model documented in `docs/chat-ui-component.md`.

## 2026-08-31

### chat-ao — bridge (CMA) WS override

- `?ao=<origin>` override in `resolveAoWsBase`/`resolveAoHttpBase`
  ([uploads.js](nx2/blocks/chat-ao/utils/uploads.js)) routes chat through the
  claudebridge (CMA) instead of Agent Orchestrator. Origin allowlisted to
  `localhost`/`*.adobe.io`/`*.adobe.net`/`*.corp.adobe.com` because the AUTH
  frame carries the IMS bearer token; bare host defaults to `wss`/`https`.
- Deployed bridge: `wss://aem-sites-claudebridge-dev-va6.adobe.io` (Ethos112
  stage va6, corp/VPN only) → CMA workspace/agent/env `ew-dev` (us-east-1).
- Team how-to: `docs/chat-ao-bridge-override.md`.
- Note: full pre-commit suite has a rare concurrency flake (1 test, not
  reproducible in isolation, ~1 in several runs); unrelated to this change.
