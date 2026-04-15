# nx-menu

A dropdown menu with keyboard navigation. Supports section headers, dividers, and optional icons per item. Implementation: `nx2/blocks/shared/menu/menu.js` (styles: `menu.css` next to it).

## Usage

### With a trigger slot (recommended)

Place a `<button>` with `slot="trigger"` inside. The menu handles open/close and positioning automatically.

```html
<nx-menu id="my-menu" placement="above">
  <button slot="trigger" aria-label="Options">...</button>
</nx-menu>
```

```js
import "/path/to/nx2/blocks/shared/menu/menu.js";

const menu = document.querySelector("#my-menu");
menu.items = [
  { id: "edit", label: "Edit", icon: "Edit" },
  { id: "delete", label: "Delete", icon: "Delete" },
];

menu.addEventListener("select", (e) => {
  console.log(e.detail.id); // 'edit' | 'delete'
});
```

### Without a trigger (caller-controlled)

Omit the trigger slot and call `show()` / `close()` manually.

**Anchor** — open next to an element (e.g. toolbar control):

```js
menu.show({ anchor: someButton, placement: "below" });
menu.close();
```

**Coordinates** — open at viewport `x` / `y` when there is no suitable anchor element (e.g. ProseMirror caret). Values are CSS pixels in the viewport coordinate system (same as `Element.getBoundingClientRect()` or `MouseEvent.clientX` / `clientY`). Both `x` and `y` must be finite numbers; otherwise the menu uses anchor-only behavior.

```js
const { left, bottom } = view.coordsAtPos(pos);
menu.show({ x: left, y: bottom + 4, placement: "below" });
```

Do not rely on passing both `anchor` and `x`/`y`: when both `x` and `y` are finite, the implementation opens with coordinates and ignores `anchor`.

## Item shapes

Each entry in the `items` array is one of:

```js
// Regular item
{ id: 'copy', label: 'Copy', icon: 'Copy' }   // icon is optional

// Section header (non-interactive label)
{ section: 'Actions' }

// Visual divider
{ divider: true }
```

`icon` values map to S2 icon asset names (e.g. `'Edit'`, `'Delete'`, `'Copy'`) resolved under `nx2/blocks/img/icons/` as `S2_Icon_{name}_20_N.svg`.

## API

### Properties

| Property    | Type                  | Description                                                                       |
| ----------- | --------------------- | --------------------------------------------------------------------------------- |
| `items`     | `Array`               | List of item descriptors (see shapes above).                                      |
| `placement` | `String`              | Default placement when opened via trigger: `below` (default), `above`, or `auto`. |
| `open`      | `Boolean` (read-only) | Whether the menu is currently open.                                               |

### Methods

| Method  | Signature | Description |
| ------- | --------- | ----------- |
| `show`  | `({ anchor?, x?, y?, placement? })` | Opens the menu. Use **either** `anchor` (an `Element`) **or** both `x` and `y` (finite viewport numbers). Optional `placement` overrides the element attribute. |
| `close` | `()` | Closes the menu. |

### Events

| Event    | Detail   | Description                                                                                  |
| -------- | -------- | -------------------------------------------------------------------------------------------- |
| `select` | `{ id }` | Fired when the user clicks or keyboard-confirms an item. `id` matches the item's `id` field. |

## Keyboard behaviour

When the menu is open and focus is **inside** the popover, arrow keys move focus between items and Enter selects the active item.

If focus stays elsewhere (e.g. a ProseMirror surface), callers must forward keyboard handling themselves or use a different surface; `nx-menu` does not expose a remote key handler by default.
