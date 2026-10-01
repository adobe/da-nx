# nx-picker

A dropdown picker with a built-in trigger button, keyboard navigation, and a checkmark on the selected item. Supports dividers and color swatches.

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

### Form-style field

Use `variant="field"` for a bordered, form-style picker trigger.

```html
<nx-picker variant="field" size="m" placeholder="Please select"></nx-picker>
```

This variant is visual and interactive only. It does not provide a label or participate in native form submission, validation, or reset behavior.
Its dropdown matches the rendered trigger width each time it opens.

## Item shapes

Each entry in the `items` array is one of:

```js
// Regular item
{ value: 'content', label: 'Content' }

// Item with a color swatch (any CSS background value: hex, rgb(), gradient…)
{ value: 'blue', label: 'Blue', swatch: '#1473e6' }

// Visual divider
{ divider: true }
```

When the selected item has a `swatch`, the trigger shows it before the label too. The swatch matches `nx-menu`'s `swatch` item property (16px rounded square), so both components share one item API.

## API

### Properties

| Property        | Type                  | Description                                                                    |
| --------------- | --------------------- | ------------------------------------------------------------------------------ |
| `items`         | `Array`               | List of item descriptors (see shapes above).                                   |
| `value`         | `String`              | The currently selected item value. Drives the trigger text and checkmark.      |
| `labelOverride` | `String`              | Non-empty text that replaces the selected item text inside the trigger.        |
| `placeholder`   | `String`              | Trigger fallback shown only when `value` does not match an item.               |
| `placement`     | `String`              | Default placement when opened: `below` (default), `above`, or `auto`.         |
| `size`          | `String`              | Item density: `s` (default) or `m`. Reflected as a host attribute.             |
| `variant`       | `String`              | Set to `field` for the bordered form-style presentation.                       |
| `open`          | `Boolean` (read-only) | Whether the picker is currently open.                                          |

Trigger text precedence is: non-empty `labelOverride`, matching item label, `placeholder`, then blank. A placeholder is never added to the dropdown and does not change `value`.

## CSS custom properties

| Property                 | Field default                         | Description               |
| ------------------------ | ------------------------------------- | ------------------------- |
| `--nx-picker-height`     | `32px`                                | Trigger height.           |
| `--nx-picker-padding`    | Size-dependent picker padding         | Trigger padding.          |
| `--nx-picker-border`     | `none`                                | Trigger border.           |
| `--nx-picker-radius`     | `var(--s2-corner-radius-500)`         | Trigger border radius.    |
| `--nx-picker-background` | `var(--s2-gray-100)`                  | Trigger background.       |
| `--nx-picker-max-width`  | `none`                                | Maximum component width.  |

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

Arrow keys open the picker when focus is on the trigger. When open, arrow keys move focus between items, Enter selects the active item, and Escape closes the picker.
