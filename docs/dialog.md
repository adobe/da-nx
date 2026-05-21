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
