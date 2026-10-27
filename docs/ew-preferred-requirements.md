# EW preferred requirements

What reviewers expect from Experience Workspace (EW) code in da-nx and da-live. Part 1 is the S/M UI size scale. Part 2 lists what reviewers asked us to change before, so new PRs avoid the same mistakes.

## 1. UI size scale (`ui-size`)

A user-level text/icon scale for Experience Workspace (chat + canvas).

- **s** — default. Same sizes as the UI before the scale existed (main), with off-scale values snapped to S2.
- **m** — one S2 step bigger than s. Relative sizes (main text vs. secondary text vs. captions) stay the same.
- **l** — reserved for later. Not implemented: any stored value other than `m` is treated as `s`.

### How it is switched

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
Use `setUISize({ size: 'm' })` to persist and broadcast a change. Changes from another
tab are applied through the storage event. Storage failures leave the applied scale unchanged.

To test the startup preference manually, in the devtools console with the context set to **top**:

```js
localStorage.setItem("ui-size", "m"); // or 's', or localStorage.removeItem('ui-size')
```

then reload (with "Disable cache" ticked while testing branch previews).

### Rules

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
10. **No size transitions.** The switch is instant. Animate only colors and transforms, never `transition: all`, so sizes don't animate on S/M.

### Text

| Role                   | How                                                     | s   | m   |
| ---------------------- | ------------------------------------------------------- | --- | --- |
| Heading                | `--nx-ui-text-heading`                                  | 18  | 20  |
| Title                  | `--nx-ui-text-title`                                    | 16  | 18  |
| Main text              | `--nx-ui-text-content` (line `--nx-ui-line-content` for single-line rows) | 14  | 16  |
| Secondary text         | `--s2-component-s-regular-font-size` + m override       | 12  | 14  |
| Caption                | `--s2-component-xs-regular-font-size` + m override      | 11  | 12  |
| Large values and names | `--s2-heading-size-s` + m override (page-eval tile value, profile name, welcome title) | 20  | 22  |

### Icons

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

### Key badges

`kbd` badges inside shared buttons (Esc, ↵ in the chat permission, question and plan cards) follow the button size:
11px text in `nx-btn-sm`, 12px in the default size, 14px in `nx-btn-lg`.

### Segmented buttons

The canvas editor-view toggle uses the shared `nx-segmented-btn` and passes the current ui-size as
its `size` attribute: the default sm styles in s, `size="m"` in m.

### Pickers and menus

`nx-picker` and `nx-menu` keep their own `size` attribute (`s`/`m`). EW call sites pass the current
ui-size, except menus and pickers that were `size="m"` on main (chat session picker, slash and add menus,
prompts category picker, page metadata picker), which stay `m` in both sizes. The prompts search follows
the `nx-prompts` size. The picker list matches `nx-menu` in every size: 8px popover padding, 12px item inset,
corner-radius-400 rows, gray-100 hover, gray-200 active, gray-900 text. Rows are 28px in s and 32px in m.
Section titles are 11px with an 8px inset in s, 12px with a 12px inset in m.

## 2. Review lessons

Collected from review comments on our EW PRs in da-nx and da-live (Sharanya, Markus, Natalia, Hannes). Each line is something a reviewer asked us to change.

### Reuse before building

1. Use an existing shared block before writing a new one: `nx-dialog`, `nx-segmented-btn`, `nx-picker`, `nx-menu`, `nx-search`, shared button classes. If the shared block can't do it yet, extend the shared block first instead of building a one-off.
2. Use native HTML/CSS before JS: `:focus-visible` instead of focus listeners, `scrollIntoView` with `scroll-margin-top` instead of manual scroll math, the native scrollbar instead of custom scrollbar CSS, block flow instead of flex just for `gap`. Don't add JS that browsers already do (for example custom scroll handling that only helps Safari).
3. Follow the pattern the codebase already uses for the same job. Icons load from da.live (`/img/icons/s2-icon-{name}-20-n.svg`, relative path); ask to upload a missing icon instead of inlining SVG. A refresh button works like the file explorer refresh.
4. Don't add options, props or exposed parts without a real use case.
5. Use S2 tokens and check the token exists (`--s2-spacing-50` to `--s2-spacing-1000`, `--s2-heading-size-*`). No invented token names.

### Scope and side effects

1. Component-specific CSS stays in the component. Don't add one component's styles to shared files like `buttons.css`; use a shared base class plus a local modifier class.
2. Feature-specific logic stays out of shared code (for example the shared fragment loader). A change in a shared component must not leak to every consumer (for example chat-ao styles meant only for Coworker).
3. Changes to shared CSS (for example `dialog.css`) affect every consumer. Check them before pushing.
4. Don't ship temporary or "remove before merge" code, and don't add testing-only features (for example a `?uiSize=` query param).
5. Don't depend on a da-nx change that isn't deployed yet without confirming it is live.
6. If you hardcode an assumption that blocks reuse, say so in the PR.

### Sizes and layout

1. Keep size differences between variants. They are intentional (24px button has a 16px icon, 32px button has an 18px icon; pills differ per variant).
2. Don't make things bigger than asked. When unsure, keep the s value and ask.
3. Every new shared CSS rule with a size needs its m variant too.
4. Let dialogs and panels size to their content. No equal min and max sizes, no absolute positioning for layout, no `overflow: hidden` to hide a layout problem.
5. When scaling, check every surface, including toolbars that appear only on selection (for example the block toolbar).
6. Check that text renders in Adobe Clean, not a fallback font.
7. Support light and dark mode.

### Code organization

1. Keep component files about state and rendering. Put shared constants in a sibling `constants.js`. Constants used by only one block stay in that block's folder, not in another block's constants.
2. Move pure input-to-output logic into a util next to the component.
3. Name event handlers `_on...` (for example `_onRefresh`), not `handle...`.
4. Name magic strings as `SCREAMING_SNAKE_CASE` constants.
5. Put block-only helpers in the block folder, not in the generic `utils/` folder.
6. Keep contracts consistent: a getter and setter must accept the same values.

### Robustness and accessibility

1. Catch failed fetches and return a consistent shape (`{ error, status }` or `{ json }`).
2. Don't fetch the same URL twice; share the result or the in-flight promise.
3. Guard against races (double click, auto-open plus click) with the in-flight promise or a flag, not two DOM checks.
4. Don't rely on events that might not fire (for example `scrollend` when the scroll position doesn't change).
5. Scope global (`window`) listeners to the component lifecycle and remove them on disconnect. Better: don't add them.
6. Return focus to the trigger when a dialog closes. `nx-dialog` already does this, so check before adding code.
7. Don't open UI automatically (for example an auto-opening dialog). Introduce new things quietly.

### Comments, docs and tests

1. Keep comments to one short line, only where the code can't explain itself.
2. Docs describe the current behavior (a spec), not the history of the work. Don't add docs that aren't needed.
3. Keep shared docs and skills generic. Don't name a specific project (for example Nerve Center) unless the case is project-specific.
4. Add tests for new features.
