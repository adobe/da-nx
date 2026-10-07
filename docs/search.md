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
Keep independently useful category pickers and filters alongside the field.

The optional `actions` slot places trailing controls inside the search field,
after Clear. Use it for controls such as Search options that should share the
field's border, background, and spacing. Slotted buttons receive
the field's compact button styling; no consumer-owned field wrapper is needed.
Consumers supply accessible labels, icons, disabled states, and click handlers.
Search does not interpret these actions or open panels.
The field border responds to input and Clear focus. Trailing actions have their
own keyboard-focus outline and do not highlight the field when focused.

```html
<nx-search variant="field" label="Search files" placeholder="Search files">
  <button slot="actions" type="button" aria-label="Search options">...</button>
</nx-search>
```

`nx-nav` provides a centered `search` slot. Consumers append their search control
with `slot="search"` and own its labels, events, execution, and cleanup. Nav does
not import a search implementation or dispatch search requests.

DA browse injects its field into this slot, labels it `Search <folder name>`,
and runs its existing content search. Search options uses the field's `actions`
slot. Clearing the field restores the directory listing; leaving browse removes
the injected field and its action.

This integration belongs to DA's redesigned `blocks/browse/v2/` implementation,
enabled with `?browse=2` before the URL hash. The stable browse entry point loads
the legacy `blocks/browse/legacy/` implementation by default and selects only one
implementation per page load.

Browse's Search options action lazily opens a right-hand Find & replace panel,
using the same Nexter panel registry as canvas. Browse owns this tools section
and its content. Match case is available before searching; changing it cancels
and reruns the submitted query rather than an unsubmitted draft.

The panel's Find input and nav search share one draft value. Users can start a
search from either input; opening the panel focuses Find even before a search
has been run. Editing either input cancels pending replacement confirmation and
disables replacement until the draft agrees with completed search results.

Browse keeps query, results, options, and replacement feedback in one reactive
state object. The search engine and request identity remain separate execution
references; clearing resets search state while retaining the match-case choice.

The panel groups highlighted, escaped source excerpts under their filenames,
with a single inline preview and no file picker. Matches are highlighted; as
replacement text is entered, the original match is struck through and the new
text appears alongside it. Empty replacements show only the struck-through
match when reviewed.
Context for the first three results is shown; the full result list stays in
browse. Search captures up to
three excerpts of at most 160 characters per file during the existing source
read, not whole documents. Filename-only matches are identified separately.
Excerpts reflect search-time content, may be truncated, and do not execute HTML;
replacement still rereads each file before saving.

Replacement requires completed results, write permission, and explicit review
and confirmation. It uses the same literal, case-aware matching as search,
preserves source file types, and reports skipped files and read/save failures.
An empty replacement removes matching text; filename-only matches are not
renamed or saved. Navigating or clearing invalidates pending confirmation and
queued replacement work; already-started writes cannot be undone by cancellation.
