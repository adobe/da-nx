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
| `--nx-ui-text-badge` | Count badges | 10 | 10 |
| `--nx-ui-text-label` | Small labels | 11 | 11 |
| `--nx-ui-text-code` | Inline code glyph in toolbars | 0.7rem | 0.7rem |
| `--nx-ui-text-note` | Modal notes | 13 | 13 |
| `--nx-ui-text-input` | Numeric inputs | 15 | 15 |
| `--nx-ui-text-title` | Panel/modal titles | 16 | 16 |
| `--nx-ui-text-title-l` | Large titles | 18 | 18 |
| `--nx-ui-text-heading` | Headings | 20 | 20 |
| `--nx-ui-text-heading-l` | Large headings | 22 | 22 |

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

In m, chat toolbar buttons also switch from 24px (`nx-btn-sm`) to 32px, so their icons move from
`compact` to `regular` through the button, not through the token.
