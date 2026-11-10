# nx-tool-card

A card for a tool or app: icon or image tile, heading, description, a footer with an optional byline and an **Open** button, and a "…" menu ("Learn more", "Open in new tab"). Used by the `cards` block (Tools page) and `site-apps`.

Not to be confused with [`nx-card`](card.md), the media-preview card.

## Usage

```js
import '/nx2/blocks/shared/tool-card/tool-card.js';

const card = document.createElement('nx-tool-card');
card.heading = 'Traverse';
card.description = 'Get a birds eye view of the content by traversing a content tree.';
card.href = '/apps/traverse';
card.learnMoreHref = 'https://www.aem.live/docs/ew/authoring/content-tree';
card.icon = 'treeview';
card.tint = '#E5F0FE';
card.byline = 'By Adobe';
card.bylineIcon = 'byadobe';
grid.append(card);
```

```html
<nx-tool-card heading="Bulk Helper" description="Bulk things." href="/tools/bulk"
  image="/media/bulk.png" byline="By Admin"></nx-tool-card>
```

Place cards in your own grid, e.g. `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--s2-spacing-300);`. The card fills its grid cell, so cards in a row share one height and their footers line up.

## API

### Properties

| Property        | Attribute         | Type     | Description |
| --------------- | ----------------- | -------- | ----------- |
| `heading`       | `heading`         | `String` | Card title. |
| `description`   | `description`     | `String` | Body text. Optional. |
| `href`          | `href`            | `String` | Target of the **Open** button and the "Open in new tab" menu item. No `href` → no Open button. Links to another origin open in a new tab. |
| `learnMoreHref` | `learn-more-href` | `String` | Adds "Learn more" to the "…" menu. |
| `icon`          | `icon`            | `String` | Short S2 icon name: `treeview` → `/img/icons/s2-icon-treeview-20-n.svg`. Case and hyphens are ignored (`TreeView`, `tree-view`). Names with other characters are ignored. |
| `image`         | `image`           | `String` | Image URL for the tile (cover, rounded). Takes precedence over `icon`. |
| `tint`          | `tint`            | `String` | Tile background color, any CSS color. Invalid colors are ignored. |
| `byline`        | `byline`          | `String` | Footer text, e.g. "By Adobe". |
| `bylineIcon`    | `byline-icon`     | `String` | Short icon name shown before the byline, e.g. `byadobe`. |
| `hidden`        | `hidden`          | `Boolean`| Hides the card (used by search). |

### Tile

| Setup                | Result |
| -------------------- | ------ |
| `icon` + `tint`      | 20px icon on the tinted 40px tile. |
| `icon`, no `tint`    | Icon fills the whole 40px tile (e.g. a full-color logo). |
| `image`              | Image fills the 40px tile. |
| nothing              | Gray 40px tile. |

### Menu

The "…" button appears when the card has `href` and/or `learnMoreHref`. The menu (`nx-menu`) loads on first click, toggles on a second click, and reflects its state in `aria-expanded`. Selecting an item opens its URL in a new tab.

## Search

`nx2/blocks/shared/tool-card/search.js` lets a container of cards answer the cards-filter search:

```js
import { attachCardSearch } from '/nx2/blocks/shared/tool-card/search.js';

attachCardSearch(grid); // grid contains <nx-tool-card> children
```

It listens for `nx-cards-filter` on `document` (`detail: { query, results }`), hides cards whose heading and description don't contain the query (case-insensitive), pushes `{ section, count }` into `detail.results`, and dispatches `nx-cards-ready` once attached so a filter can re-send its current query. See the `cards-filter` block.

## Accessibility

- Heading renders as `<h3>`.
- Open: `aria-label="Open <heading>"`.
- "…": `aria-label="More options for <heading>"`, `aria-haspopup="menu"`, `aria-expanded`.
- Labels go through `loc`.
