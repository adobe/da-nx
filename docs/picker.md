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

### Emphasized presentation

Use `variant="emphasized"` for bold sections, medium-weight labels and S-regular,
theme-aware descriptions. Add `check-position="start"` for leading blue checks.

```html
<nx-picker variant="emphasized" check-position="start" size="m"></nx-picker>
```

The trigger fills the available width. The menu matches it with a viewport-constrained
240px minimum; `--nx-picker-menu-width` overrides the width.

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
| `variant`       | `String`              | `field` for a form-style trigger; `emphasized` also provides bold sections and medium-weight menu labels. |
| `checkPosition` | `String`              | `start` reserves leading check space on selectable rows. Default: end. Attribute: `check-position`. |
| `open`          | `Boolean` (read-only) | Whether the picker is currently open.                                          |

Trigger text precedence is: non-empty `labelOverride`, matching item label, `placeholder`, then blank. A placeholder is never added to the dropdown and does not change `value`.

## CSS parts

Use `::part(label)` to style the trigger text, or `::part(label)::before` to add a decorative icon.

`variant` controls menu presentation; `check-position="start"` provides leading checks.
Descriptions appear below labels and join the accessible name unless `ariaLabel` overrides it.
Emphasized typography, focus color and menu bounds are opt-in; default and field
styling is preserved. Their descriptions match row size with regular weight;
emphasized descriptions stay S-regular.

## CSS custom properties

| Property                 | Field default                         | Description               |
| ------------------------ | ------------------------------------- | ------------------------- |
| `--nx-picker-height`     | `32px`                                | Trigger height.           |
| `--nx-picker-padding`    | Size-dependent picker padding         | Trigger padding.          |
| `--nx-picker-border`     | `none`                                | Trigger border.           |
| `--nx-picker-radius`     | `var(--s2-corner-radius-500)`         | Trigger border radius.    |
| `--nx-picker-background` | `var(--s2-gray-100)`                  | Trigger background.       |
| `--nx-picker-max-width`  | `none`                                | Maximum component width.  |
| `--nx-picker-menu-width` | Rendered field width, or automatic    | Menu width; viewport-constrained in emphasized. |

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

Triggers use a 2px focus ring: current text color for default/field, blue
(`--s2-blue-800`) and inset for emphasized to avoid clipping in scroll containers.
`--s2-focus-ring-color` overrides either.
Item focus waits for popover positioning and is skipped if the picker closes or disconnects first.

## Standalone site selector

Add `siteselector` to a navigation fragment's site-nav list, alongside breadcrumbs
if needed. Nexter lazy-loads the block and its controller; Add loads only when opened.
No application adapter or DA imports are required. Only navigation fragments containing
`siteselector` load it; there is no dedicated rollout toggle.

The block owns current-site and browser-local `da-sites` choices, access checks and
selection. Confirmed denials hide choices without deleting history or changing the route;
uncertain failures show an error and retry. Cached denials need a successful recheck.
Add validates site access and the organization listing without backend writes or access grants.

| Property | Purpose |
| -------- | ------- |
| `heading` | Unselected trigger and section label; defaults to `Your recent sites`. |
| `size` | `s` (managed default) or `m`; bold trigger at 14px/18px or 16px/20px. |
| `value` | Selected `org/site`; clearing it restores the heading. |
| `error` | Error message with retry. |
| `onSelect` | Optional `({ value }) => { ... }` callback for page-specific reactions. |
| `getCreateSiteHref` | Optional `({ org }) => href` override; return `undefined` to hide Create. |

Both sizes use the shared M emphasized menu with S-regular paths (`--s2-gray-700`).
Menu names are capitalized; identifiers and emitted values are unchanged.
Managed selected triggers show only `org/site`; menu rows retain the name and path.
Explicitly supplied labels are preserved.

The selector renders only when there are sites to pick from. While loading or with no
choices it sets `hidden`, takes no space, and the nav collapses its list item, similar to
breadcrumbs on root. Pages own the empty-state Add action; dispatching a bubbling
`site-add` event opens the same dialog while a selector is connected. Available sites
still render a picker even when none is selected.

Selecting or adding updates selection and history without navigation. Hash changes
resynchronize selection. Create opens the host's `/start?org=...` only after an explicit
organization-config write grant. Its default URL preserves preview parameters, removes
`site` and `browse`, and clears the hash. Hosts without `/start` must override or hide Create.

Register optional host configuration before navigation loads. The bubbling, composed
`site-selector-ready` event carries `{ selector, signal }` before the controller loads;
the signal aborts on removal and releases listeners, checks and dialogs. Reconnection
starts a fresh controller. Await `selector.ready` for initial access checks.
`site-select` (`{ value }`), `site-add` and `site-retry` also bubble across shadow roots.

For externally controlled rendering, assign `sites` before first connection or in the
synchronous ready listener, then manage `value` and events yourself:
`[{ value: 'org/site', label: 'Site, org/site' }]`. An empty array (no choices) or
`undefined` (loading) renders nothing. Controlled instances have no controller or `ready`.
