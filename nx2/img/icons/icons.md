# nx2 icons

All icons loaded via `<svg><use href="${codeBase}/img/icons/s2-icon-*-n.svg#icon">` unless noted. `codeBase` resolves to the nx2 root on whatever host is serving the code, so CDN icons are used on prod and proxied on localhost.

## CDN icons

No local copy — served from `https://da.live/img/icons/`.

| Icon | CDN file | Used in | Purpose |
|---|---|---|---|
| chevron-left | `s2-icon-chevronleft-10-n` | `nx-picker` — trigger button; `nx-breadcrumb` — crumb separator | `<svg><use>` |
| chevron-up | `s2-icon-chevronup-20-n` | `nx-chat` — expand/collapse send area toggle | `<svg><use>` |
| add | `s2-icon-add-20-n` | `nx-chat` — attach files button | `<svg><use>` |
| remove-circle | `s2-icon-removecircle-20-n` | `nx-chat` — clear context button | `<svg><use>` |
| split-left | `s2-icon-splitleft-20-n` | `nx-chat` — close/collapse chat panel | `<svg><use>` |
| arrow-up-send | `s2-icon-arrowupsend-20-n` | `nx-chat` — send message | `<svg><use>` |
| stop | `s2-icon-stop-20-n` | `nx-chat` — stop generation | `<svg><use>` |
| send | `s2-icon-send-20-n` | `nx-ew-actions` — preview / publish dropdown button | `<svg><use>` |
| 3d | `s2-icon-3d-20-n` | `nx-chat` renderers — block-type selection context icon | `<svg><use>` |
| file-text | `s2-icon-filetext-20-n` | `nx-chat` renderers — file-type selection context icon | `<svg><use>` |
| image | `s2-icon-image-20-n` | `nx-chat` renderers — image-type selection context icon | `<svg><use>` |
| table | `s2-icon-table-20-n` | `nx-chat` renderers — table-type selection context icon | `<svg><use>` |
| link | `s2-icon-link-20-n` | `nx-chat` add menu — "Files or images" item icon (via `nx-menu`, icon name `'link'`) | `<svg><use>` ¹ |

## Local icons (`img/icons/S2_Icon_*_20_N.svg`)

PascalCase files kept locally for the `span.icon` decoration path (`loadIcons` in `utils/svg.js`). When the page contains `<span class="icon icon-apps">`, `loadIcons` constructs `${codeBase}/img/icons/S2_Icon_Apps_20_N.svg#apps` and injects a `<svg><use href>` into the span. These files are **not** on the CDN in this format; the CDN only carries the kebab-case versions.

| Local file | `span.icon` class |
|---|---|
| `S2_Icon_Apps_20_N.svg` | `icon-apps` |
| `S2_Icon_Contrast_20_N.svg` | `icon-contrast` |
| `S2_Icon_HelpCircle_20_N.svg` | `icon-helpcircle` |
| `S2_Icon_Home_20_N.svg` | `icon-home` |
| `S2_Icon_Lightbulb_20_N.svg` | `icon-lightbulb` |
| `S2_Icon_UserAvatar_20_N.svg` | `icon-useravatar` |
| `S2_Icon_Close_20_N.svg` | `icon-close` ³ |
| `S2_Icon_ChevronUp_20_N.svg` | `icon-chevronup` ⁴ |

## Exceptions

### profile.js — user avatar
`this._avatar = '/public/icons/S2_Icon_User_20_N.svg'` — hard-coded absolute path, rendered as `<img src>`. Falls back to this path only when the IMS avatar fetch fails; normally the avatar is a user photo URL returned by IMS.

### profile.js — switch / share ³
`<svg class="icon"><use href="#S2IconSwitch20N-icon"/>` and `<use href="#S2IconShare20N-icon"/>` — fragment-only sprite references with no matching symbol defined anywhere in nx2. These icons are currently **not rendering**.

### nav.js — brand lockup
The nav fetches an SVG logo from a URL in the nav fragment content via `loadHrefSvg`. This is a full brand SVG, not an S2 icon, and is intentionally not covered by the `<svg><use>` pattern.

### rollout plugin — Smock icons
`public/plugins/rollout/rollout.js` fetches Smock SVGs from `https://da.live/nx/public/icons/` via `getSvg`, appends them as inline sprites, then references via `<svg><use href="#spectrum-id">`. These are a separate icon family (Smock, not S2) and live in `public/icons/`.

## Out-of-scope icon systems in da-live

The following da-live blocks use icons outside the S2 `<use href>` system. They are not part of this migration.

| Block | Icon family | Method | Notes |
|---|---|---|---|
| `blocks/edit/` (legacy editor) | Smock + S2 (PascalCase) | CSS `background-image` | ~50 rules in `da-editor.css` and `slash-menu.css`; legacy block not actively developed |
| `blocks/browse/da-list/` | Smock | `getSvg()` inline + `<img src>` | Smock_Cancel, Checkmark, Refresh, Filter20 |
| `blocks/browse/da-actionbar/` | Smock | `<img src>` | Smock_TextEdit, Copy, Cut, Delete, Share; CrossSize200 |
| `blocks/browse/da-sites/` | Custom product | `<img src>` | Non-S2 custom icons (site, sandbox, share, visibility) |
| `blocks/sheet/da-sheet-tabs.js` | Smock | `getSvg()` inline | Smock_Delete, Edit, Cancel, Checkmark via `/blocks/edit/img/` |

---

**¹ `nx-menu` icon rendering**
`nx-menu` renders `item.icon` as `<svg><use href="${codeBase}/img/icons/s2-icon-${item.icon}-20-n.svg#icon">`. Callers pass just the icon name (e.g. `'link'`, `'tagbold'`); the menu constructs the full CDN URL internally. `codeBase` resolves to `https://da.live` on prod and the local proxy on localhost.

**³ `S2_Icon_Close_20_N.svg` — toast.js**
Kept because `toast.js` loads it via `loadHrefSvg()` to inline it as a sprite, then references `#close` via `<svg><use>`. Unlike the other shell icons which use direct `<svg><use href="…svg#icon">`, toast fetches and inlines the SVG first. Migrate toast to direct `<svg><use>` to remove this file.

**⁴ `S2_Icon_ChevronUp_20_N.svg` — chat.css `summary::before`**
Kept because `chat.css` uses it as a CSS `mask-image` on the `summary::before` pseudo-element for the tool-card and selection-context `<details>` disclosure triangles. Cannot use `<svg><use>` on a pseudo-element without changing the JS markup in `renderers.js`. Migrate the disclosure triangle to an explicit `<svg>` inside `<summary>` to remove this file.
