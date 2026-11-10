# Tools Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an nx2 `cards` block (authored `nx-cards tools`) that renders the Tools page cards from the Figma.

**Architecture:** Plain JS decorator in `nx2/blocks/cards/cards.js` that restructures each authored row into a card (icon tile, "…" menu button, title, description, footer with byline and Open link) and adopts `cards.css` onto `document`. The "…" menu reuses shared `nx-menu`, lazy-imported on first click. Generic card styles under `.cards`, tool-only styles under `.cards.tools`.

**Tech Stack:** Vanilla JS (ESM, no build), CSS with `light-dark()` tokens from `nx2/styles/styles.css`, Web Test Runner + chai + sinon.

**Spec:** `docs/superpowers/specs/2026-11-09-tools-cards-design.md`

## Global Constraints
- Do not modify `nx2/blocks/shared/card/*`, `nx2/blocks/shared/menu/*`, `nx2/utils/svg.js`, `nx/blocks/site-apps/*`.
- Icon URL: `${codeBase}/img/icons/s2-icon-<name>-20-n.svg#icon`, `<name>` = class suffix after `icon-`, lowercased, hyphens removed, must match `/^[a-z0-9]+$/` (content authors write `:treeview:`). `codeBase` from `getConfig()` in `nx2/scripts/nx.js`. "…" icon: `s2-icon-more-20-n`.
- User-facing strings through `loc` from `nx2/scripts/nx.js`: `Open`, `By Adobe`, `Learn more`, `Open in new tab`, `Open ${title}`, `More options for ${title}`.
- Light and dark mode via existing `--s2-*` tokens.
- Commits: Conventional Commits (`feat(cards): …`). Pre-commit hook runs the nx1 test suite, which currently has unrelated failures — report, don't bypass without the user's OK.

## Review Focus
- Row with no title link → card renders title text, no Open button, menu has only "Learn more" (or no "…" button if no `<ul>` either); no crash.
- `<em>` with garbage (`not a color`) → no tile background, `<em>` removed.
- Two cards' "…" clicked in sequence → one shared `nx-menu`, items reflect the second card.
- Long descriptions (SVG Doctor, Firefly) → footers stay aligned at card bottom within a grid row.
- Learn-more href authored without protocol (`www.adobe.com`) resolves relative to the page — not fixed in code; report to content author.

---

### Task 1: `cards.js` decoration and menu

**Files:**
- Create: `nx2/blocks/cards/cards.js`
- Create: `nx2/blocks/cards/cards.css` (placeholder comment, filled in Task 2)
- Test: `nx2/test/unit/blocks/cards/cards.test.js`

**Interfaces:**
- Produces: `export default function init(el: HTMLElement): void`
- Produces DOM per row (row div becomes the card; block gets `role="list"`, card `role="listitem"`):
  ```html
  <div class="card" role="listitem">
    <div class="card-header">
      <div class="card-icon [has-bg]" style="--card-icon-bg: #F4EBFC"><svg class="icon" aria-hidden="true"><use href="…/s2-icon-calendar-20-n.svg#icon"/></svg></div>
      <button class="card-more" type="button" aria-haspopup="menu" aria-label="More options for AEM Scheduler"><svg class="icon">…more…</svg></button>
    </div>
    <div class="card-body"><h3>AEM Scheduler</h3><p>…</p></div>
    <div class="card-footer">
      <span class="card-byline"><span class="card-byline-logo"></span>By Adobe</span>
      <a class="card-open" href="…" aria-label="Open AEM Scheduler">Open</a>
    </div>
  </div>
  ```
  Card keeps its URLs as `card.dataset.href` (title link, absolute) and `card.dataset.learnMore` (absolute, optional). `<ul>` and the title `<a>` are removed (title text kept).
- Menu: one `nx-menu` per block, created on first "…" click after `import('../shared/menu/menu.js')` (memoized), appended to the block. On each click: set `items`, `show({ anchor: button })`. Items: `{ id: 'learn-more', label }` if `learnMore`, `{ id: 'open-new-tab', label }` if `href`. `select` → `window.open(url, '_blank', 'noopener')` for the card the menu was last opened from.

