# `nx2/utils/api.js` — DA / AEM Admin API

A unified client for talking to **DA admin** (`admin.da.live`) and the **AEM admin API** in either its legacy form (`admin.hlx.page`, "helix5") or its new form (`api.aem.live`, "helix6"). Every method auto-routes by the per-site **hlx6** upgrade flag — once a site has been upgraded, calls flow to the new origin; otherwise they fall back to the legacy origin.

The module ships its low-level primitive (`daFetch`), an upgrade detector (`isHlx6`), helpers (`fromPath`, `signout`, `asJson`, `asText`), and **eight namespaced surfaces**: `source`, `versions`, `config`, `org`, `status`, `aem`, `snapshot`, `jobs`. Type definitions live in `[api.d.ts](./api.d.ts)` — VSCode picks them up automatically and surfaces overloads, field-level docs, and inline shapes.

> **Routing model.** Some endpoints are owned by DA itself (`source`, `list`, `config`, `versions`) and DA proxies them to AEM when the site is upgraded. Others are AEM-only (`status`, `preview`, `live`, `snapshots`, `jobs`) and live on either `admin.hlx.page` (legacy) or `api.aem.live` (hlx6). The module hides this distinction; callers always pass `{ org, site, path }` and get a `Response` back.

---

## Imports

```js
import {
  // Low-level
  daFetch, isHlx6, signout, fromPath,
  // Namespaces
  source, versions, config, org, status, aem, snapshot, jobs,
  // Response helpers
  asJson, asText,
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
source.save('/adobe/aem-boilerplate/page.html', { body: '<main>…</main>' });
versions.get('/adobe/aem-boilerplate/index.html', { versionId: 'abc' });
```

**Bad input** is logged via `console.error` and passed through; the resulting fetch fails naturally and callers handle the non-`ok` response.

`fromPath('/org/site/path')` is exported if you need the conversion explicitly.

---

## Return values

**Every namespace method returns a raw `Response`** — augmented by `daFetch` with `resp.permissions: string[]` (parsed from `x-da-child-actions` / `x-da-actions`, defaulted to `['read', 'write']`). Treat like any `fetch` result: `await resp.json()`, check `resp.ok`, read `resp.headers`, etc.

**Two exceptions:**
- **`source.list`** → `{ ok, items, continuationToken, permissions }`. Merges body (normalized items) + headers (continuation token) + permissions into one object — the only namespace method whose return shape isn't a `Response`. Pass `continuationToken` back into the same call to fetch the next page.
- **`config.getAggregated`** on a non-hlx6 site → `{ error: 'Requires Helix 6 upgrade', status: 501 }` sentinel. On hlx6 sites it returns a normal `Response` like everything else.

### Opt-in response helpers

Most call sites do `await resp.json()` (or check `resp.ok`) right after the call. Three small helpers cover the common patterns:

```js
import { asJson, asText, source, config } from '/nx2/utils/api.js';

// Success: { ok: true, data: <parsed>, status: 200, error: null }
// Failure: { ok: false, data: <error body if parseable, else null>, status, error }
const { ok, data: cfg, status, error } = await asJson(config.get({ org, site }));
if (!ok) {
  console.warn(`config.get failed (${status}, ${error})`, cfg);
  return;
}
useConfig(cfg);

const { data: html } = await asText(source.get(path));
```

Both resolve a method's returned promise, await `.json()` / `.text()`, and return a flat result with `ok`, `data`, `status`, and `error`. `data` is populated even on non-ok responses when the body parses (matches axios) — so error JSON bodies aren't lost.

For a plain boolean ok-check, destructure the method's return directly without a helper: `const { ok } = await source.delete(path);`

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


