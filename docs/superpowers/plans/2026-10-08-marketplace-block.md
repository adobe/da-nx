# Marketplace Block Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an nx2 `marketplace` block that renders a card grid of DA / Experience Workspace extensions from `/apps/marketplace.json`, each with a type badge and a "Learn more" link opening in a new tab.

**Architecture:** A pure data util (`marketplace-utils.js`) fetches and normalizes sheet rows into safe card items and returns `{ items }` or `{ error, status }`. A Lit web component (`<nx-marketplace>`, in `marketplace.js`) loads the util result and renders loading / error / empty / grid states in shadow DOM. The block `init(el)` just mounts the component.

**Tech Stack:** Vanilla ESM, Lit (`da-lit` import map), web-test-runner + `@esm-bundle/chai`, S2 CSS tokens from `nx2/styles/styles.css`, button classes from `nx2/styles/buttons.css`.

**Spec:** `docs/superpowers/specs/2026-10-08-marketplace-block-design.md`

## Global Constraints

- All code lives in `nx2/blocks/marketplace/`; tests in `test/nx2/blocks/marketplace/`.
- Data path: `MARKETPLACE_PATH = '/apps/marketplace.json'`, resolved against `window.location.origin`. Plain `fetch`, no auth.
- Sheet columns: `Title`, `Description`, `Path`, `Type`, `Image` (`Date` ignored).
- Only `http:` / `https:` URLs are used for link `href` and image `src`.
- CTA copy: `Learn more`; `target="_blank"`, `rel="noopener noreferrer"`, `aria-label="Learn more about {title}"`.
- Empty copy: `No extensions available.` Error copy: `Could not load marketplace.`
- No HTML string templating — Lit templates only.
- Light + dark mode via `light-dark()`; S2 tokens only (e.g. `--s2-spacing-600`, `--s2-corner-radius-500`, `--s2-gray-*`).
- Exported functions with 2+ args use destructured object params.
- Commits: Conventional Commits; final PR title `feat(marketplace): add marketplace block`.

## Review Focus

- Sheet cells with surrounding whitespace (`"  MSM  "`, `" https://… "`) → values trimmed, row kept. (Task 1 test)
- `Image` holding `javascript:` / `data:` or garbage → `imageHref` is `undefined`, placeholder rendered, no broken `<img>`. (Task 1 + Task 2 tests)
- Empty or missing `Type` → `types` is `[]` and no badge element renders. (Task 1 + Task 2 tests)
- Missing `Description` → empty string, never the text `undefined` in the card. (Task 1 test)
- Response is OK but body isn't JSON (e.g. an HTML 404 page served with 200) → error state, not an uncaught rejection. (Task 1 test)

---

### Task 1: Data util — normalize + fetch

**Files:**
- Create: `nx2/blocks/marketplace/marketplace-utils.js`
- Test: `test/nx2/blocks/marketplace/marketplace-utils.test.js`

**Interfaces:**
- Produces:
  - `export const MARKETPLACE_PATH = '/apps/marketplace.json'`
  - `export function normalizeItem({ row, origin })` → `{ title: string, description: string, href: string, types: string[], imageHref: string | undefined } | null`
  - `export async function fetchMarketplace({ origin })` → `Promise<{ items: Item[] } | { error: string, status?: number }>`

- [ ] **Step 1: Write the failing tests**

Use `origin = 'https://main--da-live--adobe.aem.page'`. Stub `window.fetch` with a restore in `afterEach` (pattern from `test/nx2/blocks/ew-actions/ew-actions.test.js` `installFetch`).

`describe('normalizeItem')`:
- `maps a full row` — row `{ Title: 'MSM', Description: 'Manage msm', Path: 'https://da.live/app/x/msm', Type: 'App & Plugin', Image: 'https://example.com/t.png' }` → deep equals `{ title: 'MSM', description: 'Manage msm', href: 'https://da.live/app/x/msm', types: ['App', 'Plugin'], imageHref: 'https://example.com/t.png' }`.
- `trims whitespace` — `Title: '  MSM  '`, `Path: ' https://da.live/a '` → `title === 'MSM'`, `href === 'https://da.live/a'`.
- `returns null without title` — `Title: ''` → `null`; `Title: '   '` → `null`.
- `returns null without path` — `Path: ''` → `null`.
- `returns null for non-http path` — `Path: 'javascript:alert(1)'` → `null`.
- `resolves relative path and image` — `Path: '/tools/x.html'`, `Image: '/media/t.png'` → `href === origin + '/tools/x.html'`, `imageHref === origin + '/media/t.png'`.
- `drops unsafe or empty image` — `Image: ''` → `imageHref === undefined`; `Image: 'data:image/png;base64,AA'` → `undefined`; `Image: 'javascript:x'` → `undefined`.
- `handles missing description and type` — no `Description`, no `Type` → `description === ''`, `types` deep equals `[]`.
- `splits single type` — `Type: 'Plugin'` → `['Plugin']`.

