# nx-link-dialog

A modal "Edit link" dialog with URL and display-text fields (and an optional title field). Built on [`nx-dialog`](./dialog.md) and mirrors the canvas link dialog in da-live, so editors get the same link experience everywhere.

## Usage

Render it with `open` and set `open` back to `false` when `close` fires. The dialog validates the URL and fires `nx-link-submit`; it does not close itself on submit.

```js
import "/path/to/shared/link-dialog/link-dialog.js";
```

```js
// In a Lit component
render() {
  return html`
    <nx-link-dialog
      ?open=${this._linkOpen}
      .href=${this._href}
      .text=${this._text}
      @nx-link-submit=${this._onLinkSubmit}
      @close=${() => { this._linkOpen = false; }}>
    </nx-link-dialog>
  `;
}

_onLinkSubmit(e) {
  const { href, text } = e.detail;
  this.shadowRoot.querySelector('nx-link-dialog').close();
  // apply the link
}
```

### Custom validation

By default an empty URL and `javascript:`, `data:` and `vbscript:` URLs are rejected. Pass `validate` to apply stricter rules; return an error message, or an empty string when the URL is valid. Empty URLs are always rejected.

```js
dialog.validate = (href) => (/^(https?:|\/)/.test(href) ? '' : 'Use a relative or http(s) URL');
```

## API

### Properties / attributes

| Property / attribute          | Type       | Default       | Description                                                 |
| ----------------------------- | ---------- | ------------- | ----------------------------------------------------------- |
| `open`                        | `Boolean`  | `false`       | Renders and opens the dialog. Reflected.                    |
| `href`                        | `String`   | `''`          | Initial URL.                                                |
| `text`                        | `String`   | `''`          | Initial display text.                                       |
| `title` / `dialog-title`      | `String`   | `'Edit link'` | Dialog heading.                                             |
| `showTitle` / `show-title`    | `Boolean`  | `false`       | Shows the link title field.                                 |
| `anchorTitle`                 | `String`   | `''`          | Initial link title (with `showTitle`).                      |
| `saveLabel`                   | `String`   | `'Save'`      | Primary button label.                                       |
| `validate`                    | `Function` | —             | `(href) => errorMessage`. Replaces the default URL checks.  |

### Methods

| Method  | Description                                  |
| ------- | -------------------------------------------- |
| `close` | Closes the dialog and fires a `close` event. |

### Events

| Event            | Detail                       | Description                                              |
| ---------------- | ---------------------------- | -------------------------------------------------------- |
| `nx-link-submit` | `{ href, text, title? }`     | Fired on Save or Enter with a valid URL. `href` is trimmed; `title` only with `showTitle`. |
| `close`          | —                            | Fired when the dialog is dismissed (Cancel, Escape, backdrop or `close()`). |
