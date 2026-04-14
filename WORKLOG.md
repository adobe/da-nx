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
## 2026-04-08

### nx2 canvas — split toggle moved into panel chrome
- Canvas chat/tool panels get the same split-left / split-right control as `nx-canvas-header`, placed top-right inside `.panel-body`; the header copy is hidden while that side’s panel is visible. `restorePanels` still fires `nx-panels-restored` so restored panels get the bar.

### nx2 canvas — panel toggling owned by `canvas.js`
- `toggleCanvasPanel` and fragment URLs live in `blocks/canvas/canvas.js`; `nx-canvas-header` dispatches `nx-canvas-toggle-panel` (`detail.position`: `before` | `after`, aligned with `aside.panel[data-position]`) and the decorate step listens on the host.

### nx2 canvas block — load `canvas.css`
- `canvas.js` now calls `loadStyle(import.meta.url)` and adopts the sheet on `document` once (deduped), matching nx’s automatic block CSS for light-DOM rules (e.g. `.fragment-content`).

### nx2 doc editor (canvas migration, no toolbar / no quick-edit)
- **`nx2/utils/daFetch.js`**: `DA_ORIGIN`, `COLLAB_ORIGIN`, `CON_ORIGIN`, `AEM_ORIGIN` with `?da-admin=` / localStorage overrides (aligned with da-live); `daFetch` attaches bearer for allowlisted admin/content/AEM URLs. **`utils.js`** re-exports `DA_ORIGIN` and `daFetch`; **profile** imports from `daFetch.js`.
- **Deps**: `da-y-wrapper` + `da-parser` dist copied from da-live into `nx2/deps/…`; **`head.html`** importmap; **`npm run nx2:copy:editor-deps`** (`nx2/scripts/copy-editor-deps.mjs`, optional `DA_LIVE_ROOT`).
- **Superseded 2026-04-09** — see **nx-editor-doc** / **nx-editor-wysiwyg** below (renamed from `nx-doc-editor` / `nx-wysiwyg-frame`; `prose.js` + `extraPlugins`; quick-edit + preview utils under wysiwyg).

### nx2 canvas — quick-edit (controller=parent) WYSIWYG
- **Superseded 2026-04-09** — structure was `nx-doc-editor` + `nx-wysiwyg-frame`; see next section.

## 2026-04-14

### nx2 canvas — PR #351 review follow-up
- **`canvas.js`**: `nx-canvas-editor-active` on the mount root replaces direct `hidden` toggling on `nx-editor-doc` / `nx-editor-wysiwyg`; each editor listens on `parentElement` and updates its own visibility (wysiwyg still gates on `data-nx-wysiwyg-port-ready`).
- **`nx-editor-wysiwyg`**: close unused parent-side `MessageChannel` ports before each init retry and on disconnect; keep the port handed to `nx-editor-doc` open.
- **`nx-editor-doc`**: `port.close()` when clearing the quick-edit controller port.

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