`describe('fetchMarketplace')`:
- `requests the marketplace path on the origin` — capture fetch arg; `String(arg) === origin + '/apps/marketplace.json'`.
- `returns normalized items, dropping invalid rows` — body `{ data: [validRow, { Title: '', Path: 'x' }] }` → `items.length === 1`, `items[0].title === validRow.Title`.
- `returns empty items when data missing` — body `{}` → deep equals `{ items: [] }`.
- `returns error with status on non-OK` — `new Response('', { status: 404 })` → `{ error: 'Could not load marketplace.', status: 404 }`.
- `returns error when fetch throws` — fetch rejects → `result.error === 'Could not load marketplace.'`, no `items`.
- `returns error when body is not JSON` — `new Response('<html>', { status: 200 })` → `result.error === 'Could not load marketplace.'`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:file -- test/nx2/blocks/marketplace/marketplace-utils.test.js`
Expected: FAIL — module `marketplace-utils.js` not found.

- [ ] **Step 3: Implement `marketplace-utils.js`**

- Private helper `toSafeHref({ value, origin })`: trim; empty → `undefined`; `new URL(value, origin)` in try/catch; return `.href` only if protocol is `http:`/`https:`, else `undefined`.
- `normalizeItem`: title = trimmed `Title`; `href = toSafeHref(Path)`; return `null` if either missing. `types = (row.Type ?? '').split('&').map(trim).filter(Boolean)`. `description = (row.Description ?? '').trim()`.
- `fetchMarketplace`: single try/catch around fetch + `resp.json()`; non-OK → `{ error, status: resp.status }`; `data` not an array → `{ items: [] }`; else `items = data.map((row) => normalizeItem({ row, origin })).filter(Boolean)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:file -- test/nx2/blocks/marketplace/marketplace-utils.test.js`
Expected: all PASS. Then `npx eslint nx2/blocks/marketplace test/nx2/blocks/marketplace` → no errors.

- [ ] **Step 5: Commit**

```bash
git add nx2/blocks/marketplace/marketplace-utils.js test/nx2/blocks/marketplace/marketplace-utils.test.js
git commit -m "feat(marketplace): add marketplace data util"
```

---

### Task 2: `<nx-marketplace>` component, block init, styles

**Files:**
- Create: `nx2/blocks/marketplace/marketplace.js`
- Create: `nx2/blocks/marketplace/marketplace.css`
- Test: `test/nx2/blocks/marketplace/marketplace.test.js`

**Interfaces:**
- Consumes: `fetchMarketplace({ origin })` from Task 1.
- Produces:
  - `export default function init(el)` — clears `el`, appends `<nx-marketplace>`.
  - Custom element `nx-marketplace` (class `NxMarketplace extends LitElement`), state `_items` (`undefined` while loading), `_error`.
  - Shadow DOM hooks used by tests: `.grid` (`ul`), `.card` (`li`), `.card h3`, `.card .badge`, `.card img`, `.card .placeholder`, `.card a.cta`, `.loading`, `.empty`, `.error`.

- [ ] **Step 1: Write the failing tests**

Stub `window.fetch` for URLs containing `/apps/marketplace.json`. Helper `waitForLoad(el)` that polls (`await el.updateComplete` in a loop, max ~50 × 10 ms) until `el._items !== undefined || el._error`, then `await el.updateComplete`. Mount via `init(div)` with the div appended to `document.body`; remove in `afterEach`.

- `init mounts nx-marketplace` — after `init(div)`, `div.children.length === 1` and `div.firstElementChild.localName === 'nx-marketplace'`; prior authored content removed.
- `shows loading state before data resolves` — fetch returns a never-resolving promise; after `updateComplete`, shadow has `.loading` and no `.grid`.
- `renders a card per valid row` — 3 rows (one invalid) → 2 `.card`; first card `h3.textContent === 'DA Permissions'`.
- `renders type badges` — row `Type: 'App & Plugin'` → its card has 2 `.badge` with texts `['App', 'Plugin']`; row with no `Type` → 0 `.badge`.
- `renders learn more link` — `a.cta`: `textContent.trim() === 'Learn more'`, `href` equals row `Path`, `target === '_blank'`, `rel === 'noopener noreferrer'`, `aria-label === 'Learn more about DA Permissions'`.
- `renders image or placeholder` — row with `Image: 'https://example.com/t.png'` → `img` with that `src` and `loading === 'lazy'`; row with `Image: ''` → `.placeholder` and no `img`; row with `Image: 'javascript:x'` → `.placeholder`.
- `shows empty message` — body `{ data: [] }` → `.empty` text `No extensions available.`
- `shows error message` — `Response('', { status: 500 })` → `.error` text `Could not load marketplace.`, no `.grid`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:file -- test/nx2/blocks/marketplace/marketplace.test.js`
Expected: FAIL — module `marketplace.js` not found.

