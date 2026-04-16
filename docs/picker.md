# nx-picker

A dropdown picker with a built-in trigger button, keyboard navigation, and a checkmark on the selected item. Supports dividers.

## Usage

The trigger is built-in — the component renders its own button showing the current selection.

```html
<nx-picker id="my-picker" placement="below"></nx-picker>
```

```js
import "/path/to/picker/picker.js";

const picker = document.querySelector("#my-picker");
picker.items = [
  { value: "all",      label: "All" },
  { value: "content",  label: "Content" },
  { value: "seo",      label: "SEO" },
  { divider: true },
  { value: "review",   label: "Review" },
];
picker.value = "all";

picker.addEventListener("change", (e) => {
  console.log(e.detail.value); // 'all' | 'content' | 'seo' | 'review'
});
```

## Item shapes

Each entry in the `items` array is one of:

```js
// Regular item
{ value: 'content', label: 'Content' }

// Visual divider
{ divider: true }
```

## API

### Properties

| Property    | Type                  | Description                                                                        |
| ----------- | --------------------- | ---------------------------------------------------------------------------------- |
| `items`     | `Array`               | List of item descriptors (see shapes above).                                       |
| `value`     | `String`              | The currently selected item value. Drives the trigger label and the checkmark.     |
| `placement` | `String`              | Default placement when opened: `below` (default), `above`, or `auto`.             |
| `open`      | `Boolean` (read-only) | Whether the picker is currently open.                                              |

### Methods

| Method  | Signature | Description                        |
| ------- | --------- | ---------------------------------- |
| `show`  | `()`      | Opens the picker.                  |
| `close` | `()`      | Closes the picker.                 |

### Events

| Event    | Detail      | Description                                                                              |
| -------- | ----------- | ---------------------------------------------------------------------------------------- |
| `change` | `{ value }` | Fired when the user clicks or keyboard-confirms an item. `value` matches the item field. |

## Keyboard behaviour

When the picker is open, arrow keys move focus between items and Enter selects the active item. Escape closes the picker.
