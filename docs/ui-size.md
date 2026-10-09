# UI size scale (`ui-size`)

A user-level text/icon scale for Experience Workspace (chat + canvas).

- **s** — default. One S2 step smaller than m.
- **m** — the sizing from da-nx#755/#757 and da-live#1351 (body, comment, title and input text one step bigger).
- **l** — reserved. `getUISize()` accepts it, but no values exist yet.

## How it is switched

`getUISize()` in `nx2/scripts/nx.js` reads `localStorage['ui-size']` (same pattern as `color-scheme`).
`decorateDoc()` adds `body.ui-size-{size}` for anything other than `s`. Components that need
per-component overrides reflect it as `data-ui-size` on their host.

There is no UI control yet. To test, in the devtools console with the context set to **top**:

```js
localStorage.setItem('ui-size', 'm'); // or 's', or localStorage.removeItem('ui-size')
```

then reload (with "Disable cache" ticked while testing branch previews).

## Rules

1. **Never use raw `px` for text or icon sizes** in EW surfaces. Use an `--nx-ui-text-*` token or `--nx-ui-icon`.
2. **Keep the layer small.** Text has five roles (heading, title, content, description, caption). Icons have one token. Pick the role that fits; don't add a token per surface.
3. **s is always smaller than m.** Every token steps one size down the S2 scale in s. m keeps the #757/da-live#1351 sizes.
4. **Only S2 sizes.** No in-between values like 13px or 15px.
5. **Shared components** (`nx-menu`, `nx-picker`, `nx-pills`, `nx-prompts`, `nx-new-chat`, `buttons.css`) follow their own variant, not the page's ui-size. Inside them use plain px per variant, no `--nx-ui-*` vars. EW call sites pass the ui-size as the variant (`size=${getUISize()}`).
   Row action buttons (file explorer, outline, block library, comments) stay `nx-btn-sm` (24px, 16px icon) in both sizes so rows keep their height.
6. Values that only change in m and aren't sizes on their own (line-heights, paddings, picker height) go in a `:host([data-ui-size="m"])` block in the component's CSS.

## Text tokens

| Token | Role | s | m |
|---|---|---|---|
| `--nx-ui-text-heading` | Panel headings, large titles | 18 | 20 |
| `--nx-ui-text-title` | Panel/modal/card titles | 16 | 18 |
| `--nx-ui-text-content` | Reading text: chat messages, comments, outline, inputs, preview titles | 14 | 16 |
| `--nx-ui-text-description` | Lists, menus, rows, tool-call detail, library rows | 12 | 14 |
| `--nx-ui-text-caption` | Secondary/meta text, labels, badges, dates | 11 | 12 |

## Line-height tokens

| Token | Role | s | m |
|---|---|---|---|
| `--nx-ui-line-content` | Content text (comments, menu rows) | 1.5 | 20px |
| `--nx-ui-line-description` | Compact description text (block toolbar) | 16px | 18px |
| `--nx-ui-line-caption` | Captions under items | 1.4 | 16px |

## Icon tokens

| Token | Role | s | m |
|---|---|---|---|
| `--nx-ui-icon` | All EW icons and icon-button icons | 16 | 18 |

One icon token. The few icons paired with smaller or bigger text use a local `calc()` from it, so they still switch with s/m:

| Use | Value | s | m |
|---|---|---|---|
| Tree chevrons (outline, files) | `calc(var(--nx-ui-icon) - 8px)` | 8 | 10 |
| Icons next to small text (selection icon, paging arrow, versions audit chevron) | `calc(var(--nx-ui-icon) - 4px)` | 12 | 14 |
| Icons in compact rows (outline, versions, file explorer, panel header, block library modal, page evaluation, Prepare card glyph, chat copy) | `calc(var(--nx-ui-icon) - 2px)` | 14 | 16 |
| Status/heading icons (page evaluation, chat alert, comments empty state, Prepare dialog) | `calc(var(--nx-ui-icon) + 2px)` | 18 | 20 |
| Prepare done check | `calc(var(--nx-ui-icon) + 4px)` | 20 | 22 |

## Control tokens

| Token | Role | s | m |
|---|---|---|---|
| `--nx-ui-control-height` | Default control height: toolbar buttons, toolbar picker, form inputs and buttons | 24 | 32 |
| `--nx-ui-icon-btn-size` | Standalone icon buttons (canvas header, Prepare menu, chat close and input actions, tool panel and dialog close, versions and file explorer actions) | 24 | 32 |
| `--nx-ui-control-height-compact` | Compact buttons inside lists (version filters, compare actions) | 24 | 28 |
| `--nx-ui-icon-btn-hover-bg` | Icon button hover background | gray-75 | gray-75 |
| `--nx-ui-icon-btn-hover-color` | Icon button hover icon color | gray-800 | gray-800 |

The hover tokens are the same in s and m. EW's standalone icon buttons use them for a pale gray hover; the shared `nx-action-btn-icon` hover in `buttons.css` is unchanged for other apps.

The 2px blue `:focus-visible` outline on canvas toolbar buttons is m-only, applied through
`:host([data-ui-size="m"])` so s keeps the browser default ring.

Standalone icon buttons (canvas header, Prepare menu, chat close, chat input actions, tool panel close, Create version) use the shared
`nx-action-btn-icon` class, resized in the consumer's own CSS (button with `--nx-ui-icon-btn-size`, its svg with
`--nx-ui-icon`): 24px button with a 16px icon in s, 32px with 18px in m, matching the Spectrum
action button sizes. da-live's `.da-icon-btn` (versions, compare, file explorer) and the tool panel dialog close use the same tokens. Canvas block and selection toolbar buttons keep their own sizes.

## Segmented buttons

The canvas editor-view toggle uses the shared `nx-segmented-btn` and passes the current ui-size as
its `size` attribute: the default sm styles in s, `size="m"` in m.

## Pickers and menus

`nx-picker` and `nx-menu` keep their own `size` attribute (`s`/`m`). EW call sites pass the current
ui-size, so Spectrum `s` styling shows in s and Spectrum `m` styling in m. The picker's `size="m"` also
carries the list-item states from #757 (corner-radius-400 rows, gray-100 hover, gray-200 active, gray-900 text),
which already match `nx-menu`.
