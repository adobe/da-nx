# Marketplace Teaser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-width `teaser` block (text left, picture right, tinted background from a block option) for the marketplace page.

**Architecture:** Plain JS decoration block in `nx2/blocks/teaser/` following the `nx2/blocks/cards` pattern: CSS loaded with `loadStyle(import.meta.url)` and adopted into `document.adoptedStyleSheets` once; `init(el)` decorates the authored rows in place. Pure helpers (tint resolution) are exported for tests.

**Tech Stack:** Vanilla JS, S2 tokens (`nx2/styles/styles.css`), web-test-runner + chai.

**Spec:** `docs/superpowers/specs/2026-11-20-marketplace-teaser-design.md`

## Global Constraints

- Block class on the page is `nx-teaser` (loader maps `nx-teaser` → `nx2/blocks/teaser/teaser.js`); options arrive as extra classes, e.g. `nx-teaser violet`.
- Tints: `pink`, `purple`, `violet` (= purple), `indigo`, `blue`, `seafoam`, `orange`, `gray` → `--s2-<colour>-100`; `gray`, missing or unknown → `--s2-gray-75`.
- Figma values: radius 16px; min-height 272px (desktop); text padding 28px; heading 28px/35px bold `--s2-gray-800`; description 16px/24px `--s2-gray-700`; button bg `--s2-gray-800`, text `--s2-gray-25` (white in light mode), 14px/18px bold, padding 7px 12px, radius 16px, hover `--s2-gray-900`, visible `:focus-visible` ring.
- Below 600px container width: single column, text then picture (picture height 200px).
- Light + dark via tokens only; no hard-coded colours.
- Commit with `git -c core.hooksPath=.superpowers/hooks commit` (commitlint + lint-staged + focused tests); never `--no-verify`. Conventional Commits, scope `teaser`.
- Tests: `npx wtr --config ./web-test-runner.config.mjs --node-resolve --port=<free> "test/nx2/blocks/teaser/*.test.js"`; lint: `npx eslint nx2/blocks/teaser test/nx2/blocks/teaser`, `npx stylelint "nx2/blocks/teaser/*.css"`.

## Review Focus

- Unknown or uppercase option class (`Violet`, `teal`) → resolves case-insensitively, unknown falls back to gray — test in Task 1.
- Heading wrapped in `<strong>` → same heading styling, no extra bold/size jump — test asserts heading element kept, CSS normalises `strong` inside heading.
- Content cell without a link → no button, no empty paragraph styling — test in Task 1.
- Block without a picture cell → content spans full width — test in Task 1.
- Block decorated twice / stylesheet adopted twice → stylesheet added once — test in Task 1.

---

### Task 1: Teaser block

**Files:**
- Create: `nx2/blocks/teaser/teaser.js`, `nx2/blocks/teaser/teaser.css`
- Test: `test/nx2/blocks/teaser/teaser.test.js`

**Interfaces:**
- Produces:
  - `export const TINTS` — map of option name → CSS custom property name (e.g. `{ pink: '--s2-pink-100', purple: '--s2-purple-100', violet: '--s2-purple-100', …, gray: '--s2-gray-75' }`).
  - `export function getTint(classList)` → the `--s2-…` custom property name for the first matching option (case-insensitive), else `'--s2-gray-75'`.
  - `export default function init(el)` — decorates: sets `--teaser-bg: var(<tint>)` on `el`; adds classes `teaser-content` to the cell containing the heading, `teaser-media` to the cell containing `picture` (removes an empty media cell); marks the paragraph holding the last link as `teaser-cta` and the link as `teaser-cta-link`; adds `no-media` to `el` when there is no picture.

- [ ] **Step 1: Write failing tests** (build the authored DOM from the spec's markup in each test):
  - `getTint` — `['nx-teaser','violet']` → `--s2-purple-100`; `['nx-teaser','Pink']` → `--s2-pink-100`; `['nx-teaser','teal']` and `['nx-teaser']` → `--s2-gray-75`.
  - `init` with picture + h3>strong + p + p>a → `el.style.getPropertyValue('--teaser-bg')` is `var(--s2-purple-100)` for `violet`; `.teaser-media picture` exists; `.teaser-content h3` exists; `a.teaser-cta-link` has the authored href and text `View details`.
  - no link → no `.teaser-cta`; no picture → `el.classList.contains('no-media')` and no `.teaser-media`.
  - calling `init` on two blocks → `document.adoptedStyleSheets` contains the teaser sheet once.
- [ ] **Step 2: Run tests — expect FAIL** (module not found).
- [ ] **Step 3: Implement `teaser.js`** per Interfaces (pattern: `nx2/blocks/cards/cards.js` stylesheet adoption).
- [ ] **Step 4: Implement `teaser.css`** per Global Constraints: `.nx-teaser` grid `minmax(0,1fr) minmax(0,1fr)` with `container-type: inline-size` on a wrapper or the block, `background: var(--teaser-bg)`, radius, `overflow: hidden`, min-height; `.teaser-content` flex column with the CTA pushed to the bottom (`margin-top: auto`); `.teaser-media img` `width/height: 100%`, `object-fit: cover`, `object-position: right center`; `.no-media` single column; `.teaser-content :is(h1,h2,h3,h4,h5,h6) strong { font-weight: inherit; }`; `@container (width < 600px)` stacking.
- [ ] **Step 5: Run tests + lint — expect PASS**
- [ ] **Step 6: Commit** `feat(teaser): add featured teaser block`

### Task 2: Visual verification

- [ ] **Step 1:** With the local dev server on port 6456 (`npx -y @adobe/aem-cli up --port=6456 --no-open`), open `https://da.live/marketplace-copy?nx=local`.
- [ ] **Step 2:** Browser check vs Figma node 5019:401127: layout, typography, button, picture crop, `violet` tint; light + dark (force `color-scheme: dark` on html and body — page toggle is known broken); 375px stacking; no console errors.
- [ ] **Step 3:** Fix mismatches, re-run tests + lint, commit `fix(teaser): align with design` if anything changed.
