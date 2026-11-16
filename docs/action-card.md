# nx-action-card

A card for something the user can act on, e.g. a tool or an app: icon tile, heading, description, a "…" menu, an action button, and an `extra` slot for content such as a byline.

Not to be confused with [`nx-card`](card.md), the media-preview card.

## Usage

```js
import '/nx2/blocks/shared/action-card/action-card.js';

const card = document.createElement('nx-action-card');
card.heading = 'Traverse';
card.description = 'Get a birds eye view of the content by traversing a content tree.';
card.innerHTML = '<svg slot="icon" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-treeview-20-n.svg#icon"></use></svg>';
card.tint = '#E5F0FE';
card.action = '/apps/traverse';
card.actionLabel = 'Open';
card.actionTarget = '_blank'; // optional
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
  action="/tools/bulk" action-label="Open" action-target="_blank">
  <img slot="icon" src="/media/bulk.jpeg" alt="">
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
| `tint`        | `tint`         | `String` | Tile background color, any CSS color. Invalid colors are ignored. |
| `menu`        | —              | `Array`  | Entries for the "…" menu, same shape as [`nx-menu`](menu.md) `items` (`{ id, label, icon?, description? }`, `{ section }`, `{ divider: true }`). Empty or unset → no "…" button. |
| `action`      | `action`       | `String` | URL of the action button. Unset → no button. The button is the shared `.nx-btn-primary` (`nx2/styles/buttons.css`), outlined by the card's own CSS. |
| `actionLabel` | `action-label` | `String` | Text of the action button. Defaults to "Open". |
| `actionTarget` | `action-target` | `String` | Optional browser target for the action link, e.g. `_blank` (new tab) or a window name. Targets other than `_self`, `_parent`, `_top` get `rel="noopener"`. Unset → URLs on another origin open in a new tab, others in the same tab. |
| `variant` | `variant` | `String` | `start`: compact heading, 56px bordered logo tile, left-aligned action, no footer byline. Unset preserves the default Tools presentation. |
| `size` | `size` | `String` | For `variant="start"`, `s` (default) or `m`. M uses 16px text, 34px logos and 40px action buttons. The owner passes this size; the card does not read the global preference. |

### Slots

| Slot    | Description |
| ------- | ----------- |
| `icon`  | The tile content: any element, typically an `<svg>` (e.g. `<svg><use href="/img/icons/s2-icon-treeview-20-n.svg#icon"></use></svg>`, colored with the tile's `currentcolor`) or an `<img>` (any format, shown with `object-fit: cover`). Optional. |
| `extra` | Content on the left of the footer, e.g. a byline ("By Adobe" with a logo, "By Admin"). The card sets the base text style (14px, gray); the consumer styles anything else. |

### Events

| Event    | Detail   | Description |
| -------- | -------- | ----------- |
| `select` | `{ id }` | A menu entry was chosen. Bubbles out of the card (from `nx-menu`). The consumer decides what to do, e.g. open a URL. |

### Tile

| Setup           | Result |
| --------------- | ------ |
| icon + `tint`   | 20px icon on the tinted 40px tile. |
| icon only       | Icon fills the whole 40px tile (e.g. a full-color logo or an image). |
| `tint` only     | Tinted 40px tile without an icon. |
| nothing         | No tile is rendered. Without a tile and a menu, the card starts with the heading. |

With `variant="start"`, the tile is 56px with a border and a 32px logo (34px in M), with or without a tint. Images use `object-fit: contain`.

## Authored Start cards

The `nx-cards start` block renders the same shared cards with the Start presentation. Each row has two cells:

1. An image or an S2 icon (`:name:`), optionally followed by an italic tint color.
2. A heading, description paragraphs, and an optional standalone paragraph link for the action label and destination.

```html
<div class="nx-cards start">
  <div>
    <div><picture><img src="/img/figma-logo.svg" alt=""></picture></div>
    <div>
      <h3>Figma Design</h3>
      <p>Create an AEM site from your Figma design.</p>
      <p><a href="/modernization">Use Modernization Agent</a></p>
    </div>
  </div>
</div>
```

The action paragraph is not included in the description. Without it, a heading link remains the action with the default "Open" label. An authored list link still supplies the optional Learn more menu, as in Tools; omit it for cards without a menu. The byline is only added by the `tools` block variant.

The consuming page owns the surrounding heading, panel and page layout. The grid fits two 308px cards in a 632px container and collapses to one column when narrower. Content is read from the block on the page, without a separate content fetch.

## Hiding

The card has no visibility logic. Consumers that filter cards (e.g. the `cards` block's search) set `hidden` on the card and style it themselves, e.g. `.my-grid > nx-action-card[hidden] { display: none; }`.

## Accessibility

- Heading renders as `<h3>`.
- Action: `aria-label="<actionLabel> <heading>"`.
- "…": `aria-label="More options for <heading>"`, `aria-haspopup="menu"`, `aria-expanded`. The menu loads on first click and toggles on a second click.
- Labels go through `loc`.
