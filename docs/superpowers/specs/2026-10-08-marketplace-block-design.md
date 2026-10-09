# Marketplace block — design

## Goal

A new `marketplace` block that showcases DA and Experience Workspace extensions (apps and plugins) that projects can install. Visually similar to `nx/blocks/site-apps`: a grid of cards, one per extension, each with a "Learn more" link to the extension docs and a "Try out" link to the extension itself.

## Requirements

- Data source: fixed, origin-relative path `/apps/marketplace.json` (e.g. `https://main--da-live--adobe.aem.page/apps/marketplace.json`). Public EDS sheet, no auth.
- Sheet shape (`:type: "sheet"`): `data[]` rows with `Title`, `Description`, `Doc Url`, `Try Url`, `Status`, `Owner`, `Type`, `Image`, `Date` (`Status`, `Owner`, `Date` not yet rendered).
  - `Image` holds a thumbnail URL (absolute or relative); may be empty.
  - `Type` is `App`, `Plugin`, or `App & Plugin`.
  - `Date` is ignored.
- Each card shows: thumbnail (or placeholder), title, description, type badge(s), "Learn more" (primary) and "Try out" (secondary) buttons.
- "Learn more" opens `Doc Url`, "Try out" opens `Try Url`, both in a new tab; a button is omitted when its URL is missing or unsafe.
- No filtering, search, or sorting — sheet order is preserved.
- Lives in `nx2/blocks/marketplace/`.
- Light and dark mode supported.

## Architecture

Lit web component plus companion util, following nx2 conventions (`ew-actions`, `whatsnew`).

### `nx2/blocks/marketplace/marketplace-utils.js` (pure, no DOM)

- `MARKETPLACE_PATH = '/apps/marketplace.json'`
- `normalizeItem({ row, origin })` → `{ title, description, docHref, tryHref, types, imageHref } | null`
  - Returns `null` when `Title` is blank or both `Doc Url` and `Try Url` are missing/unsafe.
  - `docHref` / `tryHref`: `Doc Url` / `Try Url` resolved against `origin`; `undefined` unless protocol is `http:` or `https:`.
  - `imageHref`: `Image` resolved against `origin` when non-empty and `http(s)`; otherwise `undefined`.
  - `types`: `Type` split on `&`, trimmed, empty entries removed (`"App & Plugin"` → `['App', 'Plugin']`).
  - `description`: trimmed `Description` or `''`.
- `fetchMarketplace({ origin })` → `{ items }` on success, `{ error, status }` on failure.
  - `fetch(new URL(MARKETPLACE_PATH, origin))`.
  - Non-OK response → `{ error: 'Could not load marketplace.', status: resp.status }`.
  - Network/JSON error → `{ error: 'Could not load marketplace.' }`.
  - Missing/non-array `data` → `{ items: [] }`.
  - Success → `items` = `data.map(normalizeItem).filter(Boolean)`.

### `nx2/blocks/marketplace/marketplace.js`

- `export default function init(el)`: clears `el`, appends `<nx-marketplace>`.
- `NxMarketplace extends LitElement`:
  - State: `_items` (`undefined` = loading), `_error`.
  - `connectedCallback`: adopts block stylesheet + `nx2/styles/buttons.css`, calls `fetchMarketplace({ origin: window.location.origin })`, sets `_items` or `_error`.
  - Render:
    - `_error` → short message paragraph.
    - `_items === undefined` → loading state (skeleton cards).
    - `_items.length === 0` → "No extensions available."
    - otherwise → `<ul class="grid">` of `<li class="card">`.
- Card template (Lit templating escapes all values):
  - Image area: `<img loading="lazy" src=imageHref alt="">` or a neutral placeholder `div`.
  - `<h3>` title, `<p>` description.
  - Badges: one `<span class="badge">` per entry in `types`.
  - Actions: `<a class="cta cta-primary" … aria-label="Learn more about {title}">Learn more</a>` and `<a class="cta cta-secondary" … aria-label="Try out {title}">Try out</a>`, both `target="_blank" rel="noopener noreferrer"`.

### `nx2/blocks/marketplace/marketplace.css`

- Grid: `repeat(auto-fill, minmax(280px, 1fr))`, `gap: var(--s2-spacing-600)`; single column naturally on narrow viewports.
- Card: S2 spacing/radius tokens, border/background via `light-dark()`; CTA aligned to the card bottom.
- Image area: fixed aspect ratio (16 / 9), `object-fit: cover`; placeholder uses a subtle `light-dark()` fill.
- Badge: small pill, `light-dark()` colors.

## Error handling

- Fetch/parse failures never throw out of the util; the component renders an inline message instead of removing the section (users should know the marketplace exists but failed).
- Invalid rows are silently dropped.

## Security

- No HTML string templating; Lit escapes text and attributes.
- Only `http(s)` URLs are used for links and images, blocking `javascript:`/`data:` injection from sheet data.
- External links use `rel="noopener noreferrer"`.

## Testing

- `test/nx2/blocks/marketplace/marketplace-utils.test.js`
  - `normalizeItem`: full row; missing title/path → `null`; `javascript:` path → `null`; relative path/image resolved; empty image → `undefined`; type splitting.
  - `fetchMarketplace`: success (stubbed `fetch`), non-OK status, thrown error, missing `data`.
- `test/nx2/blocks/marketplace/marketplace.test.js`
  - Stubbed `fetch`: renders N cards with title, badges, `target="_blank"` link.
  - Empty data → empty message; failed fetch → error message.

## Out of scope

- Filtering/search by type, sorting, `Date` display, install actions, pagination of large sheets.
- Style guide update (feature block, not a shared component).

## Delivery

- Commit/PR title: `feat(marketplace): add marketplace block`.
