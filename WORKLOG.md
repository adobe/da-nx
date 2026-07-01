# Worklog

## 2026-07-01 (feat/skill-scripts-runtime — eslint clean-up)

### Fix 16 ESLint errors so `npm run lint` exits 0

- `chat-controller.js`: renamed destructure binding `_removed` → `_` (no-unused-vars)
- `skill-script-roundtrip.test.js`: removed dead `fireSkillToolCall` + `stubResolveAndRun` helpers; `let updates` → `const`; dropped unused `runResult` param; wrapped all six `new Promise((resolve) => setTimeout(...))` calls in braces (no-promise-executor-return); shortened overlong comment (max-len)
- `skill-script-loader.test.js`: split `mockFetch` param list onto multiple lines (object-curly-newline); split ao-prefix fetch stub body (max-statements-per-line)
- `skill-script-e2e.test.js`: named the two anonymous async `function` expressions (func-names)

`npm run lint` → 0 errors (4 pre-existing glaas console warnings remain). All 1039 tests pass.

## 2026-06-30 (feat/skill-scripts-runtime — remove built-in skill)

### da-nx ships no skill content; skill body moved to a test fixture

Under the marketplace model, skills live in the curated GH marketplace, not in
da-nx. Removed the PoC leftover `nx2/blocks/chat/skills-builtin/docx-to-markdown/`
(skill.md, manifest.js, scripts/convert.js) entirely. The `convert()` body that the
substrate + real-worker e2e tests need was moved to a test-only fixture at
`test/fixtures/skill-scripts/docx-convert.js`; `skill-runtime.test.js` and
`skill-script-e2e.test.js` now reference the fixture. Net: the PR carries only the
runtime + marketplace resolver + the host-provided `fflate` dep — no skill.

## 2026-06-30 (harden/worker-neuter-storage)

### Explicitly neuter localStorage / sessionStorage / document in worker-host.js

Extended the `neuter(self, prop)` block in `WORKER_BOOTSTRAP` to also neuter three additional globals:
- `localStorage`
- `sessionStorage`
- `document` (covers `document.cookie`)

These are absent in a dedicated Web Worker by spec today, but neutering them explicitly makes the guarantee enforce-by-construction: if the bootstrap ever runs in a non-Worker isolate or a future runtime that exposes them, the guarantee holds without relying on spec defaults.

**Files changed:**
- `nx2/utils/skill-runtime/worker-host.js` — three new `neuter(self, ...)` calls after `caches` / `Notification`
- `test/nx2/utils/skill-runtime/skill-runtime.test.js` — added `sessionStorage` test; strengthened `localStorage` + `document` comments to note explicit neutering (enforce-by-construction)

**Test count:** 1036 passed, 0 failed (up from 1035).

## 2026-06-29 (skill-script-runtime + marketplace design)

### Landed on feat/da-skill-script-runtime

- **`fix(skill-runtime)`** — `runner.js`: resolve DEPENDENCY_ALLOWLIST URLs against `import.meta.url` (the nx2 module origin) instead of `globalThis.location.origin` (the page origin). Fixes dep loading when da-nx is served from a different origin than the consuming page (e.g. da-live :3000 vs da-nx :6456 locally).
- **`feat(chat)`** — `chat.js`: added `.docx` / `application/vnd.openxmlformats-officedocument.wordprocessingml.document` to both the `<input accept>` attribute and the `_onDrop` filter, so Word documents are accepted in the attachment picker.
- **`docs(skill-runtime)`** — `docs/skill-script-runtime.md`: added §8 marketplace provider interface + swappable implementations (`GitHubMarketplaceProvider`, `ConfigSheetMarketplaceProvider`, `AOMarketplaceProvider`); §9 backwards-compat frozen contract + characterization-test strategy; §10 security model table (network, storage, credentials, capability gating, dependency allowlist, exfiltration); §11 migration path with today/tomorrow AO flow diagrams; §12 decisions on record.

## 2026-06-29 (security suite)

### §10 security matrix test suite (feat/da-skill-script-runtime)

Added a focused security test suite asserting every row of the §10 security matrix in `docs/skill-script-runtime.md`. All 1035 tests pass.

