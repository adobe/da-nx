# nx-tooltip

Brief help for a button or other focusable control. Appears on hover or keyboard
focus; press Escape to dismiss.

## Usage

```js
import '/nx2/blocks/shared/tooltip/tooltip.js';
```

```html
<button id="save" type="button">Save</button>
<nx-tooltip for="save">Save your changes</nx-tooltip>
```

Place the tooltip after its trigger, in the same document or shadow root.
Tooltips stay hidden in browsers without native popover and CSS anchor positioning
support.

## Options

| Attribute | Default | Description |
| --- | --- | --- |
| `for` | Required | Trigger element's ID. |
| `anchor` | Trigger | Optional element's ID to position against, such as an icon inside a wider control. Must be in the same document or shadow root. |
| `placement` | `top` | Preferred side: `top`, `bottom`, `left`, or `right`. Flips when necessary. |

## Content

Keep text short, with no links or buttons. Don't hide essential instructions in
tooltips. Icon-only buttons still need an `aria-label`; avoid a competing `title`.
Use a separate help control for disabled buttons.
