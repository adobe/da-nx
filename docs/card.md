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
| `layout`         | `String`  | Opt-in `"compact"` presentation: 80px media, shorter heading and one metadata line. Unset preserves the portrait presets. |
| `selectable`     | `Boolean` | Shows the selection checkbox.                                                 |
| `selected`       | `Boolean` | Selected state. Controlled by the consumer.                                   |
| `selectionLabel` | `String`  | Accessible name of the checkbox (`selection-label`). Default `"Select item"`. |

Override the footprint with `--nx-card-width` and `--nx-card-height`.
Compact layout uses content-driven height and `--nx-card-preview-height`
(80px by default). It is a presentation of the same card, not a fourth
dimension preset. Consumers can use one preset without exposing a size selector;
`size` remains independent.

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

### Events

| Event             | Detail         | Description                                                       |
| ----------------- | -------------- | ----------------------------------------------------------------- |
| `nx-card-selection-change` | `{ selected, shiftKey }` | Fired when the checkbox is toggled. Set `selected` in response; `shiftKey` supports range selection. |

## Existing compact consumers

The earlier `preview`, `title`, `selection` and `badge` slots remain supported.
Their presence selects the fill-cell compact layout used by Landing, with
application-owned selection and badges. Its 4px frame/gaps and 12px content
inset are preserved. `--nx-card-preview-height`, `--nx-card-preview-ratio` and
`--nx-card-background` continue to control its preview geometry and surface.
Using `media` and `heading` retains the dimension presets and controlled
selection API documented above.
