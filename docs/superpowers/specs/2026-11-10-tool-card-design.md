# Shared tool card (`nx-tool-card`) + site-apps — design

## Intent
The Tools page has two kinds of cards that look the same in Figma (Experience Workspace, node 4686:338584): tool cards (authored, `nx-cards tools`) and site app cards (from the site's DA config, `nx-site-apps`). One shared component renders a single card so both blocks (and the future `/apps` page) stay identical.

## Goals
- New shared Lit component `<nx-tool-card>` in `nx2/blocks/shared/tool-card/` with docs (`docs/tool-card.md`) and a style guide entry.
- `nx2/blocks/cards` renders `<nx-tool-card>` per authored row (no visual change).
- `nx/blocks/site-apps` renders `<nx-tool-card>` per app: image tile, "By Admin", Open, "…" with "Open in new tab"; joins the cards-filter search.
- Shared search helper so both blocks answer `nx-cards-filter` the same way.

## Non-goals
- Touching `nx2/blocks/shared/card` (`nx-card`).
- Moving `site-apps` out of nx1 / changing `NX_BLOCKS` routing.
- Keeping the old `/apps` page look (it changes too; expected, updated later).

## Approaches
- **Chosen: Lit web component** (like `segmented-btn`, `search`, `menu`): encapsulated styles, property API, consumers only map data → properties.
- Rejected: shared `renderToolCard(data)` light-DOM function + global CSS (not consistent with shared components, style leakage).

## Component API
Properties (all strings, reflected as attributes where noted):
- `heading`, `description`
- `href` — Open button + "Open in new tab"; omitted → no Open button. External origin → new tab.
- `learn-more-href` (`learnMoreHref`) — adds "Learn more" to the "…" menu.
- `icon` — short icon name (`treeview` → `s2-icon-treeview-20-n`; lowercased, hyphens removed, must match `/^[a-z0-9]+$/`).
- `image` — image URL shown in the 40px tile (cover, rounded); wins over `icon`.
- `tint` — tile background color (validated with `CSS.supports`); tinted icon 20px, untinted icon fills 40px.
- `byline`, `byline-icon` (`bylineIcon`, short icon name) — footer byline; logo centered on cap height.
- Host `hidden` hides the card.

"…" menu: shown if any of learn-more / href; `nx-menu` lazy-imported on first click, lives in the shadow root, toggles, `aria-expanded`. Selecting opens the URL in a new tab.

## Search helper
`nx2/blocks/shared/tool-card/search.js` → `attachCardSearch(container)`: listens to `nx-cards-filter`, hides non-matching `nx-tool-card` children (heading + description, case-insensitive substring), pushes `{ section, count }` into `detail.results`, ignores events once `container` is disconnected, and dispatches `nx-cards-ready`.

## Blocks
- `cards`: parse row → `{ heading, href, description, learnMoreHref, icon, tint }`; byline for `.tools`: "By Adobe" + `byadobe`. Grid stays in `cards.css`.
- `site-apps`: keep hash/config fetch, `ref` filtering, section removal; render `<nx-tool-card heading description href image byline="By Admin">` into a 3-column grid (same as cards); `attachCardSearch`.

## Left to the builder
Exact style guide demo content (icons may not resolve locally); test fixture shapes.
