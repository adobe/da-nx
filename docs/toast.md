# showToast

Displays a brief notification at the bottom of the screen. Auto-dismisses after a timeout. A close button lets the user dismiss it early.

## Usage

```js
import { showToast, VARIANT_SUCCESS, VARIANT_ERROR, VARIANT_WARNING } from "/path/to/shared/toast/toast.js";

showToast({ text: "File saved." });
showToast({ text: "Delete failed.", variant: VARIANT_ERROR });
showToast({ text: "Storage almost full.", variant: VARIANT_WARNING });
showToast({ text: "Indexing complete.", timeout: 10000 });
showToast({ text: "Upload failed.", cta: { text: "Retry", href: "#retry" } });
showToast({ text: "Syncing…", timeout: null }); // no auto-dismiss
```

`showToast` is a fire-and-forget call — no cleanup needed. The host element and document styles are created automatically on first use.

The notification stack uses a manual popover in the browser's top layer. Each call brings the stack in front of open toolbar popovers without closing them or moving keyboard focus.
Browsers without the Popover API still receive notifications without top-layer promotion.

## API

### `showToast(options)`

| Option     | Type           | Default           | Description                                                                     |
| ---------- | -------------- | ------------------ | ------------------------------------------------------------------------------ |
| `text`     | `String`       | —                  | Message to display. Whitespace-only strings are ignored.                       |
| `variant`  | `String`       | `VARIANT_SUCCESS`  | Visual style. Use the exported constants.                                      |
| `cta`      | `Object`       | —                  | Optional action link, e.g. `{ text: 'Retry', href: '#retry' }`.                 |
| `timeout`  | `Number\|null` | `6000`             | Milliseconds before auto-dismiss. Values below 6000 are clamped to 6000. `null` disables auto-dismiss (user must close it manually). |
| `maxWidth` | `String`       | `22rem`            | CSS width value overriding the toast's max width (sets `--nx-toast-max-width`). |

### Exported constants

| Constant          | Value       | Description          |
| ----------------- | ----------- | -------------------- |
| `VARIANT_SUCCESS` | `'success'` | Green success toast  |
| `VARIANT_ERROR`   | `'error'`   | Red error toast      |
| `VARIANT_WARNING` | `'warning'` | Orange warning toast |
