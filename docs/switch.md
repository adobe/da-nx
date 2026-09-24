# nx-switch

A binary on/off control, for settings that take effect immediately.

## Usage

```html
<nx-switch id="auto-save" label="Auto-save"></nx-switch>
```

```js
import "/path/to/switch/switch.js";

const autoSave = document.querySelector("#auto-save");
autoSave.checked = true;

autoSave.addEventListener("change", (e) => {
  console.log(e.detail.checked); // true | false
});
```

## API

### Properties

| Property   | Type      | Description                                                          |
| ---------- | --------- | ---------------------------------------------------------------------|
| `checked`  | `Boolean` | Whether the switch is on. Reflected as an attribute.                  |
| `disabled` | `Boolean` | Disables the switch. Reflected as an attribute.                      |
| `label`    | `String`  | Visible label rendered next to the switch. Always provide one.       |
| `size`     | `String`  | `"m"` (default) or `"sm"`. Reflected as an attribute, e.g. `<nx-switch size="sm">`. |

### Events

| Event    | Detail        | Description                                    |
| -------- | ------------- | ----------------------------------------------- |
| `change` | `{ checked }` | Fired when the user toggles the switch.        |