**Coverage before → after:**
- No network (fetch): already covered → extended to full set (XMLHttpRequest, WebSocket, importScripts, navigator.sendBeacon)
- No exfiltration: new — skill calling fetch() errors rather than completing
- No storage: new — indexedDB, caches, localStorage each asserted undefined in worker
- No document/cookies: new — document undefined; document.cookie access throws
- No credentials/PII: new — Object.keys(host) asserted to be exactly ['deps', 'log']; explicit deny list for token/ims/session/auth/credential/secret/apiKey
- Capability gating: already covered (section 2)
- Dependency allowlist: already covered (section 6)
- Marketplace-only resolution: extended — all fetched URLs asserted under raw.githubusercontent.com; ao: prefix verified to make zero fetch calls; path traversal (../...) asserted to stay under marketplace host

**No substrate changes needed** — all properties held by construction (Worker spec excludes localStorage/document; worker-host.js neuters network/storage globals; runner.js builds host with only log+deps).

**Files changed:**
- `test/nx2/utils/skill-runtime/skill-runtime.test.js` — +14 security tests in 4 describe blocks
- `test/nx2/blocks/chat/utils/skill-script-loader.test.js` — +3 marketplace-only security tests

## 2026-06-29

### attachmentRef → bytes resolution for script-skills (feat/da-skill-script-runtime)

`_onToolEvent` `skill_run_script` branch in `chat-controller.js` now resolves an attachment reference entirely client-side before calling `runSkillScript`:

- If `input.attachmentRef` is set, find the attachment in `this._pendingAttachments` by `id`.
  - Found: build `effectiveInput` with `bytesBase64` (from `dataBase64`), `fileName`, `mediaType`; remove `attachmentRef`; other `skillInput` fields survive unchanged.
  - Not found: record `{ error: 'attachment <ref> not found' }` via `_recordSkillResult`, call `_done()`, return — skill is not run.
- No `attachmentRef`: `skillInput` passes through unchanged.
- Bytes come exclusively from `_pendingAttachments`; agent args never supply bytes — security invariant preserved.

**Tests added:** 1021 total (+3).
- `skill-script-roundtrip.test.js` — missing attachment → ERROR; no attachmentRef → passthrough.
- `skill-script-e2e.test.js` — real worker, real `scripts/convert.js`, real fflate, real docx fixture supplied via `attachmentRef` → markdown contains fixture text.

---

### Fix marketplace skill URL namespace (feat/da-skill-script-runtime)

`MARKETPLACE_RAW_BASE` in `skill-script-loader.js` was missing the `/ew` namespace segment, causing skill fetches to resolve to the wrong path. Updated constant from `.../main` to `.../main/ew`. Updated `GH_RAW_BASE` in `skill-script-loader.test.js` to match. All 1018 tests pass.

---

### scripts/ layout + host-injected dependencies (feat/da-skill-script-runtime)

Two refinements on top of the GH-marketplace rework.

**scripts/ layout:** marketplace skills store code at `<skillId>/scripts/<entry>.<ext>` (not flat alongside `skill.md`). `resolveSkill` now builds the script URL from `execution_entry` + a runtime→ext map (`js` → `.js`). `skill.md` stays at `<skillId>/skill.md`.

