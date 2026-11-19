# Snapshot API (public SDK)

`nx/public/snapshot/api.js` exposes the snapshot operations used by the Snapshot admin app
(`/apps/snapshots`) so other surfaces (e.g. the Experience Workspace snapshots panel in
`adobe-rnd/aem-apps`) can reuse them. It is part of the public SDK: keep it backwards compatible.

```js
import { createSnapshotApi } from 'https://da.live/nx/public/snapshot/api.js';

const api = createSnapshotApi({ fetch: actions.daFetch, org, site });
const { snapshots, error } = await api.list();
```

## Options

| Option | Required | Notes |
| --- | --- | --- |
| `fetch(url, opts)` | yes | Must add the user's auth (Bearer, and `x-content-source-authorization` for admin.hlx.page). The DA SDK's `actions.daFetch` does this. |
| `org`, `site` | yes | The site the instance operates on. |
| `source` | no | Replaces DA source access: `get(path)`, `getMetadata(path)`, `delete(path)` with `/org/site/path`, and `save({ org, site, path, body })` for HTML copies. Defaults to `admin.da.live/source` calls via `fetch`. HTML reads and version saves during Sync/Promote always go to `daOrigin`, so those are not yet supported on Helix 6 (AEM source bus) sites. The admin app passes the nx2 `source`. |
| `daOrigin` | no | Defaults to the DA admin origin for the current environment. |

## Methods

All methods take a single object argument. Failures return `{ error, status }`; network failures use `status: 0`. Bulk path changes wait for the admin job and return its error if polling fails.

| Method | Returns |
| --- | --- |
| `list()` | `{ snapshots: [{ org, site, name }] }` |
| `getManifest({ name })` / `saveManifest({ name, manifest })` | manifest with formatted `resources` (`path`, `url`, `aemPreview`, `aemLive`, `daEdit`, `daSnapshotEdit`) |
| `review({ name, state })` | `{ success }`. `state`: `request`, `reject`, `approve` |
| `addPaths({ name, paths })` / `removePaths({ name, paths })` | `{ success }`. Waits for async bulk jobs. |
| `updatePaths({ name, currPaths, hrefs })` | formatted resources for `hrefs` (adds/removes the difference) |
| `deleteSnapshot({ name, paths })` | `{ success }`. Also removes the DA `.snapshots/{name}` folder. |
| `copyResources({ name, resources, direction, mode })` | copied urls, each with the resource `path` and a `status` (`success` or `error`). Never throws; a failed copy does not stop the others. `direction`: `fork` (main → snapshot, "Sync") or `promote` (snapshot → main). `mode`: `merge` (default) or `overwrite`. |
| `copyPage({ name, path, direction, mode })` | `{ status, error }` for one page; same options as `copyResources` |
| `hasSnapshotSource({ name, path })` | whether the DA snapshot copy of `path` exists (`/x/` checks `/x/index.html`) |
| `updateSchedule({ name, approved, userId })` | `{ status, text }` from the snapshot scheduler |
| `isRegistered()` | whether the site is registered with the scheduler |
| `getPublishPermission({ path })` | whether the user can publish |
| `getLaunchPermission()` | whether `snapshot.launch` is enabled in the org/site DA config (site overrides org) |
