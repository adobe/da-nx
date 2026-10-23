# nx-card

A card shell for application content: a media area, selection checkbox, overlay
and trailing actions, and a heading with metadata. Consumers supply the content
and behavior.

## Usage

```html
<nx-card id="page" dimensions="m" size="s" selectable selection-label="Select about-us">
  <img slot="media" src="/preview.png" alt="">
  <a slot="heading" href="/about-us">about-us</a>
  <span slot="metadata">Page</span>
  <span slot="metadata">Modified yesterday</span>
  <button slot="actions" aria-label="More">…</button>
</nx-card>
```

```js
import "/path/to/card/card.js";

const card = document.querySelector("#page");
card.addEventListener("selectionchange", (e) => {
  card.selected = e.detail.selected;
});
```

## API

### Properties

| Property         | Type      | Description                                                                   |
| ---------------- | --------- | ----------------------------------------------------------------------------- |
| `dimensions`     | `String`  | Card footprint: `"s"` (151×200), `"m"` (226×300, default) or `"l"` (301×400). |
| `size`           | `String`  | Text and control scale: `"s"` (default), `"m"` or `"l"`. Independent of `dimensions`. |
| `selectable`     | `Boolean` | Shows the selection checkbox.                                                 |
| `selected`       | `Boolean` | Selected state. Controlled by the consumer.                                   |
| `selectionLabel` | `String`  | Accessible name of the checkbox (`selection-label`). Default `"Select item"`. |

Override the footprint with `--nx-card-width` and `--nx-card-height`.

### Slots

| Slot              | Description                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| `media`           | Preview image or component.                                                |
| `heading`         | Title, normally a link. The row reserves 32px so swapping in an input does not shift metadata. |
| `metadata`        | Secondary lines.                                                           |
| `actions`         | Trailing control next to the heading.                                      |
| `overlay-actions` | Controls over the top-right of the media, shown in a round light chip.     |
| `content`         | Replaces the heading and actions row, keeping metadata (for example inline rename). |

### Events

| Event             | Detail         | Description                                                       |
| ----------------- | -------------- | ----------------------------------------------------------------- |
| `selectionchange` | `{ selected }` | Fired when the checkbox is toggled. Set `selected` in response.   |
