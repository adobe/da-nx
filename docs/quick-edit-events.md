# Quick-Edit Events

The quick-edit iframe boundary lets a lightweight DOM overlay (rendered on top of the
live-previewed page) exchange edits with a "host" that owns the real ProseMirror/Yjs
document. Communication happens over a `MessageChannel` port established by an `INIT`/
`READY` handshake, then a stream of typed messages in both directions.

The canonical list of `type` values lives in `nx/utils/message-types.js`, with the
payload shape for each documented inline as a comment next to the constant. **This
document does not repeat those payload shapes** — it exists to give the cross-repo
context a bare list of names and shapes can't: why a message exists, which host
implementations actually wire it up, and what to know before extending one.

## Two host flavors

The same iframe overlay script (`nx/public/plugins/quick-edit/quick-edit.js`) is driven
by one of two different hosts, depending on how it's loaded:

- **Standalone** (no `?controller=parent`): `quick-edit.js` creates its own nested
  iframe pointing at `nx/blocks/quick-edit-portal/quick-edit-portal.js`, which owns the
  ProseMirror/Yjs doc and plays the host role.
- **da-live-embedded** (`?controller=parent`): `quick-edit.js` skips the nested iframe
  and treats `window.parent` (da-live's `ew-editor-wysiwyg.js`) as the host. da-live's
  `ew-editor-doc.js` / `blocks/canvas/ew-editor-wysiwyg/quick-edit-controller.js` play
  the role `quick-edit-portal.js` plays in the standalone flow.

Several message types are only meaningful in one of these two flows — noted below.
Both hosts normalize incoming messages the same way, merging deprecated flat top-level
fields with the newer `payload` object:

```js
const data = e.data?.payload ? { ...e.data, ...e.data.payload } : e.data;
```

## Before adding a new message type

Check `nx/utils/message-types.js` first — if the data you need is already carried by an
existing type, extend its payload (with a matching comment update) rather than adding a
parallel one. If you do add a new key:

1. Add the payload shape as an inline comment next to the constant in `message-types.js`.
2. Add an entry to the registry below with a short "why" — what capability it enables
   and which host(s) consume it. The name alone often isn't self-explanatory across two
   repos; that's the gap this doc fills.
3. If you're extending an **existing** message with new fields or a new consumer (not a
   brand-new type), add a note here too if the change isn't obvious from the payload
   comment alone (e.g. a field only one of the two hosts understands).

## Registry

| Name | Direction | Wired up in |
|---|---|---|
| `INIT` | Host → iframe | both hosts |
| `READY` | iframe → host | both hosts |
| `SET_BODY` | Host → iframe | both hosts |
| `SET_EDITOR_STATE` | Host → iframe | both hosts |
| `SET_CURSORS` | Host → iframe | both hosts |
| `SET_SELECTED_NODE` | Host → iframe | da-live only |
| `CURSOR_MOVE` | iframe → host | both hosts |
| `RELOAD` | iframe → host | both hosts |
| `GET_EDITOR` | iframe → host | both hosts |
| `NODE_UPDATE` | iframe → host | both hosts |
| `NODE_SELECT` | iframe → host | da-live only |
| `HISTORY` | iframe → host | both hosts |
| `NEW_VERSION` | iframe → host | da-live only |
| `SELECTION_CHANGE` | iframe → host | da-live only |
| `STORED_MARKS` | iframe → host | da-live only |
| `PREVIEW` | iframe ↔ host (request/reply) | standalone (quick-edit-portal) only |
| `IMAGE_REPLACE` | iframe → host | both hosts |
| `UPDATE_IMAGE_SRC` | Host → iframe, @deprecated reply | both hosts |
| `IMAGE_ERROR` | Host → iframe, @deprecated reply | both hosts |

---

### `SET_SELECTED_NODE` / `NODE_SELECT`

Drive the selection-overlay feature: when a user clicks a block or image in the
quick-edit iframe, `NODE_SELECT` tells the host which node was picked so it can mirror
the selection in the real document (e.g. sync the outline panel); `SET_SELECTED_NODE`
is the reverse — the host tells the iframe to draw the selection outline/pill (e.g.
because the user selected the block elsewhere, like the outline panel or the doc
editor). Both only exist in the da-live-embedded flow — the standalone
`quick-edit-portal.js` host has no equivalent selection UI, so neither is wired up
there.

### `NEW_VERSION`

Fired when the user presses the version-history shortcut (Cmd/Ctrl+Alt+S) while
typing inside a quick-edit field. Forwarded to da-live, which dispatches a DOM
`nx-canvas-new-version` event for the version-history feature to catch. Not wired up
in the standalone host — matches the known gap that this shortcut doesn't otherwise
work in layout/WYSIWYG mode.

### `SELECTION_CHANGE`

Keeps da-live's selection-driven toolbar in sync with text selections made inside the
quick-edit iframe (as opposed to `NODE_SELECT`, which is for whole-node/block
selection). Only consumed by da-live; the standalone host has no toolbar to sync.

### `STORED_MARKS`

Keeps the host's toolbar in sync when the user toggles a mark (e.g. Cmd+B) at a
collapsed cursor with no adjacent marked text to infer from. `CURSOR_MOVE`'s own
`marksBefore`/`marksAfter` heuristic (see `handleCursorMove` in da-live's
`utils/handlers.js`) only runs when the selection's anchor/head actually changes —
toggling a mark on a collapsed cursor doesn't move the selection, so that heuristic
never fires and `STORED_MARKS` is the only signal the toggle happened. Only consumed
by da-live; the standalone host has no toolbar to sync.

### `PREVIEW`

Request/reply pair scoped entirely to the standalone flow: the "Preview" action inside
the quick-edit iframe is only created when there's no `parentControllerPort` (i.e. not
embedded in da-live), so this message never appears on the da-live/WYSIWYG canvas path.
This is intentional scoping, not a gap — da-live has its own preview mechanism outside
this protocol.

### `IMAGE_REPLACE` / `UPDATE_IMAGE_SRC` / `IMAGE_ERROR`

Image drag-drop upload flow. `IMAGE_REPLACE` is the iframe's upload request;
`UPDATE_IMAGE_SRC`/`IMAGE_ERROR` are the two possible replies. These two reply types are
`@deprecated` — once retired, the reply becomes a single `IMAGE_REPLACE` message back
from the host, distinguished by a top-level `error` field, making the type
bidirectional. Both hosts implement the full round-trip.

## Known gaps

- **Several payload fields are sent but not read by any current receiver:**
  `SELECTION_CHANGE.anchorX`/`anchorY`, `IMAGE_REPLACE.cursorOffset`/`mimeType`,
  `IMAGE_ERROR.originalSrc`. Not necessarily bugs — may be intended for a future
  consumer — but worth checking before assuming they're load-bearing.
