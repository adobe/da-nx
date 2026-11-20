# Marketplace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `nx-marketplace` to the "All Capabilities" design: toolbar (heading, view toggle, sort, search), Type filter rail, list/grid of items with View details / Try out buttons.

**Architecture:** Rework the existing Lit component `nx2/blocks/marketplace/marketplace.js` in place. All data transforms (search, sort, filter, actions) are pure functions in `marketplace-utils.js`. View/sort/filter/query are in-memory reactive state only.

**Tech Stack:** Lit (`da-lit`), constructed stylesheets, S2 tokens (`nx2/styles`), shared `nx-search`, `nx-segmented-btn`, `nx-menu`, `buttons.css`; tests with web-test-runner + chai.

**Spec:** `docs/superpowers/specs/2026-11-20-marketplace-redesign-design.md`

## Global Constraints

- No Featured banners, no "Installed" state, no "Created by" filter.
- Page title/intro are authored content, not rendered by the block.
- "View details" → `docHref`, "Try out" → `tryHref` (only when present); both open in a new tab (`target="_blank" rel="noopener noreferrer"`), rendered as links styled as buttons.
- Type rail values come from the `Category` column (first-seen order); first entry label is `All Types`.
- Sort options: `Name` (A–Z, default) and `Newest` (`Date` column, descending).
- Search placeholder/label: `Search ${n} Capabilities` where n = total item count.
- All UI must work in light and dark mode (`light-dark()` / S2 tokens only, no hard-coded colors).
- Icons from `${codeBase}/img/icons/`: `s2-icon-viewlist-20-n.svg`, `s2-icon-viewgrid-20-n.svg`, `s2-icon-sortdown-20-n.svg`.
- Figma anchors (node 5019:399234): rail width 224px; list row height ~96px with divider between rows; row icon 64px, radius 12px; "All Capabilities" uses font-size-400 (24px line-height); rail items min-height 32px, radius 8px, selected item has a left indicator bar.
- Run tests: `npm run test:file -- test/nx2/blocks/marketplace/*.test.js`; lint: `npx eslint nx2/blocks/marketplace test/nx2/blocks/marketplace` and `npx stylelint nx2/blocks/marketplace/*.css`.
- Commits follow Conventional Commits, scope `marketplace`.

## Review Focus

- Search + Type filter yielding zero results → show "No capabilities match your search." (not the "No extensions available." sheet-empty message) — test in Task 2.
- Rows with missing or invalid `Date` under Newest sort → sorted last, stable by title — test in Task 1.
- Search with leading/trailing whitespace or mixed case → trimmed, case-insensitive — test in Task 1.
- Sheet with fewer than two categories → no Type rail, list fills width — test in Task 2.
- Long titles/descriptions in a narrow container → wrap, buttons don't overflow; rail stacks above list below 600px — verified in Task 4.

---

### Task 1: Utils — date, search, sort, actions

**Files:**
- Modify: `nx2/blocks/marketplace/marketplace-utils.js`
- Test: `test/nx2/blocks/marketplace/marketplace-utils.test.js`

**Interfaces:**
- Produces:
  - `normalizeItem({ row, origin })` → adds `date: string` (trimmed `row.Date`, `''` if missing) to the returned object.
  - `getCategoryFilters(items)` → first entry is now `{ value: 'all', label: 'All Types' }`.
  - `SORT_OPTIONS = [{ id: 'name', label: 'Name' }, { id: 'newest', label: 'Newest' }]`
  - `searchItems({ items, query })` → items whose title or description contains the trimmed, lower-cased query; empty query returns `items`.
  - `sortItems({ items, sort = 'name' })` → new array; `name`: `localeCompare` on title, case-insensitive; `newest`: by `Date.parse(date)` descending, invalid/missing dates last, ties by title.
  - `getActions({ docHref, tryHref })` → `[{ id: 'details', label: 'View details', href }, { id: 'try', label: 'Try out', href }]`, entries omitted when href missing.
  - `getVisibleItems({ items, filter, query, sort })` → `sortItems(searchItems(filterByCategory(...)))`.

- [ ] **Step 1: Update/add failing tests**
  - `normalizeItem` "maps a full row": row gets `Date: ' 2026-11-03 '`, expected output gets `date: '2026-11-03'`; "handles missing description and category" expects `date: ''`.
  - `getActions`: expects `['View details', 'Try out']` labels and ids `['details', 'try']`.
  - `getCategoryFilters`: first entry `{ value: 'all', label: 'All Types' }`.
  - `searchItems`: `query: '  ANCHOR '` matches title "Anchor Links"; `query: 'sections'` matches description; `query: ''` returns same array; no match returns `[]`.
  - `sortItems`: `name` sorts `['beta', 'Alpha', 'gamma']` → `['Alpha', 'beta', 'gamma']`; `newest` with dates `['2026-10-01', '', '2026-11-19', 'nope']` → `2026-11-19`, `2026-10-01`, then the two undated by title; input array is not mutated.
  - `getVisibleItems`: filter `extension` + query + `newest` combine.
- [ ] **Step 2: Run tests — expect FAIL** (`npm run test:file -- test/nx2/blocks/marketplace/marketplace-utils.test.js`)
- [ ] **Step 3: Implement** the interfaces above in `marketplace-utils.js`.
- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Commit** `feat(marketplace): add search, sort and view details actions to utils`

### Task 2: Component — toolbar, Type rail, list view

**Files:**
- Modify: `nx2/blocks/marketplace/marketplace.js`, `nx2/blocks/marketplace/marketplace.css`
- Test: `test/nx2/blocks/marketplace/marketplace.test.js`