**Host-injected dependencies:** skills declare deps via `execution_dependencies: fflate` (comma-separated flat field). `parseSkillFrontmatter` parses into `dependencies: string[]` on the manifest. `worker-host.js` exports `DEPENDENCY_ALLOWLIST = { fflate: '/nx2/deps/fflate/dist/index.js' }`. `runner.js` resolves allowlist paths to absolute (blob-URL workers can't resolve root-relative paths) and sends `{ dependencies, allowlist }` to the worker. The worker `await import(allowlist[name])`s each dep into `host.deps[name]`; any dep not in the allowlist returns `{ error: 'dependency "..." not allowed' }` before running. `scripts/convert.js` uses `host.deps.fflate` — no host path import.

**Key fix:** allowlist URLs must be absolute before `postMessage` — worker blob-URL origin can't resolve `/nx2/...` relative paths. `new URL(url, globalThis.location?.origin).href` in `runner.js` handles this.

**Tests added/updated:**
- `skill-script-loader.test.js` — `execution_dependencies` parsing (single, multi, absent, blank); script URL now asserts `scripts/convert.js` path.
- `skill-runtime.test.js` — non-allowlisted dep refusal (`{ error: '... not allowed' }`); `convert()` tests updated to use `host.deps.fflate` host.
- `skill-script-e2e.test.js` — `REAL_SKILL_MD` updated with `execution_dependencies: fflate`; `REAL_SCRIPT_URL` points to `scripts/convert.js`; fetch stub intercepts `/scripts/` path.
- All 1018 tests passing.

**Security invariant:** no skill can import arbitrary URLs; the worker only loads from the vetted allowlist. Same security-by-construction principle as neutered ambient globals.

## 2026-06-27

### Resolve script-skills from curated GH marketplace, not .da/skills (feat/da-skill-script-runtime)

**Security rationale:** `.da/skills/` is user-writable content. Resolving a skill's manifest and script from there lets an attacker-controlled document substitute arbitrary code or a forged manifest. Script skills must be resolved from the curated, read-only GH marketplace only.

**What changed:**
- `nx2/blocks/chat/utils/skill-script-loader.js` — `resolveSkill` now fetches from `MARKETPLACE_RAW_BASE` (`https://raw.githubusercontent.com/exp-workspace/skills/main`, TODO: adobe/skills once PR lands). No org/site argument — the marketplace is global. Fetches `skill.md` (parses trusted frontmatter) then `script.js` as text, converts to a `Blob` with `type: 'text/javascript'` and returns `URL.createObjectURL(blob)` as `moduleUrl`. This is required because `raw.githubusercontent.com` serves `text/plain`, which browsers reject for ES module `import()`. Removed the DA Admin `.da/skills` path entirely.
- `nx2/blocks/chat/chat-controller.js` — `_onToolEvent` `skill_run_script` branch: removed `{ org, site }` argument from `resolveSkill` call (no longer needed).
- `test/nx2/blocks/chat/utils/skill-script-loader.test.js` — rewritten: stubs GH raw URLs (`skill.md` + `script.js`); asserts blob URL returned; verifies both marketplace URLs fetched; drops org/site from all `resolveSkill` calls; new test confirms no org/site needed; kept all frontmatter parsing and error tests.
- `test/nx2/blocks/chat/skill-script-roundtrip.test.js` — fetch stub updated to return `'export function run() {}'` for `script.js` URLs (marketplace JS payload for blob URL creation).
- `test/nx2/blocks/chat/skill-script-e2e.test.js` — `buildController` fetch stub updated to handle `script.js` with dummy JS; happy-path still uses real localhost `moduleUrl` via `_onToolEvent` replacement (unchanged); eligibility and security tests now complete the full `resolveSkill` including script.js fetch.

**Security invariant preserved:** `isClientEligible` runs on the manifest fetched from MARKETPLACE (trusted). Agent-supplied capability hints are still ignored. Security test still passes (1011/1011).

**Key detail:** blob URL pattern is required because browsers enforce `text/javascript` MIME for module workers — raw GitHub cannot serve that MIME type. The blob is created client-side from the fetched text, so the MIME is correct and `import()` succeeds.

### Skill-script execution substrate (feat/da-skill-script-runtime)

Platform capability — NOT a docx feature; docx is the proof case.

**What shipped:**
- `nx2/utils/skill-runtime/` — public platform API: `runSkillScript({ manifest, moduleUrl, input })`, `isClientEligible(capabilities)`, capability constants (NETWORK/SECRETS/PII/STORAGE).
- Client eligibility enforced by construction: `capabilities: []` → runs in a sandboxed blob-URL module worker; any non-empty capabilities → `{ error: 'requires server runtime' }` (drop-in seam for future SANDBOX server runner).
- Worker bootstrap (`worker-host.js`) neuters `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`, `indexedDB`, `caches`, `Notification`, `navigator.sendBeacon` before loading any skill module. The worker's `host` exposes only a buffered `log(...)`.
- `nx2/deps/fflate/` — bundled ESM dep (src + dist, `nx2:build:fflate` script).
- `nx2/blocks/chat/skills-builtin/docx-to-markdown/` — proof skill: pure ECMAScript + lazy fflate; extracts `<w:t>` nodes from `word/document.xml` + header/footer XML, unescapes XML entities, returns `{ markdown }`.
- 9 tests all passing: eligibility, server-runtime gate, pure worker execution, ambient-global neutering (fetch undefined in worker), timeout, docx round-trip, entity unescape, corrupt-input → `{ error }`.

**Key decisions:**
- JSON-serializable I/O only — contract is language-neutral; future Python mirror is `def entry(input, host): return output`.
- SANDBOX runner seam is a comment block in `runner.js` at the strategy point — same caller shape, no caller changes when server runner lands.
- `convert` tests run in-process (pure function); worker integration tests use blob-URL inline skills to avoid CDN dependency in CI.

**Out of scope (not done):** chat attachment wiring; Python AO runtime; server SANDBOX runner.

### Agent-triggered skill-script orchestration round-trip (same branch)

Completes the agent-triggered execution path documented in §5.2.1 of `docs/skill-script-runtime.md`.

**What shipped:**
- `nx2/blocks/chat/utils/skill-script-loader.js` — trusted manifest resolver: fetches `${DA_ADMIN}/source/${org}/${site}/.da/skills/${id}/skill.md`, parses flat `execution_*` frontmatter (using `[ \t]*` not `\s*` to avoid consuming newlines), resolves the `script.js` module URL. AO marketplace prefix (`ao:`) reserved as an error seam.
- `chat-controller.js` — `_onToolEvent` intercepts `skill_run_script` TOOL_CALL: resolves trusted manifest client-side, enforces `isClientEligible` from the manifest (agent args never decide capabilities), calls `runSkillScript`, records result via `_recordSkillResult` (virtual-message pattern), re-engages agent via `_stream` on success so it continues reasoning. On error (resolve failure, non-client-eligible, script error) records an ERROR virtual message and calls `_done()`.
- `_recordSkillResult` helper — encapsulates virtual-message append + tool-card state update; reusable for future client tools.
- `nx2/blocks/chat/skills-builtin/docx-to-markdown/skill.md` — real skill artifact with flat `execution_*` frontmatter; seed file for `.da/skills/docx-to-markdown/`.

**Tests:**
- `test/nx2/blocks/chat/utils/skill-script-loader.test.js` — frontmatter parsing (all fields, empty capabilities, blank capabilities, default timeout, no frontmatter, missing entry, multi-runtime); resolve happy path, 404, missing skillId, missing context, ao: prefix.
- `test/nx2/blocks/chat/skill-script-roundtrip.test.js` — TOOL_CALL → record → tool card state; server-runtime gate (non-empty capabilities → ERROR, no execution); resolve error propagation; **security test** (capability hint in agent args ignored — manifest decides); virtual-message expansion in `_messagesForAgent`.
- 1006 tests all passing.

**Key decisions:**
- `[ \t]*` in frontmatter regex (not `\s*`) — `\s*` consumes newlines and would match the next YAML key's value. Caught by tests.
- Worker errors (external module URL not served in WTR) settle gracefully as `{ error }` via `worker.onerror` — the round-trip test verifies the card leaves RUNNING regardless.
- `_recordSkillResult` is a regular prototype method (not arrow field) so tests can patch it on instances.

**Out of scope (still):** chat attachment wiring for client-triggered path; AO marketplace skill resolution; server SANDBOX runner.

### E2E skill-script round-trip test (same branch)

**What shipped:**
- `test/nx2/blocks/chat/skill-script-e2e.test.js` — three test cases that prove the full client execution path with the real sandboxed worker:
  1. **Happy path** — real worker + real `script.js` (loaded via `localhost` URL served by WTR) + real `.docx` fixture (built with fflate `zipSync`) → asserts `card.state === DONE`, virtual message recorded, `_messagesForAgent()` expands to ASSISTANT/TOOL pair with `markdown` containing `"hello e2e"`.
  2. **Eligibility gate** — `execution_capabilities: network` in served skill.md → `card.state === ERROR`, `output.error === 'requires server runtime'`, worker never spun up.
  3. **Security** — agent passes `capabilities: []` hint in tool args; manifest has `network` → manifest wins, same server-runtime error.

**What is real vs simulated:**
- Real: `runSkillScript`, worker bootstrap, `script.js` (WTR serves at localhost), fflate import chain, manifest parsing, `_recordSkillResult`, `_messagesForAgent`, tool card state.
- Simulated: `fetch` for `skill.md` (returns real skill.md bytes, no DA Admin needed); `_stream` (resolves immediately, no live LLM); `moduleUrl` redirected from DA Admin URL to localhost script path (only seam available — `DA_ADMIN` is a closed-over constant in `resolveSkill`, unreachable via fetch stub).

**Adaptation:** `_onToolEvent` is replaced on the controller instance for the happy-path test to supply a localhost `moduleUrl`. All other logic — eligibility check, worker creation, script execution — runs real. Tests 2 & 3 use the real `_onToolEvent`.

## 2026-06-29

### nx2/blocks/chat/renderers.js — empty directive body fix (fix/chat-empty-directive-render branch)

Pre-existing bug: when a chat directive block had an empty body, `hastToDom` returned a `Document` node. Lit's `insertBefore` cannot insert a `Document`, throwing a `HierarchyRequestError`. Fix: in `toDOM()`, after `hastToDom`, detect `Node.DOCUMENT_NODE` and extract its `body` children into a `DocumentFragment` before returning. Three regression tests added.

Cherry-picked from `6e02f889` onto a clean `main`-based branch.

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
