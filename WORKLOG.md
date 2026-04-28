# Worklog

## 2026-04-28

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

## 2026-04-14

### nx2 chat — tool approval UI

- Approval popover: persistent `nx-popover` (added `persistent` flag to skip light-dismiss) positioned above the chat form via `getBoundingClientRect()` on the host element. Auto-shows/closes in `updated()` when `toolCards` changes.
- Approval card (`renderApprovalCard` in `renderers.js`): tool name, summary line, three action buttons (Reject/Always approve/Approve) with `<kbd>` shortcut hints.
- Approval summary priority: `humanReadableSummary` → `sourcePath→destinationPath` → `path` → `skillId` → `name`. `content` excluded. Field names extracted to `TOOL_INPUT` in `constants.js` (same TODO as `AGENT_EVENT`).
- Auto-approve: if tool is in `_autoApprovedTools`, card goes straight to `approved` state — skips `approval-requested` entirely to avoid flash.
- "Always approve" is conversation-scoped — resets on `clear()` only, not per message.
- Conversation history keyed by `org--site--userId` — site-scoped, not path-scoped.
- Agent stream contract and persistence model documented in `docs/chat-ui-component.md`.
