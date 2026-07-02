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

**Revised after a live testing bug — see "Amendment: wiring correction"
below for why.** The final mechanism:

The nav fragment's Feedback `<li>` contains a link to a hash-fragment path,
`href="/fragments/nav/feedback#feedback"`. Like any `/fragments/...#hash`
link, the framework's built-in `decorateLink`/`loadBlock` auto-block
mechanism (`nx2/scripts/nx.js`) converts it into the generic
`nx-dialog auto-block` button shape (loading `nx2/blocks/dialog/dialog.js`,
which just builds the button shell) — **identical to the Help button**, no
special linkBlocks config needed or used.

`nx2/blocks/nav/nav.js`'s `decorateActions` (which already wires up Help's
button, per #528) is the single place that then differentiates: it checks
`button.dataset.pathname` against a well-known, hardcoded constant
(`FEEDBACK_PATH = '/fragments/nav/feedback'`) and, on a match, imports
`blocks/feedback/feedback.js` and calls `attachFeedbackMenu(button)`
instead of wiring the generic single-dialog handler. This works regardless
of any consuming project's own `linkBlocks` config (see amendment below
for why that matters), since nothing outside nx2 itself needs to opt in.

Resulting DOM after `nav.js` processes the action area:

```html
<nx-feedback-menu>
  <button slot="trigger" class="nx-dialog auto-block nx-feedback" data-pathname="/fragments/nav/feedback">
    <span class="icon icon-feedback"><svg>...</svg></span>Feedback
  </button>
</nx-feedback-menu>
```

The `nx-feedback` marker class is added by `attachFeedbackMenu` itself (in
JS, after the generic auto-block conversion already happened) purely for
CSS targeting — it plays no role in block/class routing.

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

### 2. `attachFeedbackMenu(button)` (named export, vanilla)

Called directly by `nav.js`'s `decorateActions` (not registered as an
auto-block — see wiring section above) on the already-converted
`nx-dialog auto-block` button:

- Adds the `nx-feedback` marker class (for CSS) and `slot="trigger"`.
- Creates `<nx-feedback-menu>`, sets `.path` from `button.dataset.pathname`.
- Replaces the button in the DOM with the wrapper, then re-appends the
  (same) button inside it, so it participates in `<nx-menu>`'s
  `slot="trigger"` contract (see below).

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

- `nx2/blocks/nav/nav.css`: add a `.nx-feedback` rule alongside the
  existing `.dialog` / `.profile` rules under `.action-area button`
  (icon-only sizing, no visible text — `font-size: 0` like `.dialog`).
  Selector matches the marker class `attachFeedbackMenu` adds in JS (see
  above), not a linkBlocks-derived class.
- `nx2/blocks/feedback/feedback.css`: styles for the popover menu items
  (icon + title + description stack), using `--s2-*` design tokens, same
  approach as `profile.css`. Supports light/dark via existing tokens
  (`light-dark()` already used elsewhere; no new color literals).

## Out of scope

- Feedback submission endpoint (step 2, follow-up work).
- Icon SVG assets (added separately by the requester).

## Amendment 1: Help button wiring landed upstream mid-implementation

While this feature was in progress, `main` merged a fix (#528) that wires
the Help button for real: `nx2/blocks/nav/nav.js`'s `decorateActions` now
adds a generic click handler (`openFragmentDialog`) to any action button
carrying `data-pathname`, which fetches the fragment and dumps its raw
content into a plain `<nx-dialog>`. This was previously a no-op gap
(documented above as "out of scope" before the fix existed).

The first fix attempted here kept the original `nx-feedback` linkBlocks
entry and just added a class check in `decorateActions` to skip the
generic wiring for `nx-feedback`-classed buttons. That fix turned out to
be insufficient — see Amendment 2.

## Amendment 2: wiring correction (linkBlocks config doesn't reach consuming projects)

Live testing surfaced two bugs: the feedback menu rendered *inside a modal
dialog* instead of as a popover below the trigger, and the two buttons'
click behavior appeared to collide (Help's content showing for Feedback's
button).

Root cause: the `{ 'nx-feedback': '/fragments/nav/feedback' }` entry lived
in `nx2/scripts/scripts.js`, which is **nx2's own default/dev config only**.
Consuming projects (e.g. da.live) maintain their own `scripts.js` with
their own `linkBlocks` array, which this repo doesn't control and can't
require an update to. Nexter must stay self-sufficient for evergreen,
HTTPS-imported consumption (see AGENTS.md). Without that entry, the
Feedback anchor fell back to the universal `{ fragment: '/fragments/' }`
default and became a plain `nx-dialog auto-block` button — indistinguishable
from Help's — which is exactly why it got caught by the generic
single-dialog wiring instead of opening its own menu.

Fix: removed the `linkBlocks` entry entirely (see "How the trigger gets
wired up" above for the corrected, config-independent mechanism).

## Amendment 3: trigger button was invisible (broken double-slot-forwarding)

After Amendment 2 landed, the rendered DOM confirmed both buttons were
correctly separated (`nx-dialog auto-block nx-feedback` for Feedback,
`nx-dialog auto-block has-label` for Help) — but the Feedback icon didn't
render at all.

Root cause: `NxFeedbackMenu` rendered `<nx-menu><slot
name="trigger"></slot></nx-menu>` inside its **own** shadow DOM, forwarding
its light-DOM trigger button into `nx-menu`'s named `trigger` slot. But the
forwarding `<slot name="trigger">` itself had no `slot="trigger"`
attribute, so it was never assigned into `nx-menu`'s slot at all — the
button existed in the DOM (light-DOM child of `nx-feedback-menu`) but had
no rendering path into `nx-menu`, so it never displayed.

Fix: dropped the wrapper/forwarding structure entirely in favor of the
already-proven pattern `chat.js` uses successfully
(`<nx-menu ...><button slot="trigger">...</button></nx-menu>`, single
level, no forwarding). `attachFeedbackMenu(button)` now:

- Wraps the button **directly** inside a `<nx-menu>` (light-DOM child,
  `slot="trigger"`) — identical structural depth to chat.js's usage.
- Inserts `<nx-feedback-menu>` as a **sibling** *controller* immediately
  after `<nx-menu>`, not as a wrapper. The controller holds a `.menu`
  property (reference to the sibling `<nx-menu>`), fetches/parses items in
  `connectedCallback`, forwards them onto `menu.items` via `updated()`, and
  listens for `nx-menu`'s `select` event directly
  (`this.menu.addEventListener('select', ...)`).
- The controller's own `render()` now renders **only** the stub dialog
  (`nx-dialog`) when open — it has no other visual output
  (`:host { display: contents }`), so it never gets in the way of layout.

Resulting DOM:

```html
<nx-menu placement="below-end">
  <button slot="trigger" class="nx-dialog auto-block nx-feedback" data-pathname="/fragments/nav/feedback">...</button>
</nx-menu>
<nx-feedback-menu></nx-feedback-menu>
```

Covered by a new end-to-end unit test that clicks the *real* button (not a
synthetic call into internal state) and asserts `nx-menu.open === true` and
that its shadow DOM actually renders the three item labels — the exact
path that silently did nothing under the old forwarding-slot bug.

## Testing

- Unit test for `feedback.js`: `init(a)` produces the expected button
  shape (class, dataset, preserved children).
- Unit test for `NxFeedbackMenu`: given fixture fragment HTML, internal
  (`#`) links render as buttons that open the dialog with the right title;
  external links render as plain anchors with `target="_blank"`.
- Manual/visual check against the Figma reference for menu layout and
  icon-only trigger styling in both light and dark mode.
