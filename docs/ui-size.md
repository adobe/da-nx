# UI size scale (`ui-size`)

A user-level text/icon scale for Experience Workspace (chat + canvas).

- **s** — default. Same sizes as the UI before the scale existed (main), with off-scale values snapped to S2.
- **m** — one S2 step bigger than s. Relative sizes (main text vs. secondary text vs. captions) stay the same.
- **l** — reserved for later. Not implemented: any stored value other than `m` is treated as `s`.

## How it is switched

`getUISize()` in `nx2/scripts/nx.js` reads `localStorage['ui-size']` (same pattern as `color-scheme`).
`decorateDoc()` adds `body.ui-size-m` when the size is `m`. Components that need
per-component overrides reflect it as `data-ui-size` on their host.

The profile popover contains a **UI size** segmented control below Organization and above Links.
It is a compact, emphasized `nx-segmented-btn` on one line with **S** and **M** (aria labels Small and Medium). Select one to apply the scale immediately, without reloading or resetting
the document, chat, or selected panels. The preference persists in `localStorage`.
Large remains reserved and is not offered in the control.

Components using the global scale attach a `UISizeController` from `nx2/utils/ui-size.js`.
The controller sets `data-ui-size` on connection and requests a Lit update on
`UI_SIZE_EVENT` (`nx-ui-size-change`). It removes its listener on disconnection.
Shared components still receive their own `size` property from their owning component.
Use `setUISize({ size: 'm' })` to persist and broadcast a change. The profile switcher passes `animate: true`, which crossfades the page over 0.2s with a view transition once all `UISizeController` hosts have re-rendered (skipped with reduced motion or without browser support). Changes from another
tab are applied through the storage event. Storage failures leave the applied scale unchanged.

To test the startup preference manually, in the devtools console with the context set to **top**:

```js
localStorage.setItem("ui-size", "m"); // or 's', or localStorage.removeItem('ui-size')
```

then reload (with "Disable cache" ticked while testing branch previews).

## Rules

1. **s = main.** Every element keeps the size it had before the scale. m is one S2 step up from that.
2. **Main text uses tokens.** `--nx-ui-text-content` (14/16), `--nx-ui-text-title` (16/18), `--nx-ui-text-heading` (18/20).
3. **Smaller text is set in the component.** Secondary text (12 in s, 14 in m) and captions (11 in s, 12 in m) use S2 component font sizes with one grouped m override per component, e.g. `:host([data-ui-size="m"]) :is(.a, .b) { font-size: var(--s2-component-m-regular-font-size); }`. No extra tokens.
4. **Only S2 sizes.** Off-scale values snap to the closest step by role: 13 to 12, 15 to 14, 10 to 11, rem values to px.
5. **Icons:** s = main px, m = main + 2, set in the owning component.
6. **Buttons follow their size on main** and use only shared classes:
   - 24 on main: `nx-btn-sm` in s, default (32) in m.
   - 32 (or 28) on main: default in s, `nx-btn-lg` (40) in m.
   - Panel closes (chat, tool panel) and the comments toggle are 32 on main, so default in s and `nx-btn-lg` in m.
   - Top bar (breadcrumbs, Prepare/Publish and its card buttons, feedback, profile button) keeps main sizes in both, except the Update/Publish button inside the deploy card, which is `nx-btn-lg` in m.
   - Exception: fullsize dialog closes stay 28 in s and 32 in m (28 on main, no shared 28 size).
7. **Line height:** multi-line text inherits the body line height (`--s2-body-line-height`, 1.5). Don't override it.
8. **Shared components** (`nx-menu`, `nx-picker`, `nx-pills`, `nx-search`, `nx-prompts`, `nx-new-chat`, `nx-segmented-btn`, `buttons.css`) follow their own `size` variant. Menus, pickers and searches that were `size="m"` on main stay `m` in both sizes.
9. Component-specific m overrides go in one `:host([data-ui-size="m"])` block per component (or `body.ui-size-m` outside shadow DOM).

## Text

| Role                   | How                                                     | s   | m   |
| ---------------------- | ------------------------------------------------------- | --- | --- |
| Heading                | `--nx-ui-text-heading`                                  | 18  | 20  |
| Title                  | `--nx-ui-text-title`                                    | 16  | 18  |
| Main text              | `--nx-ui-text-content` (line `--nx-ui-line-content` for single-line rows) | 14  | 16  |
| Secondary text         | `--s2-component-s-regular-font-size` + m override       | 12  | 14  |
| Caption                | `--s2-component-xs-regular-font-size` + m override      | 11  | 12  |
| Large values and names | `--s2-heading-size-s` + m override (page-eval tile value, profile name, welcome title) | 20  | 22  |

## Icons

| Component icons                            | s  | m  |
| ------------------------------------------ | -- | -- |
| Chat AO message-copy and selection         | 14 | 16 |
| Chat AO alert                              | 20 | 22 |
| Chat AO coworker logo in the input        | 16 | 18 |
| Pill remove (×)                            | 12 | 14 |
| Deploy glyph                               | 16 | 18 |
| Deploy checkmark                           | 24 | 26 |
| Deploy copy                                | 18 | 20 |
| Page evaluation status and modal heading   | 20 | 22 |
| Page evaluation section chevron, modal copy and modal paging | 16 | 18 |
| Page evaluation list paging                | 14 | 16 |
| Profile popover icons                      | 20 | 22 |
| Profile avatar button (top bar)            | 32 (24 photo) | 32 (24 photo) |
| Profile popover photo                      | 72 | 80 |
| Tree carets (file explorer, page outline)  | 10 | 12 |
| Outline drag handle and row icons          | 16 | 18 |

Components needing these overrides use `UISizeController` to keep `data-ui-size` current.

## Key badges

`kbd` badges inside shared buttons (Esc, ↵ in the chat permission, question and plan cards) follow the button size:
11px text in `nx-btn-sm`, 12px in the default size, 14px in `nx-btn-lg`.

## Segmented buttons

The canvas editor-view toggle uses the shared `nx-segmented-btn` and passes the current ui-size as
its `size` attribute: the default sm styles in s, `size="m"` in m.

## Pickers and menus

`nx-picker` and `nx-menu` keep their own `size` attribute (`s`/`m`). EW call sites pass the current
ui-size, except menus and pickers that were `size="m"` on main (chat session picker, slash and add menus,
prompts category picker, page metadata picker), which stay `m` in both sizes. The prompts search follows
the `nx-prompts` size. The picker list matches `nx-menu` in every size: 8px popover padding, 12px item inset,
corner-radius-400 rows, gray-100 hover, gray-200 active, gray-900 text. Rows are 28px in s and 32px in m.
Section titles are 11px with an 8px inset in s, 12px with a 12px inset in m.
