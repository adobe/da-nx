# `nx2/utils/api.js` — DA / AEM Admin API

A unified client for talking to **DA admin** (`admin.da.live`) and the **AEM admin API** in either its legacy form (`admin.hlx.page`, "helix5") or its new form (`api.aem.live`, "helix6"). Every method auto-routes by the per-site **hlx6** upgrade flag — once a site has been upgraded, calls flow to the new origin; otherwise they fall back to the legacy origin.

The module ships its low-level primitive (`daFetch`), an upgrade detector (`isHlx6`), helpers (`fromPath`, `signout`, `hlx6ToDaList`), and **eight namespaced surfaces**: `source`, `versions`, `config`, `org`, `status`, `aem`, `snapshot`, `jobs`. Type definitions live in [`api.d.ts`](./api.d.ts) — VSCode picks them up automatically and surfaces overloads, field-level docs, and inline shapes.

> **Routing model.** Some endpoints are owned by DA itself (`source`, `list`, `config`, `versions`) and DA proxies them to AEM when the site is upgraded. Others are AEM-only (`status`, `preview`, `live`, `snapshots`, `jobs`) and live on either `admin.hlx.page` (legacy) or `api.aem.live` (hlx6). The module hides this distinction; callers always pass `{ org, site, path }` and get a `Response` back.

---

## Imports

```js
import {
  // Low-level
  daFetch, isHlx6, signout, fromPath, hlx6ToDaList,
  // Namespaces
  source, versions, config, org, status, aem, snapshot, jobs,
} from '/nx2/utils/api.js';
```

---

## Argument shapes

Most methods accept the first argument as **either** an object or a path string.

**Object form** — pass parts explicitly:

```js
source.get({ org: 'adobe', site: 'aem-boilerplate', path: '/index.html' });
```

**Path-string form** — pass a `/org/site/file/path` string. The helper splits it for you. Method-specific extras go in a second positional argument:

```js
source.get('/adobe/aem-boilerplate/index.html');
source.put('/adobe/aem-boilerplate/page.html', { body: '<main>…</main>' });
versions.get('/adobe/aem-boilerplate/index.html', { versionId: 'abc' });
```

**Bad input** is logged via `console.error` and passed through; the resulting fetch fails naturally and callers handle the non-`ok` response.

`fromPath('/org/site/path')` is exported if you need the conversion explicitly.

---

## Return values

Every method returns the **`Response` object from `fetch`**, with two augmentations performed by `daFetch`:

- `resp.permissions: string[]` — parsed from the `x-da-child-actions` header (preferred), `x-da-actions` (fallback), or defaulted to `['read', 'write']`.
- For two methods (`config.getAggregated` is the current case) that are hlx6-only, calling them on a non-upgraded site returns `{ error: 'Requires Helix 6 upgrade', status: 501 }` instead of a `Response`.

Treat the return like any `fetch` result: `await resp.json()`, check `resp.ok`, etc.

---

## Authentication

Auth is handled inside `daFetch`:

1. `await loadIms()` — pulls the IMS access token. If none, `handleSignIn()` fires and the call returns `{}`.
2. If the URL's origin is in `ALLOWED_TOKEN` (DA, HLX_ADMIN, AEM_API, plus collab/content/preview/etc.), an `Authorization: Bearer …` header is attached.
3. For `HLX_ADMIN` and `AEM_API` specifically, an additional `x-content-source-authorization` header carries the same token.
4. `401`/`403` responses with `redirect: true` redirect the page to `/not-found`.

Callers don't usually need to think about this — using a namespace method handles it transparently.

---

## hlx6 (upgrade) detection

```js
const upgraded = await isHlx6('adobe', 'aem-boilerplate');
```

`isHlx6(org, site)` returns a `Promise<boolean>`. It memoizes per `(org, site)` in module memory and persists positive results in `localStorage` under the key `hlx6-upgrade`. Detection works by pinging `${HLX_ADMIN}/ping/{org}/{site}` and looking for the `x-api-upgrade-available` header.

Returns `false` immediately when `site` is missing.

Most callers don't call `isHlx6` directly — they let the namespace methods do the routing.

---

## Namespace: `source`

Document CRUD on `source` paths. Bridges DA's `/source` and AEM's `/sites/{site}/source` (hlx6).

