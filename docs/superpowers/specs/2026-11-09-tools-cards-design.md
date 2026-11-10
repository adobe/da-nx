# Tools cards (`nx-cards`) — design

## Intent
The Tools page (replacement for today's Apps screen, `nxver=2`) lists tools as cards grouped by audience. This adds a new nx2 `cards` block that renders those cards per the Figma (Experience Workspace, node 4686:338584, card 4775:107649).

## Goals
- New block `nx2/blocks/cards/` (authored as `nx-cards`, variant `tools`).
- Card: icon tile, title, description, footer with "By Adobe" and an "Open" button, "…" menu top right.
- "…" menu items today: "Learn more" (if authored) and "Open in new tab". More items later.
- Light and dark mode.

## Non-goals
- Filter pills, search (later iteration).
- "Site Apps" section and "By Admin" — that's the `site-apps` block (`nx/blocks/site-apps`), second step. Generic `.cards` styles should be reusable by it later.
- Shared `nx-card` web component (`nx2/blocks/shared/card`) — do not touch.
- Global icon loader (`nx2/utils/svg.js`) — unchanged.

## Content model
Each block row = one card, two columns:
1. `<span class="icon icon-<name>">` (authored as the short icon name, e.g. `:treeview:`) plus optional `<em>#RRGGBB</em>` = icon tile background.
2. `<h3><a href>Title</a></h3>`, `<p>` description, optional `<ul><li><a>Learn more</a></li></ul>`.

No `<em>` (Sidekick, Firefly) → no tile background.

## Approaches
- **Icons — chosen: block renders its own icons from the short authored name.** `cards.js` replaces each `span.icon` with an inline template string `<svg><use href="${codeBase}/img/icons/s2-icon-<name>-20-n.svg#icon">` (same pattern as `menu.js`, `ew-actions.js`, etc.). `<name>` = class suffix after `icon-`, lowercased, hyphens removed (`icon-treeview` / `icon-TreeView` → `treeview`), only if the result matches `/^[a-z0-9]+$/`. The global `loadIcons` in `nx.js` still runs first and writes into the detached span harmlessly. Rejected: full Spectrum 2 names in content (`:s2-icon-treeview-20-n:` — not usable in content); switching `nx2/utils/svg.js` to the new naming (affects every nx2 `span.icon` consumer); a new shared icon helper (none exists in nx2 today — every component inlines the template; consolidating is a separate cleanup).
- **Block flavor — plain JS decorator**, CSS adopted onto `document` like `nx/blocks/card`. Rejected: reusing shared `nx-card` (media-preview card; must not be touched).
- **Menu — reuse shared `nx-menu`** (`nx2/blocks/shared/menu/menu.js`), lazy-imported on first "…" click, one menu instance per block re-anchored to the clicked button. Rejected: a custom popover (duplicates keyboard/positioning logic already in `nx-menu`).

## Decisions
- **Not** a whole-card link. Title becomes plain text (the `<a>` is unwrapped). The tool link moves to the "Open" button (`<a class="card-open">`), `aria-label="Open <title>"`. External links (origin ≠ page origin) open in a new tab with `rel="noopener"`; same-origin in the same tab.
- Row without a title link: no Open button, no "Open in new tab" item.
- "…" button: `s2-icon-more-20-n`, `aria-label="More options for <title>"`, `aria-haspopup="menu"`. Rendered when the card has at least one menu item.
- Menu items: `{ id: 'learn-more', label: 'Learn more' }` (only if `<ul>` link exists), `{ id: 'open-new-tab', label: 'Open in new tab' }`. Both open in a new tab via `window.open(href, '_blank', 'noopener')`.
- "By Adobe" is always shown for this block (hard-coded, via `loc`), preceded by `s2-icon-byadobe-20-n` rendered at 18px (the SVG has an 18×18 viewBox and a fixed `#717171` fill). Labels "Open", "Learn more", "Open in new tab", "By Adobe" go through `loc` from `nx2/scripts/nx.js`.
- `<em>` color applied only if `CSS.supports('color', value)`; `<em>` removed either way.
- Tile icon: 20px with fixed dark color (`rgb(41 41 41)`) when a tile background is set; without a background the icon fills the whole 40px tile (e.g. the Adobe logo for Sidekick/Firefly). `<use width="100%" height="100%">` scales any icon file into the frame regardless of its native size.
- Styles split: generic `.cards` (grid, card surface `--s2-gray-50`, 16px radius, 16px padding, column layout, footer row, Open pill button, "…" button) vs `.cards.tools` (40px icon tile, title/description typography, "By Adobe" byline).

## Figma values (card 4775:107649)
Card: padding 16, radius 16, bg `--s2-gray-50`, column gap 16 (top row ↔ content). Top row: 40px tile left, 24px "…" action button right (radius 7). Content: gap 24 between text group and footer; text group gap 8. Title 18px bold / 22px `--s2-gray-800`. Description 14px / 1.5 `--s2-gray-700`. Footer: space-between; byline 14px / 1.5 `--s2-gray-700` (18px logo slot, gap 4); Open button 2px border `--s2-gray-300`, radius 12, padding 4px 10px, 12px bold / 16px `--s2-gray-800`.

## Left to the builder
Hover/active states of Open and "…" (Spectrum-like background step), grid breakpoints (auto-fill, min ~300px, 3 columns at Figma width), equal card heights per row (footer pinned to bottom).
