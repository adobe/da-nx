# Search field

Import `nx2/blocks/shared/search/search.js` to register `nx-search`.

```html
<nx-search
  variant="field"
  size="m"
  label="Search files"
  placeholder="Search files"
></nx-search>
<nx-search size="s" label="Filter files" placeholder="Filter files"></nx-search>
```

Properties: `value` (default empty), `label` (default "Search"), `placeholder`,
`disabled`, `variant` (`field` for a bordered box; unset for the borderless compact appearance),
and `size` (`s` or `m`, matching picker/menu naming).
`variant` and `size` remain unset unless supplied; CSS uses small sizing when `size` is unset.
Appearance and size are independent: either variant supports either size.
Both sizes retain a 32px minimum field height; size adjusts typography and icons.
Borderless search shows a bottom focus line; `field` uses a bordered box.
`label` labels the native search input, independently of its placeholder.
`focus(options)` focuses the input; `clear()` clears it and restores focus.

Events bubble and cross shadow boundaries:

- `input`: typing or clearing; read `event.target.value`. Programmatic value
  changes do not emit events.
- `change`: native value commitment, normally on blur.
- `search-submit`: Enter, with `detail: { value }`. The field prevents implicit
  form submission. Consumers decide how to handle empty queries and whitespace.

The clear button and Escape emit one `input` event when clearing a non-empty
value. Enter/Escape are ignored during IME composition. Disabled fields cannot
be edited or cleared.

Consumers handle filtering and search results.
Use the `actions` slot for trailing controls such as Search options.
Supply an accessible label and click handler for each action.

```html
<nx-search variant="field" label="Search files" placeholder="Search files">
  <button slot="actions" type="button" aria-label="Search options">...</button>
</nx-search>
```

Use `slot="search"` to place the control in `nx-nav`.