| Method | Signature | Notes |
|---|---|---|
| `get` | `({ org, site, path })` or `(fullPath)` | GET |
| `list` | `({ org, site, path? })` or `(fullPath)` | List a folder. Pass `{ org }` (no site) to list at org level — DA-legacy only. |
| `put` | `({ org, site, path, body })` or `(fullPath, { body })` | Upload. PUT for both branches. **DA**: wraps body in `multipart/form-data` field `data`. **hlx6**: sends body raw with `Content-Type` sniffed from path extension. |
| `getMetadata` | `({ org, site, path })` or `(fullPath)` | HEAD — returns headers only (`doc-id`, `last-modified`, etc.) |
| `delete` | `({ org, site, path })` or `(fullPath)` | DELETE |
| `copy` | `({ org, site, path, destination, collision? })` or `(fullPath, { destination, collision? })` | `path` = source, `destination` = target. **hlx6**: PUT to dest URL with `?source=…&collision=…` query. **DA**: POST `/copy/{org}/{site}{path}` with `multipart/form-data` field `destination`. |
| `move` | `({ org, site, path, destination, collision? })` or `(fullPath, { destination, collision? })` | Same shape as `copy` but adds `?move=true` (hlx6) or POSTs to `/move/{org}/{site}{path}` (DA). |
| `createFolder` | `({ org, site, path })` or `(fullPath)` | POST on `${path}/` (trailing slash). |
| `deleteFolder` | `({ org, site, path })` or `(fullPath)` | DELETE on `${path}/`. |

### URL shapes

| Method | hlx6 | legacy DA |
|---|---|---|
| get / list / put / head / delete | `${AEM_API}/{org}/sites/{site}/source{path}` | `${DA_ADMIN}/source/{org}/{site}{path}` |
| list (org-only) | n/a | `${DA_ADMIN}/list/{org}` |
| list (with site, legacy) | n/a | `${DA_ADMIN}/list/{org}/{site}{path}` |
| copy / move | PUT to dest URL with `?source=&collision=&move=` | POST to `${DA_ADMIN}/copy/{org}/{site}{path}` (or `/move`) with `destination` form field |

### Examples

```js
// Read
const resp = await source.get('/adobe/aem-boilerplate/index.html');
const html = await resp.text();

// Write (path string + body extra)
await source.put('/adobe/aem-boilerplate/page.html', { body: '<main>…</main>' });

// List a folder
const list = await source.list('/adobe/aem-boilerplate/folder');
const items = await list.json();

// Copy
await source.copy({
  org: 'adobe',
  site: 'aem-boilerplate',
  path: '/old.html',          // source
  destination: '/new.html',   // dest
  collision: 'overwrite',
});
```

---

## Namespace: `versions`

Document version history. Versions are document-scoped, so all methods take a `path`.

| Method | Signature | Notes |
|---|---|---|
| `list` | `({ org, site, path })` or `(fullPath)` | List versions. **hlx6**: `…/source{path}/.versions`. **DA**: `${DA_ADMIN}/versionlist/{org}/{site}{path}`. |
| `get` | `({ org, site, path, versionId })` or `(fullPath, { versionId })` | Retrieve specific version content. **hlx6**: `versionId` is the ULID returned by `list`. **DA**: `versionId` is the trailing `{versionGuid}/{fileGuid}.{ext}` segment from the list response. |
| `create` | `({ org, site, path, operation?, comment? })` or `(fullPath, { operation?, comment? })` | Create a version snapshot. **hlx6**: POSTs `{ operation, comment }` JSON body. **DA**: POSTs `{ label }` JSON body, with `comment` mapped to `label`. |

### Example

```js
// Snapshot a version with a label
await versions.create({
  org, site, path: '/index.html', comment: 'Pre-launch checkpoint',
});

// List all versions
const list = await versions.list({ org, site, path: '/index.html' });
const versions = await list.json();
```

---

## Namespace: `config`

Org or site-level configuration JSON. The `site` argument is **optional** — omit it for org-level config.

