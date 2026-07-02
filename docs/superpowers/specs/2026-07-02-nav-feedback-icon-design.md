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

One file, two parts (small enough to stay together per project conventions).

### 1. `init(a)` (default export, vanilla)

Mirrors `blocks/dialog/dialog.js`:

- Create a `<button>`, copy `a.className` and `a.childNodes` (icon + label),
  set `button.dataset.pathname = a.pathname`.
- Replace `a` with the button.
- Lazily import the Lit companion (`NxFeedbackMenu`, defined in the same
  file) and insert `<nx-feedback-menu>` immediately after the button,
  setting `.trigger` (the button element) and `.path`
  (`button.dataset.pathname`) as properties.

### 2. `NxFeedbackMenu` (Lit, stateful)

Properties: `trigger` (button el, not reactive), `path` (string, not
reactive), `_items` (state, menu items parsed from the fragment),
`_dialog` (state, `{ id, titleText }` or `undefined`).

Behavior:

- `connectedCallback`: adds a click listener on `trigger` that toggles the
  popover (`nx-popover`, imported lazily — same shared component used by
  `ew-actions`). `trigger.setAttribute('aria-haspopup', 'menu')` /
  `aria-expanded` toggled to match state, consistent with `ew-actions`.
- On first open only, calls `loadFragment(this.path)` (from
  `nx2/blocks/fragment/fragment.js`) to fetch and decorate
  `/fragments/nav/feedback` (icons and `{placeholders}` are decorated for
  free by the existing `loadArea` pipeline inside `loadFragment`).
- Parses the fragment's `<p>` rows into menu items:
  - `<a>` → `href`, inner HTML (icon span + label).
  - Following `<em>` (if present) → description text.
- Renders each item generically based on `href`, no hardcoded item count/order:
  - `href` starting with `#` → a `<button role="menuitem">` inside the
    popover; on click, closes the popover and sets `_dialog = { id, titleText }`
    where `id` is the href fragment (`idea`/`bug`) and `titleText` is the
    link's visible text (e.g. "Submit an idea").
  - Any other `href` → a plain `<a role="menuitem" target="_blank"
    rel="noopener">`, left as a normal link (no click interception).
- Renders `<nx-dialog>` (shared component, lazily imported) when `_dialog`
  is set:
  - `title` = `_dialog.titleText`.
  - Body: a single `<textarea>` (autofocus), no label copy beyond what's
    obviously needed for step 1.
  - Actions: `sl-button` "Cancel" (closes dialog, discards) and `sl-button`
    "Submit" (closes dialog for now — `// TODO: POST to feedback endpoint
    in a follow-up`). No network call in this iteration.
  - `@close` on `<nx-dialog>` clears `_dialog`.

### Error handling

If `loadFragment` returns `null` (fetch failure), the popover shows a
single disabled-looking `<p>` with a generic message ("Feedback options
unavailable.") instead of throwing — consistent with the project's
"consistent return shape, let the caller decide" convention, adapted for a
UI leaf node.

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
- Fixing the Help button's missing dialog wiring (pre-existing gap, not
  part of this feature).

## Testing

- Unit test for `feedback.js`: `init(a)` produces the expected button
  shape (class, dataset, preserved children).
- Unit test for `NxFeedbackMenu`: given fixture fragment HTML, internal
  (`#`) links render as buttons that open the dialog with the right title;
  external links render as plain anchors with `target="_blank"`.
- Manual/visual check against the Figma reference for menu layout and
  icon-only trigger styling in both light and dark mode.
