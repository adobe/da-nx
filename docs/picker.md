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

### Form-style field

Use `variant="field"` for a bordered, form-style picker trigger.

```html
<nx-picker variant="field" size="m"></nx-picker>
```

This variant is visual and interactive only. It does not provide a label or participate in native form submission, validation, or reset behavior.

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

| Property        | Type                  | Description                                                                    |
| --------------- | --------------------- | ------------------------------------------------------------------------------ |
| `items`         | `Array`               | List of item descriptors (see shapes above).                                   |
| `value`         | `String`              | The currently selected item value. Drives the trigger text and checkmark.      |
| `labelOverride` | `String`              | Non-empty text that replaces the selected item text inside the trigger.        |
| `placement`     | `String`              | Default placement when opened: `below` (default), `above`, or `auto`.         |
| `size`          | `String`              | Item density: `s` (default) or `m`. Reflected as a host attribute.             |
| `variant`       | `String`              | Set to `field` for the bordered, stacked-label presentation.                   |
| `open`          | `Boolean` (read-only) | Whether the picker is currently open.                                          |

## CSS custom properties

| Property                 | Field default                         | Description               |
| ------------------------ | ------------------------------------- | ------------------------- |
| `--nx-picker-height`     | `32px`                                | Trigger height.           |
| `--nx-picker-padding`    | `0 var(--s2-spacing-200)`             | Trigger padding.          |
| `--nx-picker-border`     | `2px solid var(--s2-gray-300)`        | Trigger border.           |
| `--nx-picker-radius`     | `var(--s2-corner-radius-500)`         | Trigger border radius.    |
| `--nx-picker-background` | `var(--s2-gray-25)`                   | Trigger background.       |
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
