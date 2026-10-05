# nx-ew-actions

The Experience Workspace deploy control: the **Send** button in the workspace header and the popover it opens for previewing and publishing the current page. Self-contained — it reads the current document from global URL state (`hashChange`) and the page status from the AEM admin API, so there are no props to set. Part of the workspace shell (see [workspace.md](./workspace.md)).

## Usage

Mounted by the workspace header; it takes no attributes.

```js
import "/path/to/blocks/ew-actions/ew-actions.js";
```

```html
<nx-ew-actions></nx-ew-actions>
```

The current document is derived from the URL (`hashChange` → `{ org, site, path }`). The Send button disables itself when there is no document.

## Deploy popover

Clicking **Send** opens an [`nx-popover`](./popover.md) anchored below-end of the button, with two selectable cards:

- **Preview** — the preview copy. Subtitle: *Last updated {time}*.
- **Publish** — the live copy. Subtitle: *Last published {time}*. ("Publish" is the end-user label for the live environment; the status API calls it `live`.)

Exactly one card is selected at a time (default: Preview). The primary button reflects the selection:

| Selected card | Button    | Action                      |
| ------------- | --------- | --------------------------- |
| Preview       | `Update`  | AEM `preview`               |
| Publish       | `Publish` | AEM `preview`, then `live`  |

Selecting a card reveals that environment's delivery URL with a copy-to-clipboard control. The URL is shown **only when the environment is deployed** (status `200`); an environment that has never been previewed/published shows *Not previewed yet* / *Not published yet* with no URL.

Timestamps use `formatRelativeDateTime` (`nx2/utils/format.js`) — "Today at 14:32" / "Yesterday at 14:32", falling back to a short date ("17 Jun, 16:02").

## Selected branch

The opened and copied URLs in the "Send" modal follow the selected site branch. The branch is resolved by `fetchWysiwygBranch` (`nx2/utils/aem-preview-publish.js`):

1. The `?ref=<branch>` URL param, if present.
2. Otherwise the longest-prefix match of the `ew.wysiwygBranch` config rows (value `/org/site/prefix=branch`); site config rows win over org config rows on equal prefixes.
3. Otherwise `main` — also when the config can't be read.

`fetchWysiwygBranch` and the config helpers it uses (`fetchDaConfigs`, `getFirstSheet` in `nx2/utils/daConfig.js`) are copied from da-live so both resolve the same branch; keep them in sync. The only intentional difference: da-nx doesn't cache failed config fetches.

For a non-`main` branch the URLs are `https://{branch}--{site}--{org}.aem.page|live{webPath}`; for `main` they use the site's configured preview/production hosts. A `preview-url` / `live-url` meta template still takes precedence for the URL opened after a deploy.

## Deploy flow

On confirm, the control:

1. Flushes pending collab edits via the active editor's `forceSave()`, so AEM reads the latest content.
2. Runs the AEM action (`runAemPreviewOrPublish`).
3. Busts the AEM Sidekick disk cache for the resulting URL (`sidekickCacheBust`) and opens the page.
4. Records an auto-version (`Previewed` / `Published`).
5. Re-fetches status so the cards and badge reflect the new state.

Errors surface in an [`nx-dialog`](./dialog.md); a `403` offers to request the missing role.

## Unpublished-changes badge

A dot on the Send button flags that previewed content is not yet (fully) live. It shows when the page **has been previewed** (`preview.status === 200`) **and** either:

- it has **never been published** (`live.status !== 200`), or
- the **preview is newer than the last publish** (`preview.lastModified > live.lastModified`).

It is hidden for an untouched draft (never previewed) and when live is already up to date with preview.

## Status source

Page status comes from the AEM admin status endpoint via `status.get({ org, site, path })` (`nx2/utils/api.js`). Per environment (`preview`, `live`) the control reads `status`, `url`, and `lastModified`. Status is fetched when the document changes and re-fetched after every preview/publish.
