# Cards Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `nx-cards-filter` block (category pills + search) and make `nx-cards` respond to its search event.

**Architecture:** Filter block builds categories from section headings, toggles section `hidden` for categories, and dispatches a synchronous `nx-cards-filter` document event for search; each cards block hides its own non-matching cards and pushes `{ section, count }` into `detail.results`.

**Tech Stack:** Vanilla JS, shared Lit components `nx-segmented-btn` / `nx-search`, WTR + chai + sinon.

**Spec:** `docs/superpowers/specs/2026-11-10-cards-filter-design.md`

## Global Constraints
- Do not modify `nx2/blocks/shared/*`.
- Event names: `nx-cards-filter` (`detail: { query: string, results: Array<{ section: HTMLElement, count: number }> }`), `nx-cards-ready` (no detail). Both dispatched on `document`.
- Section id: `category-${heading.id}`; "All" value `all`.
- Labels via `loc`: `All`, `Search Tools`, `Filter tools by category`, `No tools found`.
- Matching: `query.trim().toLowerCase()` substring of `${title} ${description}`.toLowerCase().

## Review Focus
- Typing then clearing the search → every managed section and card visible again, category "All".
- Selecting a category while a search is active → search cleared, all cards in that section visible.
- Heading without an `id` → section skipped as category, no `category-undefined`.
- Cards block that loads after a query was typed → receives the query via `nx-cards-ready`.
- Query that matches nothing → "No tools found" shown; removed when query changes to match.

---

### Task 1: cards block responds to `nx-cards-filter`

**Files:** Modify `nx2/blocks/cards/cards.js`; Test `nx2/test/unit/blocks/cards/cards.test.js`

**Interfaces:**
- Consumes: `nx-cards-filter` event on `document`.
- Produces: pushes `{ section: el.closest('.section') ?? el.parentElement, count }` into `detail.results`; sets `hidden` on non-matching `.card`; dispatches `nx-cards-ready` on `document` at the end of `init`.

- [ ] **Step 1: Failing tests** (new `describe('cards search')`; blocks wrapped in `<div class="section">`):
  - `hides cards that do not match the query` — query `"trav"` → Traverse visible, other card `hidden`.
  - `matches the description case-insensitively` — query `"BIRDS EYE"` → Traverse visible.
  - `reports the match count for its section` — results contains `{ section, count: 1 }`.
  - `shows all cards for an empty query` — after query, `''` → no card hidden, count = total.
  - `announces itself when ready` — listener on `nx-cards-ready` called once by `init`.
- [ ] **Step 2: Run, expect FAIL** — `npm run nx2:test:file -- nx2/test/unit/blocks/cards/cards.test.js`
- [ ] **Step 3: Implement** in `cards.js`: `matchesQuery({ card, query }) → boolean` (module-private), a `document` listener registered in `init` per block (remove it when the block is disconnected is not required — page lifetime).
- [ ] **Step 4: Run, expect PASS**; eslint clean.

### Task 2: `nx-cards-filter` block

**Files:** Create `nx2/blocks/cards-filter/cards-filter.js`, `cards-filter.css`; Test `nx2/test/unit/blocks/cards-filter/cards-filter.test.js`

**Interfaces:**
- Consumes: Task 1 events.
- Produces: `export default async function init(el)`; DOM: `el` contains `nx-segmented-btn.cards-filter-categories`, `nx-search.cards-filter-search`; a `p.cards-filter-empty` (hidden unless no matches) appended after the last managed section's content… placed inside `el` for simplicity.
- Module-private pure helper: `getCategories(sections) → Array<{ value, label, section }>`.

- [ ] **Step 1: Failing tests** (fixture: `<main>` with filter section + 3 sections with `h2#a`, `h2#b`, one without heading; each heading section holds a stub listener that mimics a cards block via `nx-cards-filter`):
  - `sets category ids on sections` — `category-a`, `category-b`.
  - `builds pills for all and each category` — segmented `items` values `['all','category-a','category-b']`, labels `['All','A','B']`.
  - `shows only the selected category` — dispatch `change` with `{ value: 'category-b' }` → only B visible.
  - `all shows every section` — after B, select `all` → none hidden.
  - `search resets the category to all and hides sections without matches` — select B, then search `input` with value `x` where stub A reports 1, B reports 0 → segmented `value === 'all'`, A visible, B hidden, heading-less section hidden.
  - `selecting a category clears the search` — after search, select A → search `value === ''`, event dispatched with `query: ''`.
  - `shows empty state when nothing matches` — all report 0 → `.cards-filter-empty` not hidden, text `No tools found`.
  - `re-sends the query when a cards block is ready` — with query `x`, dispatch `nx-cards-ready` → filter event dispatched again with `query: 'x'`.
- [ ] **Step 2: Run, expect FAIL** — `npm run nx2:test:file -- nx2/test/unit/blocks/cards-filter/cards-filter.test.js`
- [ ] **Step 3: Implement** block: imports `../shared/segmented-btn/segmented.js` and `../shared/search/search.js` (dynamic `Promise.all` in `init`, awaited); CSS: flex row, `justify-content: space-between`, gap 16, margin per Figma; segmented in an `overflow-x: auto` wrapper; search width ~ 200px.
- [ ] **Step 4: Run, expect PASS**; eslint + stylelint clean.
- [ ] **Step 5: Visual check** on `https://da.live/apps-copy?nx=local`: pills + search render, category & search behave, light/dark.
