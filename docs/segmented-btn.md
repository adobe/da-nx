# nx-segmented-btn

A segmented control for switching between a small set of mutually exclusive options.

## Usage

```html
<nx-segmented-btn id="view-toggle"></nx-segmented-btn>
```

```js
import "/path/to/segmented-btn/segmented.js";

const toggle = document.querySelector("#view-toggle");
toggle.label = "View";
toggle.items = [
  { value: "sitemap", label: "Sitemap" },
  { value: "structure", label: "Structure" },
];
toggle.value = "sitemap";

toggle.addEventListener("change", (e) => {
  console.log(e.detail.value); // 'sitemap' | 'structure'
});
```

## Item shapes

Each entry in the `items` array is one of:

```js
// Text segment
{ value: "layout", label: "Layout" }

// Icon-only segment
{ value: "split", icon: "gridcompare", ariaLabel: "Split view", title: "Split view" }
```

`icon` is a Spectrum icon name (the middle part of `s2-icon-{name}-20-n.svg`). Provide `ariaLabel` whenever there is no visible label.

## API

### Properties

| Property | Type     | Description                                                              |
| -------- | -------- | ------------------------------------------------------------------------ |
| `items`  | `Array`  | List of segment descriptors (see shapes above).                          |
| `value`  | `String` | Value of the currently selected segment. Set to change the selection programmatically. |
| `label`  | `String` | Accessible label for the control group (`aria-label`). Always provide one. |

### Events

| Event    | Detail      | Description                                                                |
| -------- | ----------- | -------------------------------------------------------------------------- |
| `change` | `{ value }` | Fired when the user selects a different segment. `value` matches the item. |
