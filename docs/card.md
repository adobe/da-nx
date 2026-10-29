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
card.addEventListener("nx-card-selection-change", (e) => {
  card.selected = e.detail.selected;
});
```

## API

### Properties

| Property         | Type      | Description                                                                   |
| ---------------- | --------- | ----------------------------------------------------------------------------- |
| `dimensions`     | `String`  | Card footprint: `"s"` (151×200), `"m"` (226×300, default) or `"l"` (301×400). |
| `size`           | `String`  | Text and control scale: `"s"` (default), `"m"` or `"l"`. Independent of `dimensions`. |
| `layout`         | `String`  | Opt-in `"compact"` presentation with an 80px preview, shorter heading and one metadata line. Omit for unchanged portrait presets. |
| `selectable`     | `Boolean` | Shows the selection checkbox.                                                 |
| `selected`       | `Boolean` | Selected state. Controlled by the consumer.                                   |
| `selectionLabel` | `String`  | Accessible name of the checkbox (`selection-label`). Default `"Select item"`. |

Override the footprint with `--nx-card-width` and `--nx-card-height`.

Compact cards use content height instead of the portrait height preset.
`--nx-card-preview-height` changes their preview height. With a 24px heading,
18px metadata line and a 4px frame/gap, the S card is 142px tall. M text and
controls may grow the body without shrinking the preview. Set width independently
using `--nx-card-width`; `size` never chooses dimensions.

### Methods

`card.focus(options)` focuses the selection checkbox when `selectable`; otherwise
it uses native host focus (the host must be focusable, for example with `tabindex="-1"`).
Accepts standard focus options such as `{ preventScroll: true }`. After changing
`selectable` or first mounting the card, await `card.updateComplete` before focusing.
Consumers should use this API rather than querying the card's shadow DOM.

### Slots

| Slot              | Description                                                                |
| ----------------- | -------------------------------------------------------------------------- |
| `media`           | Preview image or component.                                                |
| `heading`         | Title, normally a link. The row reserves 32px so swapping in an input does not shift metadata. |
| `metadata`        | Secondary lines.                                                           |
| `actions`         | Trailing control next to the heading.                                      |
| `overlay-actions` | Controls over the top-right of the media, shown in a round light chip.     |
| `content`         | Replaces the heading and actions row, keeping metadata (for example inline rename). |

Existing `preview`, `title`, `selection` and `badge` slots remain supported.
They retain the fluid layout and `--nx-card-preview-height` /
`--nx-card-preview-ratio` overrides until the consumer migrates to the slots above.

### Events

| Event             | Detail         | Description                                                       |
| ----------------- | -------------- | ----------------------------------------------------------------- |
| `nx-card-selection-change` | `{ selected, shiftKey }` | Fired when the checkbox is toggled. Set `selected` in response; `shiftKey` supports range selection. |