| Method | Signature | Notes |
|---|---|---|
| `get` | `({ org, site? })` | Read |
| `put` | `({ org, site?, body })` | Update. Sent as `multipart/form-data` with field `config`. **NOTE:** This wire shape currently doesn't match what the H5/H6 admin endpoints expect (JSON body) and may need realignment — see [Known issues](#known-issues). |
| `delete` | `({ org, site? })` | DELETE |
| `getAggregated` | `({ org, site })` | hlx6-only. Returns `{ error, status: 501 }` on legacy. Hits `${AEM_API}/{org}/aggregated/{site}/config.json`. |

### URL shapes

| | hlx6 | legacy DA |
|---|---|---|
| org-level | `${AEM_API}/{org}/config.json` | `${DA_ADMIN}/config/{org}/` |
| site-level | `${AEM_API}/{org}/sites/{site}/config.json` | `${DA_ADMIN}/config/{org}/{site}/` |

### Example

```js
// Read site config
const resp = await config.get({ org, site });
const json = await resp.json();

// Read aggregated (resolved) config — hlx6 only
const agg = await config.getAggregated({ org, site });
if (agg.status === 501) {
  // Site not on hlx6; fall back to plain config.get
}
```

---

## Namespace: `org`

Organization-level operations. hlx6-only (no DA-legacy fallback exists at org level).

| Method | Signature | Notes |
|---|---|---|
| `listSites` | `({ org })` | GETs `${AEM_API}/{org}/sites`. Returns 404 on non-migrated orgs. |

---

## Namespace: `status`

Resource status (preview + live combined view). **Single-path only** — H6 has no bulk status endpoint.

| Method | Signature | Notes |
|---|---|---|
| `get` | `({ org, site, path })` or `(fullPath)` | GET `/status/{path}` |

### URL shapes

| hlx6 | legacy |
|---|---|
| `${AEM_API}/{org}/sites/{site}/status{path}` | `${HLX_ADMIN}/status/{org}/{site}/main{path}` |

### Example

```js
const resp = await status.get('/adobe/aem-boilerplate/index.html');
const { preview, live, edit } = await resp.json();
```

---

## Namespace: `aem`

Combined preview + live (publish) operations. The `path` argument can be a **string** (single op) or an **array of length ≥ 2** (bulk op). Single string or one-item array hits the single-path endpoint.

`forceUpdate` and `forceSync` are **bulk-only** — server ignores them on single-path calls.

| Method | Signature | Notes |
|---|---|---|
| `getPreview` | `({ org, site, path })` or `(fullPath)` | GET preview status (single only) |
| `getPublish` | `({ org, site, path })` or `(fullPath)` | GET publish status (single only) |
| `preview` | `({ org, site, path, forceUpdate?, forceSync? })` | string → POST `/preview/{path}`. Array of 2+ → POST `/preview/.../*` with `{ paths, forceUpdate?, forceSync? }`. |
| `unPreview` | `({ org, site, path })` | string → DELETE `/preview/{path}`. Array of 2+ → POST `/preview/.../*` with `{ paths, delete: true }`. |
| `publish` | `({ org, site, path, forceUpdate?, forceSync? })` | string → POST `/live/{path}`. Array of 2+ → POST `/live/.../*` with `{ paths, forceUpdate?, forceSync? }`. |
| `unPublish` | `({ org, site, path })` | string → DELETE `/live/{path}`. Array of 2+ → POST `/live/.../*` with `{ paths, delete: true }`. |

### URL shapes

| | hlx6 | legacy |
|---|---|---|
| preview / unPreview | `${AEM_API}/{org}/sites/{site}/preview{path}` (or `/*`) | `${HLX_ADMIN}/preview/{org}/{site}/main{path}` (or `/*`) |
| publish / unPublish | `${AEM_API}/{org}/sites/{site}/live{path}` (or `/*`) | `${HLX_ADMIN}/live/{org}/{site}/main{path}` (or `/*`) |

### Examples

```js
// Single preview
await aem.preview('/adobe/aem-boilerplate/index.html');

// Bulk publish with extras
await aem.publish({
  org, site,
  path: ['/a.html', '/b.html', '/c.html'],
  forceUpdate: true,
});

// Bulk unpublish — body becomes { paths, delete: true }
await aem.unPublish({ org, site, path: ['/old.html', '/legacy.html'] });
```

---

## Namespace: `snapshot`

