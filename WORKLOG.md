# Worklog

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
- Added Adobe Spectrum design language section — Nexter uses Spectrum *design* but not Spectrum libraries. Reference sites: express.adobe.com, experience.adobe.com.
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
