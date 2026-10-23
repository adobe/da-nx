# Marketplace: filter by category via block options

## Intent
`marketplace.json` now has a `Category` column (`Core`, `Extension`, …). Authors want to split
the marketplace page into sections by category using block options, e.g. `Marketplace (core)`
and `Marketplace (extension)`.

## Behaviour
- `Marketplace` (no options) → show all items (unchanged).
- `Marketplace (core)` → only items with `Category` = core.
- `Marketplace (core, extension)` → items in either category.
- Matching is case-insensitive (`Core` == `core`).
- Filter set but no matches → "No extensions in this category."; no filter and no items →
  existing "No extensions available."

## Approaches
1. **Filter in component (chosen).** `fetchMarketplace` stays generic, returns all items;
   component filters before render via a pure util. Easy to test.
2. Pass categories into `fetchMarketplace` — rejected, mixes view concerns into data fetching.

Fetch sharing between multiple blocks on a page: **not memoized** (user's call) — the browser
HTTP cache covers repeat requests for `marketplace.json`.

## Changes
- `nx2/blocks/marketplace/marketplace-utils.js`
  - `normalizeItem` adds `category` (trimmed `row.Category`).
  - New `getCategories(el)` → lowercase block classes except `marketplace` / `block`
    (EDS turns `Marketplace (core, extension)` into `marketplace core extension`).
  - New `filterByCategories({ items, categories })` → all items if `categories` empty.
- `nx2/blocks/marketplace/marketplace.js`
  - `categories` property on `<nx-marketplace>`; `init(el)` sets it from block classes.
  - Render filtered items; category-aware empty message.
- Tests in `test/nx2/blocks/marketplace/` for the above.

## Left to the builder
Exact class exclusion list (inspect what EDS/nx adds to block elements).