| Method         | Signature                                                                                     | Notes                                                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get`          | `({ org, site, path })` or `(fullPath)`                                                       | GET — raw `Response`.                                                                                                                                                                          |
| `list`         | `({ org, site, path?, continuationToken? })` or `(fullPath, { continuationToken? })`            | List a folder. Returns `{ ok, items, continuationToken, permissions }` (normalized — items match legacy DA shape regardless of server). Pass `{ org }` (no site) to list at org level — DA-legacy only. Bulk lists paginate — pass `continuationToken` back into the next call. |
| `save`         | `({ org, site, path, body })` or `(fullPath, { body })`                                       | Upload — raw `Response`. POST for both branches. **DA-legacy**: wraps `body` as a Blob in `multipart/form-data` field `data`, with the Blob's type set from the path extension via `TYPE_MAP`. **hlx6**: sends `body` raw (string, Blob, or File); `Content-Type` is set from the path extension via `TYPE_MAP` and overrides any auto-applied Blob type. Extensions not in `TYPE_MAP` send no `Content-Type`. |
| `getMetadata`  | `({ org, site, path })` or `(fullPath)`                                                       | HEAD — raw `Response`. Value is in `resp.headers` (`doc-id`, `last-modified`, etc.).                                                                                                          |
| `delete`       | `({ org, site, path })` or `(fullPath)`                                                       | DELETE — raw `Response` (typically 204). For recursive folder deletion use `deleteFolder`.                                                                                                    |
| `copy`         | `({ org, site, path, destination, collision? })` or `(fullPath, { destination, collision? })` | Raw `Response`. `path` = source, `destination` = target. **hlx6**: PUT to dest URL with `?source=…&collision=…` query. **DA**: POST `/copy/{org}/{site}{path}` with `multipart/form-data` field `destination`. |
| `move`         | `({ org, site, path, destination, collision? })` or `(fullPath, { destination, collision? })` | Same shape as `copy`. Raw `Response`. Adds `?move=true` (hlx6) or POSTs to `/move/{org}/{site}{path}` (DA).                                                                                  |
| `createFolder` | `({ org, site, path })` or `(fullPath)`                                                       | POST on `${path}/` (trailing slash).                                                                                                                                                           |
| `deleteFolder` | `({ org, site, path })` or `(fullPath)`                                                       | DELETE on `${path}/`.                                                                                                                                                                          |


### URL shapes


| Method                                       | hlx6                                             | legacy DA                                                                                |
| -------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| get / list / save / getMetadata / delete     | `${AEM_API}/{org}/sites/{site}/source{path}`     | `${DA_ADMIN}/source/{org}/{site}{path}`                                                  |
| list (org-only)                  | n/a                                              | `${DA_ADMIN}/list/{org}`                                                                 |
| list (with site, legacy)         | n/a                                              | `${DA_ADMIN}/list/{org}/{site}{path}`                                                    |
| copy / move                      | PUT to dest URL with `?source=&collision=&move=` | POST to `${DA_ADMIN}/copy/{org}/{site}{path}` (or `/move`) with `destination` form field |


### Examples

```js
// Read
const resp = await source.get('/adobe/aem-boilerplate/index.html');
const html = await resp.text();

// Write (path string + body extra)
await source.save('/adobe/aem-boilerplate/page.html', { body: '<main>…</main>' });

// Upload a binary file (e.g., from <input type=file>)
await source.save('/adobe/aem-boilerplate/img/logo.png', { body: file });

// List a folder — returns { ok, items, continuationToken, permissions }
const { ok, items } = await source.list('/adobe/aem-boilerplate/folder');

// Delete a document — returns raw Response (204 on success)
const delResp = await source.delete('/adobe/aem-boilerplate/old.html');
if (!delResp.ok) { /* handle */ }

// Or destructure for a boolean
const { ok: deleted } = await source.delete('/adobe/aem-boilerplate/old.html');