**Interfaces:**
- Consumes: everything Task 1 produces.
- Produces (state on `NxMarketplace`): `_items`, `_error`, `_filters`, `_filter` (default `'all'`), `_query` (default `''`), `_sort` (default `'name'`), `_view` (default `'list'`). DOM classes tests rely on: `.toolbar`, `.rail`, `.rail-item[aria-current="true"]` for selected, `.items.list` / `.items.grid`, `.item`, `.item-actions a`, `.no-results`.

Layout (shadow DOM):

```
<header class="toolbar">
  <h2>All Capabilities</h2>
  <div class="controls"> [view toggle] [sort menu] [nx-search] </div>
</header>
<div class="body">
  <nav class="rail" aria-label="Filter by type"> "Type" + buttons per filter </nav>   (only when _filters)
  <ul class="items list" role="list"> <li class="item"> icon | h3+p | actions </li> … </ul>
</div>
```

- Rail: heading "Type", one `<button class="rail-item">` per filter, selected has `aria-current="true"`; click sets `_filter`.
- Sort: `nx-menu` with `SORT_OPTIONS` (size `m`), trigger is `.nx-action-btn-quiet` button with sort icon + `Sort by: ${label}`; `select` sets `_sort`.
- Search: `<nx-search variant="field" size="m">` with label/placeholder `Search ${this._items.length} Capabilities`; `input` event sets `_query` from `e.target.value`.
- Actions: `getActions(item).map` → `<a class="nx-action-btn nx-btn-sm" href target="_blank" rel="noopener noreferrer">`; remove the `⋯` menu and `_onActionSelect`.
- Keep: icon/placeholder fallback, loading skeleton (skeleton now mirrors toolbar + rail + rows), error, "No extensions available." for an empty sheet. Lazy-load `nx-search`, `nx-menu`, `nx-segmented-btn` in `_load()` before setting `_items` (as segmented is today) to avoid layout shift.

- [ ] **Step 1: Rewrite failing component tests** (keep fetch helpers):
  - renders `.toolbar h2` text `All Capabilities` and an `nx-search` whose `placeholder` is `Search 3 Capabilities` for 3 valid rows.
  - renders one `.item` per valid row inside `.items.list`.
  - item with doc + try url has two links `View details` / `Try out` with correct `href`, `target="_blank"`, `rel` containing `noopener`; item with only doc url has one link. No `nx-menu` inside `.item`.
  - clicking the `Extension` rail item shows only extension items and sets `aria-current="true"` on it; `All Types` restores all.
  - typing into search (set `value`, dispatch `input`) filters items; with no matches shows `.no-results` text `No capabilities match your search.`.
  - sort `select` with `{ id: 'newest' }` reorders items by date.
  - fewer than two categories → no `.rail`.
  - keep: init mounts, loading state, icon/placeholder fallback, empty sheet message, error message.
- [ ] **Step 2: Run — expect FAIL** (`npm run test:file -- test/nx2/blocks/marketplace/marketplace.test.js`)
- [ ] **Step 3: Implement render + handlers in `marketplace.js`.**
- [ ] **Step 4: Style list view in `marketplace.css`** per Global Constraints Figma anchors: `.body` is a 2-col grid (`224px 1fr`) when rail present; rows separated by `border-block-end: 1px solid var(--s2-gray-200)`, icon 64px / radius 12px; title `--s2-component-l`/bold-ish, description body-s gray-700; actions aligned end. Rail selected item: bold text + 2px left bar `var(--s2-gray-800)`.
- [ ] **Step 5: Run tests + lint — expect PASS**
- [ ] **Step 6: Commit** `feat(marketplace): new list layout with type rail, sort and search`

### Task 3: Grid view toggle + responsive

**Files:**
- Modify: `nx2/blocks/marketplace/marketplace.js`, `nx2/blocks/marketplace/marketplace.css`
- Test: `test/nx2/blocks/marketplace/marketplace.test.js`

**Interfaces:**
- Consumes: Task 2 state `_view` and `.items.list` / `.items.grid` classes.

- View toggle: `nx-segmented-btn` (size `m`, label `View`) with items `[{ value: 'list', label: 'List view', icon: viewlist, iconOnly: true }, { value: 'grid', label: 'Grid view', icon: viewgrid, iconOnly: true }]` (icon = href without `#icon`; segmented appends it); `change` sets `_view`.
- Grid: `.items.grid` uses `repeat(auto-fill, minmax(260px, 1fr))`, each `.item` becomes a card (column flow: icon, text, actions at bottom; `background: var(--s2-gray-50)`, radius `--s2-corner-radius-800`, no row divider).
- Responsive (container query on `:host`): below 600px `.body` is single column, rail becomes a horizontally scrollable row of rail items above the list, toolbar wraps (search full width); list rows stack actions under the text.

- [ ] **Step 1: Failing tests:** default renders `.items.list`; dispatching `change` with `{ value: 'grid' }` on the view toggle renders `.items.grid` with same item count; toggle has two buttons with aria-labels `List view` / `Grid view`.
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement toggle + grid/responsive CSS.**
- [ ] **Step 4: Run tests + lint — expect PASS**
- [ ] **Step 5: Commit** `feat(marketplace): add grid view toggle and responsive layout`

### Task 4: Visual verification

- [ ] **Step 1:** Serve locally (`npx @adobe/aem-cli up` or the project's usual local server) on a page containing the marketplace block with real `marketplace.json` data (da.live data shape).
- [ ] **Step 2:** Dispatch browser-tester to compare against the Figma screenshot (node 5019:399234, ignoring Featured): toolbar, rail, list rows, buttons; check grid view, light + dark mode, 375px width, no console errors.
- [ ] **Step 3:** Fix mismatches, re-run tests + lint, commit `fix(marketplace): align with design` if anything changed.
