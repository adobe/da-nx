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

When composing a picker with `nx-nav`, use `slot="context"` to place it after
the brand in the left cluster. The independent `slot="search"` remains centered.
Placement and navigation behavior belong to the consuming application.

Use `variant="field"` for a bordered, form-style picker trigger.

```html
<nx-picker variant="field" size="m" placeholder="Please select"></nx-picker>
```

This variant is visual and interactive only. It does not provide a label or participate in native form submission, validation, or reset behavior.
Its dropdown matches the rendered trigger width each time it opens.

### Fixed trigger label

Use `labelOverride` for a fixed trigger label. The dropdown still marks the selected item.

```js
picker.labelOverride = "Sort";
```

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
| `labelOverride` | `String`              | Non-empty text that replaces the selected item text inside the trigger.        |
| `placeholder`   | `String`              | Trigger fallback shown only when `value` does not match an item.               |
| `placement`     | `String`              | Default placement when opened: `below` (default), `above`, or `auto`.         |
| `size`          | `String`              | Item density: `s` (default) or `m`. Reflected as a host attribute.             |
| `variant`       | `String`              | Set to `field` for the bordered form-style presentation.                       |
| `open`          | `Boolean` (read-only) | Whether the picker is currently open.                                          |

Trigger text precedence is: non-empty `labelOverride`, matching item label, `placeholder`, then blank. A placeholder is never added to the dropdown and does not change `value`.

## CSS parts

Use `::part(label)` to style the trigger text, or `::part(label)::before` to add a decorative icon.

Menu presentation can be customized with `::part(menu)`, `::part(section)`,
`::part(divider)`, `::part(item)`, `::part(item-label)` and `::part(check)`.
Action items also expose `::part(action)` so consumers can align them independently
of selectable options while retaining shared `::part(item)` styles.
Application-specific layouts belong in the consuming
application rather than a domain-specific picker variant.

`description` appears below the item label and is included in its accessible name
unless `ariaLabel` supplies an explicit name. Existing item shapes remain unchanged.

Trigger, item and section typography uses the matching S or M component tokens,
including font weight and dynamic size changes. Descriptions inherit the item's
font size and line height, including consumer `::part(item)` overrides, while
keeping the matching regular component font-weight token.

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

Item focus waits for popover positioning so the target is visible. Closing or
removing the picker before that frame cancels the pending focus.
