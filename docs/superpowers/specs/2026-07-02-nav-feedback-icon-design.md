# Nav feedback icon — design

## Context

The main navigation (`nx2/blocks/nav/nav.js`) reads its content from a fragment
(default `/nx/fragments/nav`). The last section of that fragment is the
"action area" — a `<ul>` whose `<li>` items become action buttons/components
in the top-right of the nav, next to the profile menu.

We're adding a new **Feedback** action item, rendered as an icon button next
to the profile avatar. Clicking it opens a small popover menu with three
items (per Figma):

1. "Submit an idea" — opens a dialog (stub for now, no submission endpoint yet).
2. "Report a bug" — opens a dialog (stub for now, no submission endpoint yet).
3. "Join our Discord Server" — external link, opens in a new tab.

The menu items are content-driven, sourced from a separate fragment:
`/fragments/nav/feedback`, e.g.:

```html
<div>
  <p><a href="#idea"><span class="icon icon-idea"></span>Submit an idea</a><br><em>Suggestions and feature requests</em></p>
  <p><a href="#bug"><span class="icon icon-bug"></span>Report a bug</a><br><em>Problems using AEM</em></p>
  <p><a href="https://discord.gg/X8D9JhyDX"><span class="icon icon-discord"></span>Join our Discord Server</a><br><em>Discussion forum</em></p>
</div>
```

Icon assets (`S2_Icon_Feedback_20_N.svg`, `S2_Icon_Idea_20_N.svg`,
`S2_Icon_Bug_20_N.svg`, `S2_Icon_Discord_20_N.svg`) are out of scope — they
will be added separately.

## How the trigger gets wired up

The nav fragment's Feedback `<li>` contains a link to a hash-fragment path,
e.g. `href="/fragments/nav/feedback#feedback"`. The existing
`decorateLink`/`loadBlock` auto-block mechanism in `nx2/scripts/nx.js`
converts matching links into blocks based on `config.linkBlocks`.

Today, any `/fragments/...#hash` link matches the generic
`{ fragment: '/fragments/' }` entry and becomes class `nx-dialog auto-block`
(loading `nx2/blocks/dialog/dialog.js`). That block only builds a button
shell — clicking it currently does nothing (no wiring exists in the
codebase to open anything from `data-pathname`). This is a pre-existing gap
in nx2, out of scope for this work — we're not fixing Help's wiring.

To get our own dedicated block instead of falling into the generic
`nx-dialog` bucket, we add a more specific entry to `linkBlocks` in
`nx2/scripts/scripts.js`, placed **before** the generic fragment entry:

```js
const linkBlocks = [
  { 'nx-feedback': '/fragments/nav/feedback' },
  { fragment: '/fragments/' },
  { 'action-button': '/tools/widgets/panel' },
];
```

Because the object key is used verbatim as the class name when it isn't
`'fragment'`, this produces `<a class="nx-feedback auto-block" ...>`, and
`loadBlock` (seeing the `nx-` prefix) imports `nx2/blocks/feedback/feedback.js`.

Resulting DOM after decoration (matches the Help button's shape):

```html
<button class="nx-feedback auto-block" data-pathname="/fragments/nav/feedback">
  <span class="icon icon-feedback"><svg>...</svg></span>Feedback
</button>
```

## Component: `nx2/blocks/feedback/feedback.js`

**Amendment (post-review):** the design below was updated after discovering
an existing shared `<nx-menu>` component (`nx2/blocks/shared/menu/menu.js`,
already used by `chat.js`) that handles popover positioning, keyboard nav,
ARIA, and item rendering generically. We use it instead of hand-rolling
menu behavior on top of raw `nx-popover`. `nx-menu` is extended with an
optional `item.description` field (backward compatible) so items can show
a title + subtext line, matching the Figma reference.

One file, three parts (small enough to stay together per project
conventions).

### 1. `parseFeedbackItems(fragment)` (pure helper, exported for testing)

Parses the fetched `/fragments/nav/feedback` content into
`{ id, label, description, icon, href }` objects, one per `<p>` row:

- `icon` — derived from the row's `<span class="icon icon-X">` class token
  (`X`), used as `nx-menu`'s `item.icon` (lowercase, matches the
  `s2-icon-<name>-20-n.svg` convention `nx-menu` already expects —
  independent from the `S2_Icon_<Name>_20_N.svg` convention used by the
  trigger button's own icon span).
- `label` — the link's trimmed text content.
- `description` — the row's `<em>` text content, if present.
- `href` — the link's raw `href` attribute (kept as authored, so callers
  can distinguish `#idea`/`#bug` from an external URL).
- `id` — the hash without `#` for internal links; otherwise the icon name,
  or a positional fallback (`link-<index>`) if neither is available.

### 2. `init(a)` (default export, vanilla)

Mirrors `blocks/dialog/dialog.js`, but wraps the button in the new
custom element instead of leaving it as a bare sibling:

- Create a `<button>`, copy `a.className` and `a.childNodes` (icon + label),
  set `button.dataset.pathname = a.pathname`, set `slot="trigger"`.
