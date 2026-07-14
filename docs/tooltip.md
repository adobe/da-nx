# nx-tooltip

A small tooltip that shows on hover or keyboard focus of a trigger element.

## Usage

```html
<nx-tooltip>
  <button slot="trigger" aria-label="Copy link">...</button>
  Copy link
</nx-tooltip>
```

```js
import "/path/to/tooltip/tooltip.js";
```

That's it — no wiring needed. Hovering the trigger shows the tooltip after a short delay (to avoid flicker when passing over it quickly); focusing it via keyboard shows the tooltip immediately. It hides on `mouseleave`, `blur`, Escape, or outside click.

## API

### Properties

| Property    | Type     | Description                                                                                    |
| ----------- | -------- | ------------------------------------------------------------------------------------------------ |
| `placement` | `String` | Preferred side to show on: `above` (default) or `below`. Flips to the other side automatically if there isn't enough room. |

### Methods

Normally not needed — the tooltip shows and hides itself based on the trigger's hover/focus state. Useful if you want to trigger it programmatically instead.

| Method | Signature | Description                        |
| ------ | --------- | ----------------------------------- |
| `show` | `()`      | Shows the tooltip immediately.      |
| `hide` | `()`      | Hides the tooltip.                  |
