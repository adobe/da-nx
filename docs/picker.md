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

Navigation fragments can include `siteselector` in the site-nav area.
This standalone block composes the picker without occupying the centered search slot.

Use `variant="field"` for a bordered, form-style picker trigger.

```html
<nx-picker variant="field" size="m" placeholder="Please select"></nx-picker>
```

This variant is visual and interactive only. It does not provide a label or participate in native form submission, validation, or reset behavior.
Its dropdown matches the rendered trigger width each time it opens unless
`--nx-picker-menu-width` is set.

### Navigation presentation

Use `variant="navigation"` with `check-position="start"` for a navigation menu
with medium-weight labels, regular descriptions, a top-aligned blue check,
compact row spacing and full-width dividers. Sections retain bold typography.
All text uses matching S/M component tokens.

```html
<nx-picker variant="navigation" check-position="start" size="m"></nx-picker>
```

Like `field`, its trigger fills the available width. The menu matches the trigger,
with a 240px minimum constrained to the viewport, unless `--nx-picker-menu-width`
specifies a width. This deliberate shared presentation restores the site selector's
original menu without exposing individual menu parts or changing other pickers.

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
| `variant`       | `String`              | `field` for a form-style trigger; `navigation` also provides the navigation menu presentation. |
| `checkPosition` | `String`              | `start` reserves leading check space on selectable rows. Default: end. Attribute: `check-position`. |
| `open`          | `Boolean` (read-only) | Whether the picker is currently open.                                          |

Trigger text precedence is: non-empty `labelOverride`, matching item label, `placeholder`, then blank. A placeholder is never added to the dropdown and does not change `value`.

## CSS parts

Use `::part(label)` to style the trigger text, or `::part(label)::before` to add a decorative icon.

Menu sections, dividers, descriptions, actions and checkmarks use the shared
presentation selected by `variant`; default and field menus remain unchanged.
Use `check-position="start"` for leading checks rather than rearranging menu internals.

`description` appears below the item label and is included in its accessible name
unless `ariaLabel` supplies an explicit name. Existing item shapes remain unchanged.

Trigger, item and section typography uses the matching S or M component tokens,
including font weight and dynamic size changes. Descriptions inherit the item's
font size and line height while
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
| `--nx-picker-menu-width` | Rendered field width, or automatic    | Menu width, constrained to the viewport. |

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

Item focus waits for popover positioning so the target is visible. Closing or
removing the picker before that frame cancels the pending focus.

## Standalone site selector

Add `siteselector` to a navigation fragment's site-nav list, alongside breadcrumbs
if both are needed. Nexter lazy-loads `nx2/blocks/siteselector/siteselector.js`.

The block owns presentation only. Set `sites` to `{ value: 'org/site', label: 'site (org)' }`
entries and `value` to the current identifier. Optional `heading`, `size` (`s` or `m`,
default `m`) and `error` customize content and density without replacing menu layout.
Landing pages can set `heading` to `Your recent sites`.
With no selected `value`, the loaded trigger shows this heading rather than
choosing a site from history. After selection it shows the host-supplied site
label. Clearing `value` restores the heading; routed deep links can still supply
an explicit selection.

The selector retains its outlined, pill-shaped trigger, light/dark surface and
bold S/M component-token label. These trigger styles belong to the standalone block
and use existing picker trigger properties and the label part. Its menu has a 240px
minimum and follows wider triggers. It uses
the shared navigation presentation, including medium labels, regular descriptions,
blue leading checks and an unindented Add action.
The trigger grows with its label between 220px and 280px on desktop, and shrinks
to its content up to 176px on mobile. The nav's site-nav container supplies compact
padding when space is constrained, without removing the trigger's intrinsic width.

On connection it emits bubbling, composed `site-selector-ready` with
`{ selector, signal }`. Register the host listener before loading the navigation.
The trigger stays inert until `sites` is assigned; use an empty array for loaded, empty history.
The signal aborts on removal; use it to release listeners, pending requests and dialogs.
Each reconnection emits a fresh signal.

`site-select` carries `{ value }`; `site-add` requests the host's Add flow.
An error displays a Try again button that emits `site-retry`.
These events bubble across the navigation shadow root. The host owns history, permission
checks, dialogs and routing. No DA application modules are imported by Nexter.
