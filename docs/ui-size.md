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
localStorage.setItem("ui-size", "m"); // or 's', or localStorage.removeItem('ui-size')
```

then reload (with "Disable cache" ticked while testing branch previews).

## Rules

1. **Use text tokens and component-owned icon sizes.** Use an `--nx-ui-text-*` token for text. Set icon dimensions directly in the owning component, with an m override when needed.
2. **Keep the layer small.** Text has three roles (heading, title, content). Secondary text (dates, hints, descriptions) uses content too; only tiny badges keep explicit 11px. Shared components own their icon sizing through their size variant; don't add a global icon scale.
3. **s is smaller than m where sizing changes.** Text tokens step one size down the S2 scale in s. Compact row controls can stay the same size.
4. **Only S2 sizes.** No in-between values like 13px or 15px.
5. **Shared components** (`nx-menu`, `nx-picker`, `nx-pills`, `nx-search`, `nx-prompts`, `nx-new-chat`, `buttons.css`) follow their own variant, not the page's ui-size. Inside them use plain px per variant, no `--nx-ui-*` vars. EW call sites pass the ui-size as the variant (`size=${getUISize()}`).
   Row action buttons (file explorer, outline, block library, comments) stay `nx-btn-sm` (24px, 16px icon) in both sizes so rows keep their height.
   EW actions (Prepare, Send, and the deploy action) use `nx-btn-sm` in s and the default button size in m.
   Every other button uses the shared `buttons.css` classes (`nx-action-btn`, `nx-action-btn-icon`, `nx-action-btn-quiet`) with `nx-btn-sm` in s and the default size in m. No button-size, icon-size or control-height tokens.
6. Component-specific m overrides (icon dimensions, line-heights, paddings, picker height) go in a `:host([data-ui-size="m"])` block in the component's CSS.

## Text tokens

| Token                      | Role                                                                   | s   | m   |
| -------------------------- | ---------------------------------------------------------------------- | --- | --- |
| `--nx-ui-text-heading`     | Panel headings, large titles                                           | 18  | 20  |
| `--nx-ui-text-title`       | Panel/modal/card titles                                                | 16  | 18  |
| `--nx-ui-text-content`     | All body and secondary text: messages, comments, outline, inputs, lists, rows, dates, hints, descriptions | 12  | 14  |

## Line-height tokens

| Token                      | Role                                | s    | m    |
| -------------------------- | ----------------------------------- | ---- | ---- |
| `--nx-ui-line-content`     | All content and secondary text      | 16px | 18px |

## Icon sizing

Icons are sized by their owning component, not by a global token or arithmetic offsets.
Shared buttons use `nx-btn-sm` for 16px icons and their default variant for 18px icons.
Standalone icons use explicit dimensions, with an m override on the component host where needed.

| Component icons                            | s  | m  |
| ------------------------------------------ | -- | -- |
| Chat AO message-copy and selection         | 14 | 16 |
| Chat AO alert                              | 18 | 20 |
| Deploy glyph                               | 14 | 16 |
| Deploy checkmark                           | 20 | 22 |
| Deploy copy                                | 16 | 18 |
| Page evaluation status and modal heading   | 18 | 20 |
| Page evaluation section chevron, modal copy and modal paging | 14 | 16 |
| Page evaluation list paging                | 12 | 14 |

Components needing these overrides set `data-ui-size` from `getUISize()` when connected.
The page's text tokens still inherit through shadow roots; icon dimensions do not depend on them.

## Controls

There are no control-height tokens. Buttons get their height from the shared button classes
(`nx-btn-sm` 24px in s, default 32px in m). Non-button controls (compare chips, inline inputs,
the block toolbar picker) use explicit px with a `:host([data-ui-size="m"])` override.

## Segmented buttons

The canvas editor-view toggle uses the shared `nx-segmented-btn` and passes the current ui-size as
its `size` attribute: the default sm styles in s, `size="m"` in m.

## Pickers and menus

`nx-picker` and `nx-menu` keep their own `size` attribute (`s`/`m`). EW call sites pass the current
ui-size, so Spectrum `s` styling shows in s and Spectrum `m` styling in m. The picker list matches `nx-menu`
in every size: 8px popover padding, 12px item inset, corner-radius-400 rows, gray-100 hover, gray-200 active,
gray-900 text, 24px items in s and 32px in m.
