# nx-menu

A dropdown menu with keyboard navigation. Supports section headers, dividers, and optional icons per item.

## Usage

### With a trigger slot (recommended)

Place a `<button>` with `slot="trigger"` inside. The menu handles open/close and positioning automatically.

```html
<nx-menu id="my-menu" placement="above">
  <button slot="trigger" aria-label="Options">...</button>
</nx-menu>
```

```js
import "/path/to/menu/menu.js";

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

```js
menu.show({ anchor: someButton, placement: "below" });
menu.close();
```

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

`icon` values map to S2 icon names (e.g. `'Edit'`, `'Delete'`, `'Copy'`).

## API

### Properties

| Property    | Type                  | Description                                                                       |
| ----------- | --------------------- | --------------------------------------------------------------------------------- |
| `items`     | `Array`               | List of item descriptors (see shapes above).                                      |
| `placement` | `String`              | Default placement when opened via trigger: `below` (default), `above`, or `auto`. |
| `open`      | `Boolean` (read-only) | Whether the menu is currently open.                                               |

### Methods

| Method  | Signature                   | Description                                                                    |
| ------- | --------------------------- | ------------------------------------------------------------------------------ |
| `show`  | `({ anchor?, placement? })` | Opens the menu anchored to `anchor`. `placement` overrides the property value. |
| `close` | `()`                        | Closes the menu.                                                               |

### Events

| Event    | Detail   | Description                                                                                  |
| -------- | -------- | -------------------------------------------------------------------------------------------- |
| `select` | `{ id }` | Fired when the user clicks or keyboard-confirms an item. `id` matches the item's `id` field. |

## Keyboard behaviour

When the menu is open, arrow keys move focus between items and Enter selects the active item.
