# nx-popover

A lightweight floating container that positions itself relative to an anchor element or fixed coordinates. Closes on outside click or Escape.

## Usage

### Anchor-based (most common)

```js
import '/path/to/shared/popover/popover.js';

const popover = document.createElement('nx-popover');
document.body.append(popover);
popover.innerHTML = '<p>Popover content</p>';

button.addEventListener('click', () => {
  popover.show({ anchor: button });
});
```

### Fixed coordinates

```js
popover.show({ x: 100, y: 200 });
```

## API

### Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `show` | `({ anchor?, x?, y?, placement? })` | Opens the popover. Pass an `anchor` element or explicit `x`/`y` coordinates. |
| `close` | `()` | Closes the popover and fires a `close` event. |

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `open` | `Boolean` | Whether the popover is currently visible. Reflects to attribute. |

### Placement

The `placement` option controls which side of the anchor the popover appears on.

| Value | Behaviour |
|-------|-----------|
| `below` | Below the anchor (default) |
| `above` | Above the anchor |
| `auto` | Picks above or below based on available viewport space |

### Events

| Event | Description |
|-------|-------------|
| `close` | Fired when the popover closes (Escape key, outside click, or `close()` call). Bubbles and crosses shadow DOM. |

## Slots

| Slot | Description |
|------|-------------|
| _(default)_ | Main popover content |
| `actions` | Optional actions row rendered below the main content |
