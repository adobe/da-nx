# nx-card

A compact card for catalog lists. Renders a heading, optional subheading, a pill/badge slot, and an actions slot. Supports `selected` and `interactive` host states.

## Usage

```html
<nx-card
  heading="my-skill"
  subheading="Summarises pull requests"
  selected
  interactive
>
  <span slot="pill" class="status-dot"></span>
  <button slot="actions" type="button">⋮</button>
</nx-card>
```

```js
import '../shared/card/card.js';
```

## API

### Properties

| Property      | Type      | Reflect | Description                                    |
| ------------- | --------- | ------- | ---------------------------------------------- |
| `heading`     | `String`  | no      | Primary text line.                             |
| `subheading`  | `String`  | no      | Secondary text line (smaller, muted).          |
| `pill`        | `String`  | no      | Inline pill text (alternative to pill slot).   |
| `selected`    | `Boolean` | yes     | Highlights the card with the accent border.    |
| `interactive` | `Boolean` | yes     | Adds pointer cursor and hover styles.          |

### Slots

| Slot      | Description                                              |
| --------- | -------------------------------------------------------- |
| (default) | Additional body content below heading/subheading.        |
| `pill`    | Badge or status dot rendered before the body.            |
| `actions` | Trailing action buttons (overflow menu, checkbox, etc.). |

### CSS Parts

| Part          | Description              |
| ------------- | ------------------------ |
| `card`        | The outer `.card` div.   |
| `pill`        | The inline pill element. |
| `heading`     | Heading span.            |
| `subheading`  | Subheading span.         |

### Host attributes used in CSS

- `:host([selected])` — accent border and background.
- `:host([interactive])` — pointer cursor and hover state.
