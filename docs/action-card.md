# nx-action-card

A card for something the user can act on, e.g. a tool or an app: icon tile, heading, description, a "…" menu, an action button, and an `extra` slot for content such as a byline.

Not to be confused with [`nx-card`](card.md), the media-preview card.

## Usage

```js
import '/nx2/blocks/shared/action-card/action-card.js';

const card = document.createElement('nx-action-card');
card.heading = 'Traverse';
card.description = 'Get a birds eye view of the content by traversing a content tree.';
card.icon = '/img/icons/s2-icon-treeview-20-n.svg';
card.tint = '#E5F0FE';
card.action = '/apps/traverse';
card.actionLabel = 'Open';
card.menu = [
  { id: 'learn-more', label: 'Learn more' },
  { id: 'open-new-tab', label: 'Open in new tab' },
];
card.addEventListener('select', (e) => {
  // e.detail.id — 'learn-more' | 'open-new-tab'
});
grid.append(card);
```

```html
<nx-action-card heading="Bulk Helper" description="Bulk things."
  icon="/media/bulk.svg" action="/tools/bulk" action-label="Open">
  <span slot="extra">By Admin</span>
</nx-action-card>
```

Place cards in your own grid, e.g. `grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--s2-spacing-300);`. The card fills its grid cell, so cards in a row share one height and their footers line up.

## API

### Properties

| Property      | Attribute      | Type     | Description |
| ------------- | -------------- | -------- | ----------- |
| `heading`     | `heading`      | `String` | Card title. |
| `description` | `description`  | `String` | Body text. Optional. |
| `icon`        | `icon`         | `String` | URL of an SVG icon. The SVG needs an element with `id="icon"` (rendered as `<use href="{icon}#icon">`) on the same origin as the page. Optional. |
| `tint`        | `tint`         | `String` | Tile background color, any CSS color. Invalid colors are ignored. |
| `menu`        | —              | `Array`  | Entries for the "…" menu, same shape as [`nx-menu`](menu.md) `items` (`{ id, label, icon?, description? }`, `{ section }`, `{ divider: true }`). Empty or unset → no "…" button. |
| `action`      | `action`       | `String` | URL of the action button. Unset → no button. URLs on another origin open in a new tab. |
| `actionLabel` | `action-label` | `String` | Text of the action button. Defaults to "Open". |

### Slots

| Slot    | Description |
| ------- | ----------- |
| `extra` | Content on the left of the footer, e.g. a byline ("By Adobe" with a logo, "By Admin"). The card sets the base text style (14px, gray); the consumer styles anything else. |

### Events

| Event    | Detail   | Description |
| -------- | -------- | ----------- |
| `select` | `{ id }` | A menu entry was chosen. Bubbles out of the card (from `nx-menu`). The consumer decides what to do, e.g. open a URL. |

### Tile

| Setup           | Result |
| --------------- | ------ |
| `icon` + `tint` | 20px icon on the tinted 40px tile. |
| `icon` only     | Icon fills the whole 40px tile (e.g. a full-color logo). |
| `tint` only     | Tinted 40px tile without an icon. |
| nothing         | No tile is rendered. Without a tile and a menu, the card starts with the heading. |

### "…" icon

The "…" icon ships with nx2 (`nx2/img/icons/s2-icon-more-20-n.svg`) and is inlined, so it shows on any host.

## Hiding

The card has no visibility logic. Consumers that filter cards (e.g. the `cards` block's search) set `hidden` on the card and style it themselves, e.g. `.my-grid > nx-action-card[hidden] { display: none; }`.

## Accessibility

- Heading renders as `<h3>`.
- Action: `aria-label="<actionLabel> <heading>"`.
- "…": `aria-label="More options for <heading>"`, `aria-haspopup="menu"`, `aria-expanded`. The menu loads on first click and toggles on a second click.
- Labels go through `loc`.