- [ ] **Step 1: Write failing tests** in `nx2/test/unit/blocks/cards/cards.test.js`. Setup: `await setConfig({ hostnames: [] })` from `../../../../scripts/nx.js` before dynamically importing `../../../../blocks/cards/cards.js` (pattern: `nx2/test/unit/nx/blocks/fragment/fragment.test.js`). Helper `buildBlock(rowsHtml)` appends `<div class="nx-cards tools">` to body; `afterEach` clears body and `sinon.restore()`. Tests:
  - `adds card class and listitem role to every row` — 2 rows → 2 `.card`, block `role="list"`.
  - `renders icon from the short name` — `icon-treeview` → `.card-icon use` href ends with `/img/icons/s2-icon-treeview-20-n.svg#icon`; no `span.icon` left.
  - `normalizes case and hyphens in the short name` — `icon-Tree-View` → same href.
  - `skips icons with unsafe names` — class `icon-s2"><img` set via `className` → `.card-icon` has no children.
  - `applies em color to the tile` — `<em>#F4EBFC</em>` → `.card-icon.has-bg`, `--card-icon-bg` = `#F4EBFC`, no `em`.
  - `skips tile background without em` / `ignores invalid em color` — no `has-bg`, no `em`.
  - `unwraps the title link` — `h3` text `Traverse`, no `a` inside `h3`.
  - `renders open link from title link` — `.card-open` href = authored absolute href, text `Open`, `aria-label="Open Traverse"`; same-origin → no `target`; `https://labs.aem.live/x` → `target="_blank"`, `rel="noopener"`.
  - `renders by adobe byline` — `.card-byline` text `By Adobe`.
  - `omits open link without title link` — `<h3>Plain</h3>` → no `.card-open`, no throw.
  - `renders more button` — `.card-more` with `aria-label="More options for Traverse"`, `aria-haspopup="menu"`, `use` href ends with `s2-icon-more-20-n.svg#icon`.
  - `omits more button without any menu item` — no title link and no `<ul>` → no `.card-more`.
  - `opens menu with learn more and open in new tab` — click `.card-more`, await until `block.querySelector('nx-menu')` exists and `updateComplete`; `menu.items.map((i) => i.id)` deep-equals `['learn-more', 'open-new-tab']`.
  - `menu has only open in new tab without list` — ids `['open-new-tab']`.
  - `selecting an item opens the url in a new tab` — stub `window.open`; dispatch `new CustomEvent('select', { detail: { id: 'learn-more' } })` on menu → called with learn-more absolute URL, `'_blank'`, `'noopener'`.
  - `reuses one menu across cards` — click card 1 then card 2 "…" → exactly one `nx-menu`; select `open-new-tab` opens card 2's href.

- [ ] **Step 2: Run, expect FAIL** (module not found)
  Run: `npm run nx2:test:file -- nx2/test/unit/blocks/cards/cards.test.js`

- [ ] **Step 3: Implement `init(el)`** in `nx2/blocks/cards/cards.js`. Style loading as in `nx/blocks/card/card.js` (`loadStyle(import.meta.url)` from `../../utils/utils.js`, adopt onto `document.adoptedStyleSheets` once). Module-private helpers: `iconName(span) → string`, `iconSvg(name) → string` (inline template, set via `innerHTML`), `isExternal(href) → boolean` (`new URL(href, location.href).origin !== location.origin`), `getMenuItems({ href, learnMore }) → Array`. Color check: `CSS.supports('color', value)`. Menu module import memoized with a module-level promise.

- [ ] **Step 4: Run, expect PASS** — same command. Then `npx eslint nx2/blocks/cards nx2/test/unit/blocks/cards` → no errors.

- [ ] **Step 5: Commit**
  ```bash
  git add nx2/blocks/cards nx2/test/unit/blocks/cards docs/superpowers
  git commit -m "feat(cards): add nx2 cards block for tools"
  ```

### Task 2: `cards.css` styles

**Files:**
- Modify: `nx2/blocks/cards/cards.css`

**Interfaces:**
- Consumes: DOM classes from Task 1.

- [ ] **Step 1: Generic `.cards` styles** (values from spec "Figma values")
  - Block: `display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--s2-spacing-300)`.
  - `.card`: flex column, gap 16, padding 16, radius 16, `background: var(--s2-gray-50)`.
  - `.card-header`: flex, space-between, align start.
  - `.card-body`: `flex: 1` (pins footer to bottom), flex column gap 8; footer margin-top so body↔footer distance is 24.
  - `.card-footer`: flex, space-between, center.
  - `.card-more`: 24px square, no border, transparent, radius 7, `color: var(--s2-gray-800)`, hover `background: var(--s2-gray-200)`, `:focus-visible` outline `2px solid var(--s2-blue-800)`.
  - `.card-open`: inline-flex, `border: 2px solid var(--s2-gray-300)`, radius 12, padding `4px 10px`, 12px bold / 16px, `color: var(--s2-gray-800)`, no underline; hover `background: var(--s2-gray-200)`; `:focus-visible` outline as above.
- [ ] **Step 2: `.cards.tools` styles**
  - `.card-icon`: 40px square, `border-radius: var(--s2-corner-radius-500)`, centered 20px svg, `color: var(--s2-gray-800)`; `.has-bg { background: var(--card-icon-bg); color: rgb(41 41 41); }`.
  - `h3`: `margin: 0; font-size: var(--s2-body-size-l); font-weight: 700; line-height: 22px; color: var(--s2-gray-800)`.
  - `p`: `margin: 0; font-size: var(--s2-body-size-s); line-height: 1.5; color: var(--s2-gray-700)`.
  - `.card-byline`: inline-flex, gap 4, 14px / 1.5, `color: var(--s2-gray-700)`; `.card-byline-logo:empty { display: none; }`.
- [ ] **Step 3: Lint** — `npx stylelint nx2/blocks/cards/cards.css` → no errors.
- [ ] **Step 4: Visual check** — `npm run local`, open the Tools page on da.live with `?nx=local` (light + dark), compare with Figma 4686:338584: 3-column grid at 1920px, colored tiles, Sidekick/Firefly unfilled, "…" top-right opens menu with Learn more / Open in new tab, footers aligned, Open navigates.
- [ ] **Step 5: Commit**
  ```bash
  git add nx2/blocks/cards/cards.css
  git commit -m "feat(cards): style generic cards and tools variant"
  ```
