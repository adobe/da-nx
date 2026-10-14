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

The opened and copied URLs in the "Send" modal follow the branch resolved by da-live's canvas. Nexter does not independently fetch config or interpret `?ref`. Canvas resolves once per document/context and shares the same promise with the WYSIWYG iframe and the same result with external consumers through its branch bridge.

The authoritative resolver in da-live applies:

1. The `?ref=<branch>` URL param, if present.
2. Otherwise the longest-prefix match of the `ew.wysiwygBranch` config rows (value `/org/site/prefix=branch`); site config rows win over org config rows on equal prefixes. Prefixes match complete path segments: `/docs` matches `/docs` and `/docs/page`, but not `/docs-archive`. A trailing slash on a prefix is optional.
3. Otherwise `main`. Config responses with an explicit HTTP error are logged and excluded, so a valid org config still applies if the site config is unavailable.

Multi-sheet configs are read in the order declared by `:names`, independent of JSON key insertion order, including the metadata-first shape produced by `object2sheet`.

The cross-repo contract is defined in `nx2/utils/branch-events.js`. Canvas translates its internal replayable `branchState` channel into document-level `nx-branch-state` events. A late consumer sends `nx-branch-request` with `{ path }` to replay the current state. State includes `{ org, site, path, status, branch?, error? }`, where status is `pending`, `ready`, or `error`. Paths preserve the canvas context's case and extension; neither side adds `.html` for this contract.

Send requests state on connection and navigation, retrying every 100 ms for up to 3 seconds to allow the bridge to load. It ignores other documents' state and cancels old requests on navigation/disconnection. Until the branch is ready, copied URLs are hidden. Missing/error state prevents deployment with an error dialog rather than silently selecting `main`; later valid state restores the URLs. The branch is captured before save/preflight awaits so navigation cannot retarget an in-progress action.

This requires the companion da-live branch bridge. Ship/test both changes together. An older host without that bridge fails closed; there is intentionally no second resolver or main-branch fallback in Nexter.

For a non-`main` branch the URLs are `https://{branch}--{site}--{org}.aem.page|live{webPath}`; for `main` they use the site's configured preview/production hosts. A `preview-url` / `live-url` meta template still takes precedence for the URL opened after a deploy.

## Deploy flow

On confirm, the control:

1. Flushes pending collab edits via the active editor's `forceSave()`, so AEM reads the latest content.
2. Runs the AEM action (`runAemPreviewOrPublish`).
3. Busts the AEM Sidekick disk cache for the resulting URL (`sidekickCacheBust`) and opens the page.
4. Records an auto-version (`Previewed` / `Published`).
5. Re-fetches status so the cards and badge reflect the new state.

Errors surface in an [`nx-dialog`](./dialog.md); a `403` offers to request the missing role.

After the auto-version request returns `201`, the control emits a bubbling, composed
`nx-version-created` event with `{ path }`, the full document path including its extension.
The event name is exported as `VERSION_EVENT.CREATED` from `nx2/utils/version-events.js`.
DA Live translates this cross-repo event onto its canvas bus to refresh version history
without reloading the editor. The path belongs to the document deployed, even if the
author navigates while the action is running.

Version creation does not block the deploy flow or show an additional alert.
Failures are logged to the console and do not emit a version-created event.

## Unpublished-changes badge

A dot on the Send button flags that previewed content is not yet (fully) live. It shows when the page **has been previewed** (`preview.status === 200`) **and** either:

- it has **never been published** (`live.status !== 200`), or
- the **preview is newer than the last publish** (`preview.lastModified > live.lastModified`).

It is hidden for an untouched draft (never previewed) and when live is already up to date with preview.

## Status source

Page status comes from the AEM admin status endpoint via `status.get({ org, site, path })` (`nx2/utils/api.js`). Per environment (`preview`, `live`) the control reads `status`, `url`, and `lastModified`. Status is fetched when the document changes and re-fetched after every preview/publish.