Snapshot CRUD plus review/publish actions. Snapshots are AEM-only. New API uses plural `snapshots` in the URL; legacy uses singular `snapshot`.

| Method | Signature | Notes |
|---|---|---|
| `list` | `({ org, site })` | List all snapshots |
| `get` | `({ org, site, snapshotId })` | Retrieve manifest |
| `update` | `({ org, site, snapshotId, body? })` | POST manifest |
| `delete` | `({ org, site, snapshotId })` | DELETE |
| `addPath` | `({ org, site, snapshotId, path })` | string → POST `…/{snapshotId}{path}`. Array of 2+ → POST `…/{snapshotId}/*` with `{ paths }`. |
| `removePath` | `({ org, site, snapshotId, path })` | string → DELETE `…/{snapshotId}{path}`. Array of 2+ → POST `…/{snapshotId}/*` with `{ paths, delete: true }`. |
| `publish` | `({ org, site, snapshotId })` | POST `?publish=true` |
| `review` | `({ org, site, snapshotId, action })` | POST `?review=…`. `action`: `'request'` \| `'approve'` \| `'reject'` |

### Example

```js
// Create + populate + publish a snapshot
await snapshot.update({
  org, site, snapshotId: 'snap-1', body: { title: 'Launch candidate' },
});
await snapshot.addPath({
  org, site, snapshotId: 'snap-1',
  path: ['/index.html', '/about.html', '/contact.html'],
});
await snapshot.publish({ org, site, snapshotId: 'snap-1' });
```

---

## Namespace: `jobs`

Background job control.

| Method | Signature | Notes |
|---|---|---|
| `get` | `({ org, site, topic, name? })` | Omit `name` to list jobs in the topic. |
| `details` | `({ org, site, topic, name })` | GET on `…/details` — progress data |
| `stop` | `({ org, site, topic, name })` | DELETE — stop a running job |

### URL shapes

| | hlx6 | legacy |
|---|---|---|
| Single job | `${AEM_API}/{org}/sites/{site}/jobs/{topic}/{name}` | `${HLX_ADMIN}/job/{org}/{site}/main/{topic}/{name}` (singular `job`) |
| Job list | `${AEM_API}/{org}/sites/{site}/jobs/{topic}` | `${HLX_ADMIN}/job/{org}/{site}/main/{topic}` |

### Example

```js
// Poll a job until complete
let resp = await jobs.details({ org, site, topic: 'preview', name: 'job-123' });
let info = await resp.json();
while (info.state !== 'complete') {
  await new Promise((r) => setTimeout(r, 2000));
  resp = await jobs.details({ org, site, topic: 'preview', name: 'job-123' });
  info = await resp.json();
}
```

---

## Helpers

### `fromPath(str)`

Splits a `/org/site/file/path` string into `{ org, site, path }`. Used internally by every method when the first argument is a string; exported so callers can do their own splitting if convenient.

```js
fromPath('/adobe/aem-boilerplate/index.html');
// → { org: 'adobe', site: 'aem-boilerplate', path: '/index.html' }
```

### `hlx6ToDaList(parentPath, items)`

