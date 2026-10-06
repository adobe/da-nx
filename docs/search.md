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

Consumers own filtering, debounce, crawling, search execution, and results.
Keep category pickers and other scope controls alongside the field.

`nx-nav` provides a centered `search` slot. Consumers append their search control
with `slot="search"` and own its labels, events, execution, and cleanup. Nav does
not import a search implementation or dispatch search requests.

DA browse injects its field into this slot, labels it `Search <folder name>`,
and runs its existing content search. Clearing the field restores the directory
listing; leaving browse removes the injected control.