// Copy — returns raw Response
const copyResp = await source.copy({
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


| Method   | Signature                                                                               | Notes                                                                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list`   | `({ org, site, path })` or `(fullPath)`                                                 | List versions. **hlx6**: `…/source{path}/.versions`. **DA**: `${DA_ADMIN}/versionlist/{org}/{site}{path}`.                                                                                    |
| `get`    | `({ org, site, path, versionId })` or `(fullPath, { versionId })`                       | Retrieve specific version content. **hlx6**: `versionId` is the ULID returned by `list`. **DA**: `versionId` is the trailing `{versionGuid}/{fileGuid}.{ext}` segment from the list response. |
| `create` | `({ org, site, path, operation?, comment? })` or `(fullPath, { operation?, comment? })` | Create a version snapshot. **hlx6**: POSTs `{ operation, comment }` JSON body. **DA**: POSTs `{ label }` JSON body, with `comment` mapped to `label`.                                         |


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


| Method          | Signature                | Notes                                                                                                                                                                                                                        |
| --------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get`           | `({ org, site? })`       | Read                                                                                                                                                                                                                         |
| `save`          | `({ org, site?, body })` | Update. Sent as `multipart/form-data` with field `config`. **NOTE:** This wire shape currently doesn't match what the H5/H6 admin endpoints expect (JSON body) and may need realignment — see [Known issues](#known-issues). |
| `delete`        | `({ org, site? })`       | DELETE                                                                                                                                                                                                                       |
| `getAggregated` | `({ org, site })`        | hlx6-only. Returns `{ error, status: 501 }` on legacy. Hits `${AEM_API}/{org}/aggregated/{site}/config.json`.                                                                                                                |


### URL shapes


|            | hlx6                                        | legacy DA                          |
| ---------- | ------------------------------------------- | ---------------------------------- |
| org-level  | `${AEM_API}/{org}/config.json`              | `${DA_ADMIN}/config/{org}/`        |
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


| Method      | Signature   | Notes                                                            |
| ----------- | ----------- | ---------------------------------------------------------------- |
| `listSites` | `({ org })` | GETs `${AEM_API}/{org}/sites`. Returns 404 on non-migrated orgs. |


---

## Namespace: `status`

Resource status (preview + live combined view). **Single-path only** — H6 has no bulk status endpoint.


| Method | Signature                               | Notes                                                |
| ------ | --------------------------------------- | ---------------------------------------------------- |
| `get`  | `({ org, site, path })` or `(fullPath)` | GET `/status/{path}`. Returns raw `Response`.        |


### URL shapes


| hlx6                                         | legacy                                        |
| -------------------------------------------- | --------------------------------------------- |
| `${AEM_API}/{org}/sites/{site}/status{path}` | `${HLX_ADMIN}/status/{org}/{site}/main{path}` |


### Example

```js
import { asJson, status } from '/nx2/utils/api.js';

const { ok, data: info } = await asJson(status.get('/adobe/aem-boilerplate/index.html'));
if (!ok) return;
const { preview, live, edit } = info;
```

---

## Namespace: `aem`

Combined preview + live (publish) operations. The `path` argument can be a **string** (single op) or an **array of length ≥ 2** (bulk op). Single string or one-item array hits the single-path endpoint.

`forceUpdate` and `forceSync` are **bulk-only** — server ignores them on single-path calls.

**Returns:** all methods return a raw `Response`. Parse with `await resp.json()` or the `asJson` helper.


| Method       | Signature                                                | Notes                                                                                                            |
| ------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `getPreview` | `({ org, site, path })` or `(fullPath)`                  | GET preview status (single only).                                                                                |
| `getPublish` | `({ org, site, path })` or `(fullPath)`                  | GET publish status (single only).                                                                                |
| `preview`    | `({ org, site, path, forceUpdate?, forceSync? })`        | string → POST `/preview/{path}`. Array of 2+ → POST `/preview/.../*` with `{ paths, forceUpdate?, forceSync? }`. |
| `unPreview`  | `({ org, site, path })`                                  | string → DELETE `/preview/{path}`. Array of 2+ → POST `/preview/.../*` with `{ paths, delete: true }`.           |
| `publish`    | `({ org, site, path, forceUpdate?, forceSync? })`        | string → POST `/live/{path}`. Array of 2+ → POST `/live/.../*` with `{ paths, forceUpdate?, forceSync? }`.       |
| `unPublish`  | `({ org, site, path })`                                  | string → DELETE `/live/{path}`. Array of 2+ → POST `/live/.../*` with `{ paths, delete: true }`.                 |


### URL shapes


|                     | hlx6                                                    | legacy                                                   |
| ------------------- | ------------------------------------------------------- | -------------------------------------------------------- |
| preview / unPreview | `${AEM_API}/{org}/sites/{site}/preview{path}` (or `/*`) | `${HLX_ADMIN}/preview/{org}/{site}/main{path}` (or `/*`) |
| publish / unPublish | `${AEM_API}/{org}/sites/{site}/live{path}` (or `/*`)    | `${HLX_ADMIN}/live/{org}/{site}/main{path}` (or `/*`)    |


### Examples

```js
import { asJson, aem } from '/nx2/utils/api.js';

// Single preview — returns raw Response; use asJson to parse
const { data: previewJob } = await asJson(aem.preview('/adobe/aem-boilerplate/index.html'));

// Or work with the Response directly when you need headers/permissions
const resp = await aem.preview('/adobe/aem-boilerplate/index.html');
if (resp.ok) { /* … */ }

// GET preview status
const { data: status } = await asJson(aem.getPreview({ org, site, path: '/index.html' }));

// Bulk publish with extras
const bulkResp = await aem.publish({
  org, site,
  path: ['/a.html', '/b.html', '/c.html'],
  forceUpdate: true,
});
const bulkJson = await bulkResp.json();

// Bulk unpublish — body becomes { paths, delete: true }
await aem.unPublish({ org, site, path: ['/old.html', '/legacy.html'] });
```

---

## Namespace: `snapshot`

Snapshot CRUD plus review/publish actions. Snapshots are AEM-only. New API uses plural `snapshots` in the URL; legacy uses singular `snapshot`.


| Method       | Signature                             | Notes                                                                                                         |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `list`       | `({ org, site })`                     | List all snapshots                                                                                            |
| `get`        | `({ org, site, snapshotId })`         | Retrieve manifest                                                                                             |
| `save`       | `({ org, site, snapshotId, body? })`  | POST manifest (create-or-update; aligns with AEM's `createSnapshot` operation).                               |
| `delete`     | `({ org, site, snapshotId })`         | DELETE                                                                                                        |
| `addPath`    | `({ org, site, snapshotId, path })`   | `path` is auto-normalized to a leading slash. String → POST `…/{snapshotId}{path}`. Array of 2+ → POST `…/{snapshotId}/*` with `{ paths }`. |
| `removePath` | `({ org, site, snapshotId, path })`   | `path` is auto-normalized to a leading slash. String → DELETE `…/{snapshotId}{path}`. Array of 2+ → POST `…/{snapshotId}/*` with `{ paths, delete: true }`. |
| `publish`    | `({ org, site, snapshotId })`         | POST `?publish=true`                                                                                          |
| `review`     | `({ org, site, snapshotId, action })` | POST `?review=…`. `action`: `'request'` | `'approve'` | `'reject'`                                            |


### Example

```js
// Create + populate + publish a snapshot
await snapshot.save({
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


| Method    | Signature                       | Notes                                  |
| --------- | ------------------------------- | -------------------------------------- |
| `get`     | `({ org, site, topic, name? })` | Omit `name` to list jobs in the topic. |
| `details` | `({ org, site, topic, name })`  | GET on `…/details` — progress data     |
| `stop`    | `({ org, site, topic, name })`  | DELETE — stop a running job            |


### URL shapes


|            | hlx6                                                | legacy                                                               |
| ---------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| Single job | `${AEM_API}/{org}/sites/{site}/jobs/{topic}/{name}` | `${HLX_ADMIN}/job/{org}/{site}/main/{topic}/{name}` (singular `job`) |
| Job list   | `${AEM_API}/{org}/sites/{site}/jobs/{topic}`        | `${HLX_ADMIN}/job/{org}/{site}/main/{topic}`                         |


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

### `asJson(promise)` / `asText(promise)`

Opt-in unwrappers. Each awaits a namespace method's returned promise, attempts to parse the body, and returns a flat result:

```ts
{ ok: boolean, data: T | null, status: number, error: null | 'no-response' | 'not-ok' | 'parse-failed' }
```

- On success (`resp.ok`): `{ ok: true, data: <parsed>, status, error: null }`.
- On failure: `{ ok: false, data: <error body if parseable, else null>, status, error: <reason> }`. The body is still parsed when possible, so error JSON (e.g., `{ error: 'bad request' }`) surfaces in `data`.

```js
const { ok, data: cfg, status, error } = await asJson(config.get({ org, site }));
if (!ok) { console.warn(`failed (${status}, ${error})`, cfg); return; }
useConfig(cfg);

const { data: html } = await asText(source.get(path));
```

For a boolean ok-check on a `Response`-returning method, destructure directly without a helper: `const { ok } = await source.delete(path);`

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

No method throws on HTTP failure. Branch on `resp.ok` (or `resp.status`):

```js
const resp = await source.get(path);
if (!resp.ok) return;            // 4xx/5xx
const html = await resp.text();
```

Or use the opt-in helpers to collapse the parse + ok-check into one line:

```js
const { ok: htmlOk, data: html, status } = await asText(source.get(path));
if (!htmlOk) return;             // inspect `status` / `error` if needed

const { ok: cfgOk, data: cfg } = await asJson(config.get({ org, site }));
if (!cfgOk) return;

const { ok: deleted } = await source.delete(path);  // boolean
```

`source.list` is the one method that doesn't return a `Response` — branch on the wrapper's `ok`:

```js
const { ok, items } = await source.list(path);
if (!ok) return;
```

**Special return shapes:**

- `daFetch` returns `{}` (empty object) when no IMS access token is available.
- `config.getAggregated` returns `{ error: 'Requires Helix 6 upgrade', status: 501 }` when the site isn't hlx6.

**`console.error` on bad args:** when an invalid first argument is passed (missing `org`), the module logs a console error but doesn't throw — the bad call still flows through and produces a malformed URL that the server will reject. The console message is the only signal from the client side; rely on the server's response status for handling.

---

## Path conventions

- `path` always uses a leading slash: `/index.html`, `/folder/page.html`.
- Empty path is allowed where the endpoint supports it (e.g., `source.list({ org, site })` lists root).
- Path-string form expects the full `/org/site/file/path` shape. The first two segments after the leading slash are interpreted as org and site; everything after is the path.

---

## Module-internal architecture

These are not exported, but understanding them helps when reading the source.

- `**getDaApiPath(api, org, site, path)`** — URL builder for endpoints DA proxies (`source`, `list`, `config`, `versions`). Branches on `isHlx6` to choose `DA_ADMIN` or `AEM_API`.
- `**getAemApiPath(api, org, site, path)**` — URL builder for AEM-only endpoints (`status`, `preview`, `live`, `snapshots`, `jobs`). Branches on `isHlx6` to choose `HLX_ADMIN` (with hardcoded `ref=main`) or `AEM_API`.
- `**withArgs(fn)**` — HOF that resolves the first arg (object or path string) and forwards a normalized `{ org, site, path, ...extras }` object to `fn`. Handles the bad-arg `console.error` for missing org. Also prepends a leading slash to `path` if missing.
- `**normalizePath(path)**` — Standalone leading-slash normalizer. Accepts a string or string-array (and passes non-strings through). Used by `snapshot.addPath` / `snapshot.removePath`, which don't go through `withArgs`.
- `**callPath({ api, org, site, path, method, … })**` — Dispatcher used by `aem.*` methods. Handles the string-vs-array branching for bulk preview/publish operations and folds `forceUpdate`/`forceSync` into the bulk JSON body. Returns a `Response`.
- `**jsonOpts(method, payload)**` — small helper that builds `{ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }`.

---

## Constants

Imported from `./utils.js`:


| Constant        | Value                               | Used for              |
| --------------- | ----------------------------------- | --------------------- |
| `DA_ADMIN`      | `https://admin.da.live` (env-aware) | DA admin origin       |
| `HLX_ADMIN`     | `https://admin.hlx.page`            | Legacy AEM admin      |
| `AEM_API`       | `https://api.aem.live`              | New AEM admin (hlx6)  |
| `ALLOWED_TOKEN` | array of origins                    | Auth header allowlist |


Defined locally:


| Constant      | Value                                              | Used for                                        |
| ------------- | -------------------------------------------------- | ----------------------------------------------- |
| `REF`         | `'main'`                                           | Hardcoded ref for legacy AEM URLs               |
| `STORAGE_KEY` | `'hlx6-upgrade'`                                   | localStorage key for hlx6 cache                 |
| `TYPE_MAP`    | extension → MIME map (see below)                   | Content-Type sniffing for `source.save` on hlx6 |

`TYPE_MAP` entries: `.html` → `text/html`, `.json` → `application/json`, `.link` → `application/json`, `.svg` → `image/svg+xml`, `.ico` → `image/x-icon`, `.jpg`/`.jpeg` → `image/jpeg`, `.png` → `image/png`, `.gif` → `image/gif`, `.mp4` → `video/mp4`, `.pdf` → `application/pdf`.


---

## Known issues

These are tracked but not yet resolved. They don't block typical usage; flagged here for completeness.

- `**config.save` wire shape**: currently sends `multipart/form-data` with field `config`. The H5/H6 admin endpoints actually expect raw JSON body. DA's exact requirement is undocumented; existing da-live tests assert PUT instead of POST. Needs verification against running servers.
- `**forceSync` field name**: the H6 server source reads `forceAsync` (with inverse meaning), not `forceSync`. Currently sending `forceSync: true` is silently ignored by the server. This affects the `aem.preview`/`aem.publish` bulk paths and `start/index.js` in da-live.

---

## Testing

Tests live in `[test/nx2/utils/api.test.js](../../test/nx2/utils/api.test.js)`. Pattern: stub `window.fetch` with a recording fake, call the method, assert URL/method/body/headers.

```js
window.fetch = async (url, opts = {}) => {
  // record [url, opts]
  return new Response('{}', { status: 200 });
};

await source.get({ org: 'foo', site: 'bar', path: '/x.html' });
expect(lastCall().url).to.equal('https://admin.da.live/source/foo/bar/x.html');
```

The IMS dependency is mocked via the importmap in `web-test-runner.config.mjs` (`/nx2/utils/ims.js` → `/nx2/test/mocks/ims.js`).