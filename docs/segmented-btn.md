# nx-segmented-btn

A segmented control for switching between a small set of mutually exclusive options.

Each segment is keyboard-focusable and exposes its selected state with `aria-pressed`.
Keyboard focus has a visible outline in light and dark mode.

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
// Icon + label segment
{ value: "grid", icon: "/img/icons/s2-icon-gridcompare-20-n.svg", label: "Grid" }

// Text segment
{ value: "layout", label: "Layout" }

// Icon-only segment
{ value: "split", icon: "/img/icons/s2-icon-gridcompare-20-n.svg", label: "Split view", iconOnly: true }

// Short text segment with a longer accessible name
{ value: "s", label: "S", ariaLabel: "Small" }
```

`icon` is the path to the icon SVG (the sprite's `#icon` fragment is appended automatically). `label` is always required — it's shown as the segment's visible text unless `iconOnly` is set, in which case it's used as the `aria-label`/`title` instead. `ariaLabel` (optional) sets the `aria-label`/`title` of a text segment whose visible label is abbreviated.

## API

### Properties

| Property | Type     | Description                                                                            |
| -------- | -------- | -------------------------------------------------------------------------------------- |
| `items`  | `Array`  | List of segment descriptors (see shapes above).                                        |
| `value`  | `String` | Value of the currently selected segment. Set to change the selection programmatically. |
| `label`  | `String` | Accessible label for the control group (`aria-label`). Always provide one.             |
| `size`   | `String` | `"sm"` (default) or `"m"`. Reflected as an attribute, e.g. `<nx-segmented-btn size="m">`. |
| `compact` | `Boolean` | No track padding; segments are at least as wide as they are tall (24 in `sm`, 32 in `m`). For short labels like "S" / "M". |
| `emphasized` | `Boolean` | Selected segment uses the accent (blue) background. |

### Events

| Event    | Detail      | Description                                                                |
| -------- | ----------- | -------------------------------------------------------------------------- |
| `change` | `{ value }` | Fired when the user selects a different segment. `value` matches the item. |
