# UI size scale (`ui-size`)

A user-level text/icon scale for Experience Workspace (chat + canvas).

- **s** — default. Exactly the sizes before the text-size work (pre da-nx#755).
- **m** — the bigger sizing from da-nx#755/#757 and da-live#1351.
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

1. **Never use raw `px` for text or icon sizes** in EW surfaces. Use an `--nx-ui-text-*` or `--nx-ui-icon-*` token.
2. **Pick tokens by role, not by size.** Names describe where the text/icon lives, so they stay true when m or l change the values. Size words (`s`/`m`/`l`) are reserved for the mode itself.
3. **Icons follow their container** (Spectrum/S2 mocks): 24px button → 16px icon, 32px button → 18px icon.
4. **New UI element?** Reuse the role token that matches. If none fits, add a new role token in `nx2/styles/styles.css` (`:root` = s value, `body.ui-size-m` = m value only if it differs) and list it below.
5. Values that only change in m and aren't sizes on their own (line-heights, paddings, picker height) go in a `:host([data-ui-size="m"])` block in the component's CSS.

## Text tokens

| Token | Role | s | m |
|---|---|---|---|
| `--nx-ui-text-body` | Main body text | 14 | 14 |
| `--nx-ui-text-detail` | Secondary/meta text | 12 | 12 |
| `--nx-ui-text-tool-detail` | Nested tool-call text, prompt titles | 11 | 14 |
| `--nx-ui-text-caption` | Captions | 11 | 12 |
| `--nx-ui-text-emphasis` | Emphasised short labels | 13 | 14 |
| `--nx-ui-text-comment` | Comment body | 15 | 14 |
| `--nx-ui-text-component` | Component text (prompts, panel rows) | 12 | 14 |
| `--nx-ui-text-preview-title` | Preview titles | 14 | 16 |
| `--nx-ui-text-badge` | Count badges | 10 | 11 |
| `--nx-ui-text-label` | Small labels | 11 | 11 |
| `--nx-ui-text-code` | Inline code glyph in toolbars | 0.7rem | 0.7rem |
| `--nx-ui-text-note` | Modal notes | 13 | 13 |
| `--nx-ui-text-input` | Numeric inputs | 15 | 15 |
| `--nx-ui-text-title` | Panel/modal titles | 16 | 16 |
| `--nx-ui-text-title-l` | Large titles | 18 | 18 |
| `--nx-ui-text-heading` | Headings | 20 | 20 |
| `--nx-ui-text-heading-l` | Large headings | 22 | 22 |
| `--nx-ui-text-field` | Textareas without an explicit size (browser default in s) | 13.33 | 14 |

## Line-height tokens

| Token | Role | s | m |
|---|---|---|---|
| `--nx-ui-line-body` | Body/comment/menu-row text | 1.5 | 18px |
| `--nx-ui-line-description` | Descriptions under items | 1.4 | 16px |
| `--nx-ui-line-component` | Compact component text (block toolbar) | 16px | 18px |

## Icon tokens

| Token | Role | s | m |
|---|---|---|---|
| `--nx-ui-icon-micro` | Tiny status glyphs | 12 | 12 |
| `--nx-ui-icon-inline` | Icons inline with small text (pills, tiny actions) | 14 | 14 |
| `--nx-ui-icon-indicator` | Checkmarks/arrows in picker rows | 14 | 16 |
| `--nx-ui-icon-compact` | Icons in 24px controls (`.nx-btn-sm`, compact rows) | 16 | 16 |
| `--nx-ui-icon-regular` | Icons in 32px controls (default buttons, `size="m"` rows) | 18 | 18 |
| `--nx-ui-icon-feature` | Status/heading icons | 20 | 20 |
| `--nx-ui-icon-status` | Large status glyphs | 24 | 24 |
| `--nx-ui-icon-toolbar` | Standalone canvas toolbar/panel icons | 16 | 18 |

## Control tokens

| Token | Role | s | m |
|---|---|---|---|
| `--nx-ui-toolbar-btn-size` | Block/selection toolbar buttons and variant picker | 24 | 32 |
| `--nx-ui-inline-btn-height` | Small inline buttons (version filters, compare actions) | 24 | 28 |
| `--nx-ui-panel-field-height` | Inputs/buttons in panel forms (new version row) | 24 | 32 |
| `--nx-ui-field-border-width` | Comment textarea border | 2 | 1 |
| `--nx-ui-icon-btn-hover-bg` | Icon button hover background | gray-75 | gray-75 |
| `--nx-ui-icon-btn-hover-color` | Icon button hover icon color | gray-800 | gray-800 |

The hover tokens are the same in s and m: every icon button hovers pale gray.

The 2px blue `:focus-visible` outline on canvas toolbar buttons is m-only, applied through
`:host([data-ui-size="m"])` so s keeps the browser default ring.

Icon buttons outside toolbars (chat close, tool panel close, Create version) use the shared
`nx-action-btn-icon` class. They add `nx-btn-sm` in s (24px button, 16px icon) and drop it in m
(32px button, 18px icon), so the size comes from the button class, not from a token.

## Segmented buttons

The canvas editor-view toggle uses the shared `nx-segmented-btn` and passes the current ui-size as
its `size` attribute: the default sm styles in s, `size="m"` in m.

## Pickers and menus

`nx-picker` and `nx-menu` keep their own `size` attribute (`s`/`m`). EW call sites pass the current
ui-size, so Spectrum `s` styling shows in s and Spectrum `m` styling in m. The picker's `size="m"` also
carries the list-item states from #757 (corner-radius-400 rows, gray-100 hover, gray-200 active, gray-900 text),
which already match `nx-menu`.
