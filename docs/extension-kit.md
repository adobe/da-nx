# Extension kit (S/M ui-size for iframe extensions)

EW panel extensions run in their own document, often on another origin, so EW's `body.ui-size-m` class
and `nx2/styles` tokens don't reach them. The host sends the size and the extension kit turns it into sizes.

## How the size reaches the extension

1. EW adds `uiSize` (`'s'` or `'m'`) to `context` in the `ready` message, for side panel extensions (`da-live/blocks/canvas/ew-panel-extensions/iframe-protocol.js`) and prepare menu iframes (`da-live/blocks/canvas/editor-utils/prepare-menu.js`).
2. When the user switches size, EW posts `{ action: 'uiSizeChange', detail: { uiSize } }` to the iframe.
3. `nx/utils/sdk.js` mirrors the size as `body.ui-size-m` on start and on every change, and dispatches
   `nx-ui-size-change` (`UI_SIZE_EVENT`, `detail: { size }`) on `document` after a change.

Extensions can ignore all of this. Hosts that don't send `uiSize` (older EW, DA edit, apps) leave the extension in S.

## Using the kit

Link the kit after your own reset, before your own styles:

```html
<link rel="stylesheet" href="https://da.live/nx2/public/ew/ew.css">
```

Then size things with the tokens or the kit classes. Everything in the kit has zero specificity (`:where()`),
so your own rules win. The kit sets sizes only; colors, fonts and borders stay yours.

| Token                    | s  | m  | Use                                   |
| ------------------------ | -- | -- | ------------------------------------- |
| `--nx-ui-text-heading`   | 18 | 20 | `h1`                                  |
| `--nx-ui-text-title`     | 16 | 18 | `h2`                                  |
| `--nx-ui-text-content`   | 14 | 16 | body text, `h3`, inputs               |
| `--nx-ui-line-content`   | 18 | 20 | body line height                      |
| `--nx-ui-text-small`     | 12 | 14 | secondary text, buttons, `small`      |
| `--nx-ui-line-small`     | 16 | 18 | line height for small text            |
| `--nx-ui-text-caption`   | 11 | 12 | captions                              |
| `--nx-ui-icon`           | 16 | 18 | icons                                 |
| `--nx-ui-icon-sm`        | 14 | 16 | small inline icons                    |
| `--nx-ui-control-height` | 24 | 32 | buttons, icon buttons, inputs         |

Classes: `.nx-btn`, `.nx-action-btn-icon` (square), `.nx-input`, `.nx-icon`, `.nx-text-small`, `.nx-text-caption`.
Icons (`svg`, `img`) inside `.nx-btn` and `.nx-action-btn-icon` get `--nx-ui-icon`.

Text tokens match EW's `nx2/styles/styles.css` (checked by `test/nx2/public/ew/ew.test.js`). The rest match
EW's shared buttons: `nx-btn-sm` in s, default in m.

Sizes set in JS (canvas, virtualized lists) can listen for the event:

```js
import DA_SDK, { UI_SIZE_EVENT } from 'https://da.live/nx/utils/sdk.js';

const { context } = await DA_SDK;
render(context.uiSize ?? 's');
document.addEventListener(UI_SIZE_EVENT, ({ detail }) => render(detail.size));
```

The kit lives in `nx2/public`, so it is part of the public SDK: only add tokens and classes, never rename or remove them.

## Not covered

- AEM Assets: the Asset Selector is an external script with no scale option yet.
- nx v1 apps (Snapshots, Media Library app, Translation): not loaded through the extension panel.
- `sl` components: nx2 `sl` sets field sizes on each component's `:host`, so a body-level M override can't reach them. Follow-up.
- SDK2 (adobe/da-nx#864) will need the same `uiSize` in its context.
