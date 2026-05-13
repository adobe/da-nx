# showToast

Displays a brief notification at the bottom of the screen. Auto-dismisses after a timeout. A close button lets the user dismiss it early.

## Usage

```js
import { showToast, VARIANT_SUCCESS, VARIANT_ERROR } from "/path/to/shared/toast/toast.js";

showToast({ text: "File saved." });
showToast({ text: "Delete failed.", variant: VARIANT_ERROR });
showToast({ text: "Indexing complete.", timeout: 10000 });
```

`showToast` is a fire-and-forget call — no cleanup needed. The host element and document styles are created automatically on first use.

## API

### `showToast(options)`

| Option    | Type     | Default            | Description                                                               |
| --------- | -------- | ------------------ | ------------------------------------------------------------------------- |
| `text`    | `String` | —                  | Message to display. Whitespace-only strings are ignored.                  |
| `variant` | `String` | `VARIANT_SUCCESS`  | Visual style. Use the exported constants.                                 |
| `timeout` | `Number` | `6000`             | Milliseconds before auto-dismiss. Values below 6000 are clamped to 6000. |

### Exported constants

| Constant          | Value       | Description          |
| ----------------- | ----------- | -------------------- |
| `VARIANT_SUCCESS` | `'success'` | Green success toast  |
| `VARIANT_ERROR`   | `'error'`   | Red error toast      |
