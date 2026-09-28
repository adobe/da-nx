# nx-dialog

A modal dialog. Blocks interaction with the rest of the page until dismissed. Closes on backdrop click or Escape unless marked `persistent` or `busy`.

## Usage

Render `<nx-dialog>` conditionally — it opens itself when connected to the DOM. Remove it (or re-render with `nothing`) when the `close` event fires.

```js
import "/path/to/shared/dialog/dialog.js";
```

```js
// In a Lit component
render() {
  return html`
    ${this._showDialog ? html`
      <nx-dialog title="Delete item" @close=${this._onClose}>
        <p>This action cannot be undone.</p>
        <button slot="actions" class="btn btn-secondary"
          @click=${(e) => e.target.closest('nx-dialog').close()}>Cancel</button>
        <button slot="actions" class="btn btn-danger" @click=${this._onConfirm}>Delete</button>
      </nx-dialog>
    ` : nothing}
  `;
}

// Handles all dismiss paths: Escape, backdrop click, and Cancel button.
_onClose() {
  this._showDialog = false;
}
```

### Without a title

Omit the `title` attribute for dialogs that need no heading (e.g. a full-form dialog with its own heading in the body).

```html
<nx-dialog>
  <p>Are you sure?</p>
</nx-dialog>
```

### Autofocus

Add `autofocus` to the element that should receive focus when the dialog opens.

```html
<nx-dialog title="Rename">
  <input autofocus type="text" value="my-file" />
</nx-dialog>
```

### Busy state

Set `busy` to `true` while an async operation is in progress. The dialog body becomes inert and backdrop/Escape dismissal is blocked until `busy` is cleared.

```js
dialog.busy = true;
const result = await doWork();
dialog.busy = false;
```

## API

### Properties / attributes

| Property / attribute | Type      | Default | Description                                                             |
| -------------------- | --------- | ------- | ----------------------------------------------------------------------- |
| `title`              | `String`  | —       | Heading text rendered above the body. Omit for a headingless dialog.    |
| `persistent`         | `Boolean` | `false` | Prevents closing on backdrop click or Escape.                           |
| `busy`               | `Boolean` | `false` | Inerts the dialog body. Implicitly enables `persistent` behavior.       |
| `size`               | `String`  | —       | Set to `large` for a wide dialog. See [Large dialog](#large-dialog).     |

### Methods

| Method  | Description                                          |
| ------- | ---------------------------------------------------- |
| `close` | Closes the dialog and fires a `close` event.         |

### Events

| Event   | Description                                            |
| ------- | ------------------------------------------------------ |
| `close` | Fired when the user dismisses the dialog (backdrop click, Escape, or explicit `close()` call). |

## Slots

| Slot        | Description                                                     |
| ----------- | --------------------------------------------------------------- |
| _(default)_ | Dialog body content                                             |
| `actions`   | Action buttons rendered in the footer, right-aligned            |

## CSS custom properties

The panel sizing and padding can be overridden from the consuming page. Each property has a sensible default — set it on the `nx-dialog` element (or any ancestor) only when you need to deviate. All values are still clamped to the viewport so a too-large value won't overflow.

| Property                          | Default                          | Description                                          |
| --------------------------------- | -------------------------------- | ---------------------------------------------------- |
| `--nx-dialog-min-width`           | `400px`                          | Panel minimum width.                                 |
| `--nx-dialog-max-width`           | `480px` (`848px` for `large`)    | Panel maximum width.                                 |
| `--nx-dialog-max-height`          | `90vh` (`90dvh` modern)          | Panel maximum height.                                |
| `--nx-dialog-padding`             | `var(--s2-spacing-500)`          | Inner padding around heading, body, and actions.     |
| `--nx-dialog-gap`                 | `var(--s2-spacing-300)`          | Space between heading, body, and actions.            |
| `--nx-dialog-border`              | `1px solid var(--s2-gray-200)`   | Panel border.                                        |
| `--nx-dialog-actions-padding-top` | `var(--s2-spacing-200)`          | Space above the actions row.                         |

### Large dialog

Set `size="large"` for content-heavy dialogs, such as split layouts or media. The panel fills the available width up to `--nx-dialog-max-width` (`848px` by default) and shrinks with the viewport. Its height follows the content, up to `--nx-dialog-max-height`.

The body becomes a flex column. Give slotted content `flex: 1 1 auto; min-height: 0;` so it fits the panel height and can scroll its own regions. The panel is also the positioning context for absolutely positioned slotted controls, such as a close button.

```html
<nx-dialog size="large" class="block-library">
  <div class="library-layout">…</div>
</nx-dialog>
```

```css
nx-dialog.block-library {
  --nx-dialog-max-height: 640px;
}

.library-layout {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
}
```

### Wide dialog

To widen a default dialog without the large layout, raise the max width only.

```css
nx-dialog.wide {
  --nx-dialog-max-width: 600px;
}
```

### Full-bleed body

Combine a zero `--nx-dialog-padding` with your own padding on the slotted content to push body content to the panel edge (useful for split layouts).

```css
nx-dialog.split-pane {
  --nx-dialog-padding: 0;
}
```
