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
Its dropdown matches the rendered trigger width each time it opens unless
`--nx-picker-menu-width` is set.

### Fixed trigger label

Use `labelOverride` for a fixed trigger label. The dropdown still marks the selected item.

```js
picker.labelOverride = "Sort";
```

### Multiple selection

Set `multiple` to let users toggle several items. Selection lives in `values` (a new array on each change); `value` is ignored.

```js
picker.multiple = true;
picker.values = ["content", "seo"];
picker.addEventListener("change", (e) => {
  const { value, values, selected } = e.detail; // value: toggled item
});
```

- Clicking or pressing Enter toggles an item; the popover stays open.
- Items with `action: true` still close the popover and fire `change` with `{ value }` (e.g. a "Clear all" entry; reset `values` in the handler).
- Trigger shows `labelOverride`, else selected labels joined with `, `, else `placeholder`. No swatch is shown.
- The listbox gets `aria-multiselectable="true"`.
- On open, the first selected item is active.

## Item shapes

Each entry in the `items` array is one of:

```js
// Regular item
{ value: 'content', label: 'Content' }

// Optional secondary text
{ value: 'draft', label: 'Draft', description: 'Not published' }

// Action: emits change without replacing the current selection
{ value: 'add', label: 'Add...', action: true }

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
| `multiple`      | `Boolean`             | Enables multiple selection. Reflected as an attribute. Default `false`.        |
| `values`        | `Array`               | Selected item values when `multiple` is set.                                   |
| `labelOverride` | `String`              | Non-empty text that replaces the selected item text inside the trigger.        |
| `placeholder`   | `String`              | Trigger fallback shown only when `value` does not match an item.               |
| `placement`     | `String`              | Default placement when opened: `below` (default), `above`, or `auto`.         |
| `size`          | `String`              | Item density: `s` (default) or `m`. Reflected as a host attribute.             |
| `variant`       | `String`              | `field` for a form-style trigger. |
| `checkPosition` | `String`              | `start` reserves leading check space on selectable rows. Default: end. Attribute: `check-position`. |
| `open`          | `Boolean` (read-only) | Whether the picker is currently open.                                          |

Trigger text precedence is: non-empty `labelOverride`, matching item label, `placeholder`, then blank. A placeholder is never added to the dropdown and does not change `value`.

## CSS parts

Use `::part(label)` to style the trigger text.

`check-position="start"` provides leading checks.
Descriptions appear below labels and join the accessible name unless `ariaLabel` overrides it.
Descriptions consistently use small regular typography and the subdued,
theme-aware `--s2-gray-700` color in both row sizes. Long descriptions wrap.
Consumer-specific trigger
presentation belongs in the consumer's stylesheet; the menu uses shared picker styles.

## CSS custom properties

| Property                 | Field default                         | Description               |
| ------------------------ | ------------------------------------- | ------------------------- |
| `--nx-picker-height`     | `32px`                                | Trigger height.           |
| `--nx-picker-padding`    | Size-dependent picker padding         | Trigger padding.          |
| `--nx-picker-border`     | `none`                                | Trigger border.           |
| `--nx-picker-radius`     | `var(--s2-corner-radius-500)`         | Trigger border radius.    |
| `--nx-picker-background` | `var(--s2-gray-100)`                  | Trigger background.       |
| `--nx-picker-max-width`  | `none`                                | Maximum component width.  |
| `--nx-picker-menu-width` | Rendered field width, or automatic    | Menu width, capped at the viewport minus 20px. |
| `--nx-picker-check-color` | `var(--s2-gray-800)`                 | Selected checkmark color. |
| `--nx-picker-section-color` | `var(--s2-gray-700)`               | Section title color.      |
| `--nx-picker-item-padding` | `var(--s2-spacing-75) var(--s2-spacing-100)` | Menu row padding. |

### Methods

| Method  | Signature | Description                        |
| ------- | --------- | ---------------------------------- |
| `show`  | `()`      | Opens the picker.                  |
| `close` | `()`      | Closes the picker.                 |
| `focus` | `(options)` | Focuses the trigger.              |

### Events

| Event    | Detail      | Description                                                                              |
| -------- | ----------- | ---------------------------------------------------------------------------------------- |
| `change` | `{ value }` | Fired when the user clicks or keyboard-confirms an item. `value` matches the item field. In `multiple` mode: `{ value, values, selected }`. |

## Keyboard behaviour

Arrow keys open the picker when focus is on the trigger. When open, arrow keys move focus between items, Enter selects the active item, and Escape closes the picker.

Triggers use a 2px focus ring in the current text color.
`--s2-focus-ring-color` overrides it.
Item focus waits for popover positioning and is skipped if the picker closes or disconnects first.
