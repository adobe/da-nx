# nx-popover

A floating container that positions itself relative to an anchor element or fixed coordinates. Closes on outside click or Escape. Only one popover can be open at a time.

## Usage

### Anchor-based (most common)

```js
import "/path/to/shared/popover/popover.js";

const popover = document.createElement("nx-popover");
someContainer.append(popover);
popover.innerHTML = "<p>Popover content</p>";

button.addEventListener("click", () => {
  popover.show({ anchor: button });
});
```

> **Trigger element:** Use a `<button>` or `<input>` as the trigger. These are the only elements that support `popoverTargetElement`, which tells the browser not to dismiss the popover when the trigger itself is clicked. Using other element types will break toggle behaviour in modern browsers.

### Fixed coordinates

```js
popover.show({ x: 100, y: 200 });
```

## API

### Methods

| Method  | Signature                           | Description                                                                  |
| ------- | ----------------------------------- | ---------------------------------------------------------------------------- |
| `show`  | `({ anchor?, x?, y?, placement? })` | Opens the popover. Pass an `anchor` element or explicit `x`/`y` coordinates. |
| `close` | `()`                                | Closes the popover and fires a `close` event.                                |

### Properties

| Property | Type            | Description                                                      |
| -------- | --------------- | ---------------------------------------------------------------- |
| `open`   | `Boolean`       | Whether the popover is currently visible. Reflects to attribute. |
| `anchor` | `Element\|null` | The current anchor element. Read-only.                           |

### Placement

The `placement` option controls which side of the anchor the popover appears on.

| Value   | Behaviour                                              |
| ------- | ------------------------------------------------------ |
| `below` | Below the anchor (default)                             |
| `above` | Above the anchor                                       |
| `auto`  | Picks above or below based on available viewport space |

### Events

| Event   | Description                                   |
| ------- | --------------------------------------------- |
| `close` | Fired when the popover closes for any reason. |

## Slots

| Slot        | Description                                          |
| ----------- | ---------------------------------------------------- |
| _(default)_ | Main popover content                                 |
| `actions`   | Optional actions row rendered below the main content |
