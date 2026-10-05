# nx-pills

A row of removable, optionally pinnable "chips" for showing attached context (a selected block, a file, a folder, ...). Renders nothing when there's nothing to show.

## Usage

There are two ways to use it — pick one per instance, don't mix them.

### Controlled

You own the list; nx-pills just renders it and tells you what changed.

```html
<nx-pills id="my-pills"></nx-pills>
```

```js
import "/path/to/pills/pills.js";

const pills = document.querySelector("#my-pills");
pills.items = [
  { id: "1", label: "hero.png", type: "image", thumbnail: blobUrl },
  { id: "2", label: "My Block", type: "block", pinnable: true },
];

pills.addEventListener("nx-pill-remove", (e) => {
  // e.detail.id — remove it from your own list, then re-set pills.items
});
pills.addEventListener("nx-pill-pin", (e) => {
  // e.detail.id — mark it pinned in your own list, then re-set pills.items
});
```

### Self-managed

Give it a document-level event name and it manages the list itself — you only read it back when you need it (e.g. on submit).

```html
<nx-pills id="my-pills" addEvent="my-add-to-list-event"></nx-pills>
```

```js
import "/path/to/pills/pills.js";

const pills = document.querySelector("#my-pills");

// Anywhere else in the app:
document.dispatchEvent(new CustomEvent("my-add-to-list-event", {
  detail: { id: "1", label: "hero.png", type: "image" },
}));

// When you're ready to use what's attached:
const attached = pills.items; // [{ id: '1', label: 'hero.png', type: 'image' }]
pills.add({ id: "2", label: "notes.pdf", type: "file" }); // push one directly
pills.clear(); // e.g. after sending
```

The `key` field in an event's `detail` is optional and lets a later dispatch replace an earlier one — useful when the same source (e.g. "current selection") keeps changing and each new value should replace the last, not pile up:

```js
document.dispatchEvent(new CustomEvent("my-add-to-list-event", {
  detail: { key: "current-selection", id: "1", label: "Paragraph 1" },
}));
// Selecting something else re-dispatches with the same key — the old pill for
// "current-selection" is replaced, not duplicated. Omitting `id` on a re-dispatch
// removes that key's pill entirely (e.g. selection was cleared).
```

## Item shape

```js
{
  id: 'unique-id',       // required
  label: 'Display name', // required
  type: 'block',         // 'block' | 'text' | 'image' | 'folder' | 'file' — picks the icon
  thumbnail: 'blob:...', // optional — shown instead of the type icon
  pinnable: true,        // optional — shows a pin button instead of remove; label becomes clickable
  pinned: true,          // optional — sourced/managed by you (controlled) or by nx-pills (self-managed)
}
```

Pinnable items also carry `selFrom`/`selTo` (required for the pill to be clickable) and optionally `selectionType`/`blockName`/`proseIndex` — these come back in `nx-pill-activate`'s detail.

## API

### Properties

| Property   | Type     | Description                                                                                     |
| ---------- | -------- | ------------------------------------------------------------------------------------------------- |
| `items`    | `Array`  | The list to render. Set by you in controlled mode; owned by nx-pills in self-managed mode.       |
| `addEvent` | `String` | Document event name to self-manage from. Leave unset for controlled mode.                        |

### Methods

Self-managed mode only:

| Method  | Signature | Description                                                          |
| ------- | --------- | ---------------------------------------------------------------------- |
| `add`   | `(item)`  | Pushes an item directly, outside the `addEvent` flow. No-op if the id already exists. |
| `clear` | `()`      | Empties the list (and revokes any `thumbnail` blob URLs it was holding). |

### Events

| Event             | Detail                                                                  | Fired in                | Description                                                        |
| ----------------- | ------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------- |
| `nx-pill-remove`  | `{ id }`                                                                  | Controlled only          | User clicked remove — update your list and re-set `items`.        |
| `nx-pill-pin`     | `{ id }`                                                                  | Controlled only          | User clicked pin — update your list and re-set `items`.           |
| `nx-pill-activate`| `{ id, selFrom, selTo, selectionType, blockName, proseIndex }`            | Both modes               | User clicked a pinned item's label — decide what "activating" it means (e.g. highlight it elsewhere). |

## Cleanup

If an item has a `thumbnail` that's a blob URL (`URL.createObjectURL(...)`), nx-pills revokes it for you when that item is removed, cleared, or the component disconnects — in self-managed mode. In controlled mode, that's still on you, same as owning the list itself.