- [ ] **Step 3: Implement `marketplace.js`**

- Top-level: `const style = await loadStyle(import.meta.url);` and `const buttonStyle = await loadStyle(new URL('../../styles/buttons.css', import.meta.url).href);` (same as `ew-actions.js`).
- `connectedCallback`: `super.connectedCallback()`, `this.shadowRoot.adoptedStyleSheets = [buttonStyle, style]`, then call private `_load()` (not awaited) which sets `_error` or `_items` from `fetchMarketplace({ origin: window.location.origin })`.
- `render()` order: `_error` → `<p class="error">`; `_items === undefined` → `<ul class="grid loading">` with 4 empty `<li class="card skeleton">`; empty → `<p class="empty">`; else `<ul class="grid">` of `_renderCard(item)`.
- `_renderCard`: `<li class="card">` → media (`img` with `alt=""` `loading="lazy"` or `<div class="placeholder">`) → `.content` (`h3`, `p` description, `.badges` with `.badge` spans only when `types.length`) → `<a class="cta nx-btn-primary" …>Learn more</a>`.
- `customElements.define('nx-marketplace', NxMarketplace)`.
- `export default function init(el) { el.replaceChildren(document.createElement('nx-marketplace')); }`

- [ ] **Step 4: Implement `marketplace.css`**

- `:host { display: block; margin-block-start: var(--s2-spacing-600); }`
- `.grid`: `list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: var(--s2-spacing-600);`
- `.card`: flex column, `border-radius: var(--s2-corner-radius-500)`, `overflow: hidden`, border `1px solid light-dark(var(--s2-gray-200), var(--s2-gray-300))`, background `light-dark(#fff, var(--s2-gray-75))`.
- `img`, `.placeholder`: `aspect-ratio: 16 / 9; width: 100%; object-fit: cover; display: block;` placeholder background `light-dark(var(--s2-gray-100), var(--s2-gray-200))`.
- `.content`: `padding: var(--s2-spacing-400)`, `flex: 1`.
- `.badges`: flex wrap, `gap: var(--s2-spacing-100)`. `.badge`: pill (`border-radius: var(--s2-corner-radius-800)`), small font, padding `2px var(--s2-spacing-200)`, background `light-dark(var(--s2-gray-100), var(--s2-gray-200))`.
- `.cta`: `align-self: flex-start; margin: 0 var(--s2-spacing-400) var(--s2-spacing-400);` `text-decoration: none`.
- `.skeleton`: `min-height: 280px`, placeholder background; `.empty`, `.error`: plain paragraph styling (error color `light-dark(var(--s2-red-900), var(--s2-red-700))` if token exists, else gray-800).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test:file -- test/nx2/blocks/marketplace/marketplace.test.js`
Expected: all PASS. Then `npx eslint nx2/blocks/marketplace test/nx2/blocks/marketplace` and `npx stylelint "nx2/blocks/marketplace/*.css"` → no errors.

- [ ] **Step 6: Commit**

```bash
git add nx2/blocks/marketplace/marketplace.js nx2/blocks/marketplace/marketplace.css test/nx2/blocks/marketplace/marketplace.test.js
git commit -m "feat(marketplace): add marketplace block"
```

---

### Task 3: Full verification + manual check

**Files:** none (verification only).

- [ ] **Step 1: Run full suite + lint**

Run: `npm run lint && npm test`
Expected: lint clean; all tests pass (no new failures vs. baseline 2174 passed).

- [ ] **Step 2: Manual smoke test**

Run `npm run local`, author a page with a `marketplace` block on a site serving `/apps/marketplace.json` (or temporarily point via a local `apps/marketplace.json`), load with `?nx=local`. Verify: cards render, badges show, "Learn more" opens a new tab, placeholder appears for empty images, layout collapses to one column on narrow viewport, light and dark modes both legible.