- Create `<nx-feedback-menu>`, set its `.path` property to `a.pathname`,
  append the button as its light-DOM child.
- Replace `a` with the `<nx-feedback-menu>` wrapper.

Resulting DOM: `<nx-feedback-menu><button slot="trigger" class="nx-feedback
 auto-block" data-pathname="/fragments/nav/feedback">...</button></nx-feedback-menu>`.
The button itself keeps the exact class/dataset shape confirmed for the
Help button convention; it's just nested one level inside the wrapper
rather than being a top-level sibling, so it can participate in
`<nx-menu>`'s `slot="trigger"` contract (see below).

### 3. `NxFeedbackMenu` (Lit, stateful)

Properties: `path` (string), `_items` (state), `_loadFailed` (state),
`_dialog` (state, `{ id, titleText }` or `undefined`).

Behavior:

- `connectedCallback`: fetches and parses items immediately (via
  `loadFragment(this.path)` + `parseFeedbackItems`) — no need to defer
  until first open, since `<nx-menu>` itself owns open/close state and
  wiring the trigger button's click handler automatically (via its
  `slot="trigger"` + `slotchange` mechanism). This avoids a flash of an
  empty menu on first click.
- Renders `<nx-menu .items=${this._items ?? []} @select=${...}><slot
  name="trigger"></slot></nx-menu>` — the light-DOM trigger button is
  forwarded through to `nx-menu`'s own trigger slot.
- On `@select` (`{ detail: { id } }`), looks up the item by `id`:
  - `href` starting with `#` → lazily imports `nx-dialog` and `sl-button`,
    sets `_dialog = { id, titleText: item.label }`.
  - Any other `href` → `window.open(href, '_blank', 'noopener,noreferrer')`
    (same pattern chat.js already uses for external menu-triggered links).
- Renders `<nx-dialog>` (shared component) when `_dialog` is set:
  - `title` = `_dialog.titleText`.
  - Body: a single `<textarea>` (autofocus), no label copy beyond what's
    obviously needed for step 1.
  - Actions: `sl-button` "Cancel" (closes dialog, discards) and `sl-button`
    "Submit" (closes dialog for now — `// TODO: POST to feedback endpoint
    in a follow-up`). No network call in this iteration.
  - `@close` on `<nx-dialog>` clears `_dialog`.

### Error handling

If `loadFragment` returns `null` (fetch failure), `_loadFailed` is set and
`<nx-menu>` simply renders with an empty `items` array (no crash, no
menu items) — consistent with the project's "consistent return shape, let
the caller decide" convention, adapted for a UI leaf node.

### Shared component change: `nx-menu` description support

`nx2/blocks/shared/menu/menu.js`'s `_renderItem` gains an optional second
line under the label when `item.description` is set; `nx2/blocks/shared/menu/menu.css`
gains matching styles. Existing consumers (`chat.js`'s `ADD_MENU_ITEMS`)
are unaffected since none of their items set `description`.

## CSS

- `nx2/blocks/nav/nav.css`: add a `.feedback` rule alongside the existing
  `.dialog` / `.profile` rules under `.action-area button` (icon-only
  sizing, no visible text — `font-size: 0` like `.dialog`).
- `nx2/blocks/feedback/feedback.css`: styles for the popover menu items
  (icon + title + description stack), using `--s2-*` design tokens, same
  approach as `profile.css`. Supports light/dark via existing tokens
  (`light-dark()` already used elsewhere; no new color literals).

## Out of scope

- Feedback submission endpoint (step 2, follow-up work).
- Icon SVG assets (added separately by the requester).

## Amendment: Help button wiring landed upstream mid-implementation

While this feature was in progress, `main` merged a fix (#528) that wires
the Help button for real: `nx2/blocks/nav/nav.js`'s `decorateActions` now
adds a generic click handler (`openFragmentDialog`) to any action button
carrying `data-pathname`, which fetches the fragment and dumps its raw
content into a plain `<nx-dialog>`. This was previously a no-op gap
(documented above as "out of scope" before the fix existed).

Because our `nx-feedback` button also carries `data-pathname` (for parity
with the Help button's shape) but wires its own click handling internally
(via `<nx-feedback-menu>` → `nx-menu`'s `slot="trigger"` contract), the
generic handler would double-bind onto it. `decorateActions` now has an
explicit `else if (button.classList.contains('nx-feedback'))` branch
(no-op) before the generic `data-pathname` branch, so both buttons share
the same dispatch point in `nav.js` while only one wiring path applies to
each.

## Testing

- Unit test for `feedback.js`: `init(a)` produces the expected button
  shape (class, dataset, preserved children).
- Unit test for `NxFeedbackMenu`: given fixture fragment HTML, internal
  (`#`) links render as buttons that open the dialog with the right title;
  external links render as plain anchors with `target="_blank"`.
- Manual/visual check against the Figma reference for menu layout and
  icon-only trigger styling in both light and dark mode.