Normalizes a folder listing returned by hlx6's source bus into the shape DA's `/list` endpoint produces. Folders get their trailing slash stripped, file extensions get extracted into `ext`, `last-modified` becomes a unix timestamp at `lastModified`. Items without a `content-type` (i.e., DA's existing format) pass through unchanged.

Useful when you want to render a folder listing without caring whether the site is hlx6 or legacy.

### `signout()`

Fire-and-forget GET to `${DA_ADMIN}/logout`. Returns nothing.

### `daFetch({ url, opts?, redirect? })`

The low-level fetch primitive. Most callers shouldn't use it directly — namespace methods handle URL construction, body shaping, and routing. Reach for `daFetch` only when you need to hit an endpoint not covered by a namespace.

```js
const resp = await daFetch({
  url: 'https://admin.da.live/some-endpoint',
  opts: { method: 'POST', body: formData },
});
```

---

## Error handling

Every namespace method returns a `Response` (or a Response-shaped object — see hlx6-only methods below). No method throws on HTTP failure; callers should branch on `resp.ok` or `resp.status`.

```js
const resp = await source.get(path);
if (!resp.ok) {
  // 4xx/5xx — handle as appropriate
  return;
}
const json = await resp.json();
```

**Special return shapes:**

- `daFetch` returns `{}` (empty object) when no IMS access token is available.
- `config.getAggregated` returns `{ error: 'Requires Helix 6 upgrade', status: 501 }` when the site isn't hlx6.

These are the **only** non-`Response` return values. All other methods always return a real `Response`.

**`console.error` on bad args:** when an invalid first argument is passed (missing `org`), the module logs a console error but doesn't throw — the bad call still flows through and produces a malformed URL that the server will reject. The console message is the only signal from the client side; rely on the server's response status for handling.

---

## Path conventions

- `path` always uses a leading slash: `/index.html`, `/folder/page.html`.
- Empty path is allowed where the endpoint supports it (e.g., `source.list({ org, site })` lists root).
- Path-string form expects the full `/org/site/file/path` shape. The first two segments after the leading slash are interpreted as org and site; everything after is the path.

---

## Module-internal architecture

These are not exported, but understanding them helps when reading the source.

- **`getDaApiPath(api, org, site, path)`** — URL builder for endpoints DA proxies (`source`, `list`, `config`, `versions`). Branches on `isHlx6` to choose `DA_ADMIN` or `AEM_API`.
- **`getAemApiPath(api, org, site, path)`** — URL builder for AEM-only endpoints (`status`, `preview`, `live`, `snapshots`, `jobs`). Branches on `isHlx6` to choose `HLX_ADMIN` (with hardcoded `ref=main`) or `AEM_API`.
- **`withArgs(fn)`** — HOF that resolves the first arg (object or path string) and forwards a normalized `{ org, site, path, ...extras }` object to `fn`. Handles the bad-arg `console.error` for missing org.
- **`callPath({ api, org, site, path, method, … })`** — Dispatcher used by `aem.*` methods. Handles the string-vs-array branching for bulk preview/publish operations and folds `forceUpdate`/`forceSync` into the bulk JSON body.
- **`jsonOpts(method, payload)`** — small helper that builds `{ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }`.

---

## Constants

Imported from `./utils.js`:

| Constant | Value | Used for |
|---|---|---|
| `DA_ADMIN` | `https://admin.da.live` (env-aware) | DA admin origin |
| `HLX_ADMIN` | `https://admin.hlx.page` | Legacy AEM admin |
| `AEM_API` | `https://api.aem.live` | New AEM admin (hlx6) |
| `ALLOWED_TOKEN` | array of origins | Auth header allowlist |

Defined locally:

| Constant | Value | Used for |
|---|---|---|
| `REF` | `'main'` | Hardcoded ref for legacy AEM URLs |
| `STORAGE_KEY` | `'hlx6-upgrade'` | localStorage key for hlx6 cache |
| `TEXT_TYPES` | `{ '.html': 'text/html', '.json': 'application/json' }` | Content-Type sniffing for `source.put` on hlx6 |

---

## Known issues

These are tracked but not yet resolved. They don't block typical usage; flagged here for completeness.

- **`config.put` wire shape**: currently sends `multipart/form-data` with field `config`. The H5/H6 admin endpoints actually expect raw JSON body. DA's exact requirement is undocumented; existing da-live tests assert PUT instead of POST. Needs verification against running servers.
- **`forceSync` field name**: the H6 server source reads `forceAsync` (with inverse meaning), not `forceSync`. Currently sending `forceSync: true` is silently ignored by the server. This affects the `aem.preview`/`aem.publish` bulk paths and `start/index.js` in da-live.

---

## Testing

Tests live in [`test/nx2/utils/api.test.js`](../../test/nx2/utils/api.test.js). Pattern: stub `window.fetch` with a recording fake, call the method, assert URL/method/body/headers.

```js
window.fetch = async (url, opts = {}) => {
  // record [url, opts]
  return new Response('{}', { status: 200 });
};

await source.get({ org: 'foo', site: 'bar', path: '/x.html' });
expect(lastCall().url).to.equal('https://admin.da.live/source/foo/bar/x.html');
```

The IMS dependency is mocked via the importmap in `web-test-runner.config.mjs` (`/nx2/utils/ims.js` → `/nx2/test/mocks/ims.js`).
