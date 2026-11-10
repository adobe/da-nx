# Public localization core

Import the core live from https://da.live/nx/public/loc/index.js. It exposes `mergeCopy`, `overwriteCopy`, and review hash helpers; it does not import the SDK, IMS, connectors, or loc app.

Extensions pass the SDK's `daFetch` as transport:

```js
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { mergeCopy } from 'https://da.live/nx/public/loc/index.js';

const { actions } = await DA_SDK;
const result = await mergeCopy({
  fetch: actions.daFetch,
  daOrigin: 'https://admin.da.live',
  urlSource: '/org/source-site/en/page.html',
  urlTarget: '/org/target-site/fr/page.html',
  msg: 'MSM Merge',
});
```

The SDK does not wrap these helpers; it is reserved for host actions the DA REST API can't do.

## Parameters

`mergeCopy` and `overwriteCopy` accept:

| Name | Description |
|---|---|
| `fetch` | `(href, options) => Promise<Response>`. Supplies authentication; nothing else discovers IMS, host, or iframe context. |
| `daOrigin` | DA admin origin, e.g. `https://admin.da.live`. |
| `urlSource` | Source path including org and site. |
| `urlTarget` | Target path including org and site. |
| `msg` | Version label prefix; the saved version is labeled `<msg> - Rolled Out`. |
| `sourceContent` | Optional content supplied by the caller instead of reading `urlSource`. |
| `normalizeImages` | Optional synchronous merge hook receiving normalized source and target documents. |
| `labelLocal`, `labelUpstream` | Optional merge review labels stored in DA metadata. |

## Behavior

- `mergeCopy(options)` diffs changes against the target and marks them for review, preserving prior accept/reject decisions.
- `overwriteCopy(options)` replaces the target without loading merge configuration.
- Missing or empty target: the source is copied over the target. Loc diff tags and deleted content are removed, as are accepted/rejected hashes; the page is rebuilt from the source's main content and DA metadata.
- Identical content: nothing is written.
- Otherwise: the diffed result is written to the target, then a version is saved.
- Reads, writes, versions, and translation config all go to `daOrigin`. Helix 6 sites are not supported yet.
- Translation config is read from the target site's `.da/translate.json`, falling back to the org's on 404. A 404 or 403 on the org config means no config. No config means no equivalent hostnames. Config is cached per `fetch`, `daOrigin`, and org/site; failed loads are not cached.
- Other config failures stop the merge and report the config path and status.
- Concurrent version saves for the same path are deduplicated.

## Return value

- `{ ok: true, status }` on success, including when content is identical (`status: 200`).
- `{ ok: false, status, error }` on any failure: read, config, missing source, write, or version save.
- Thrown transport errors retain their optional string `code`. Errors without an HTTP status use `status: 500`; this is not an HTTP response from the host.

A version-save failure can follow a successful content write. Don't automatically retry on failure; a retry may overwrite.

## Review hashes

`getDiffHash(serializedContent)` returns the existing 12-character review hash. Input is the serialized content, not a DOM element. `HASH_LENGTH`, `ACCEPTED_KEY`, and `REJECTED_KEY` expose the existing format and metadata keys. Stored hashes are unchanged.

## Internal modules

The public index exports only `mergeCopy`, `overwriteCopy`, and the hash helpers. `copy.js` (`createCopy`, `createConfigLoader`), `regional-diff.js` (`regionalDiff`, `normalizeLinks`, `removeLocTags`, `getBlockHashes`, `smartMerge`), `smart-overwrite.js` and `smart-merge.js` are Nexter-internal and may change.

`createCopy({ fetch, daOrigin, loadConfig, saveSource })` creates an isolated engine. `loadConfig({ org, site })` defaults to `createConfigLoader({ fetch, daOrigin })`; `saveSource({ org, site, path, body })` optionally supplies the caller's backend-aware HTML writer.

Its methods accept `(url, title, options)`, where `url` contains `source`, `destination`, optional `sourceContent`, `sourceHtml` (prepared source used instead of reading `source`), and `normalizeImages`. `options` contains optional review labels and `recordBaseline` (rollout callers only: on sites that opted into smart-overwrite, `mergeCopy`/`overwriteCopy` also store the smart-overwrite baseline for HTML pages; off by default, so other callers and sites are unchanged). Methods update `url.status` and return the underlying write response or an error/no-op result:

- `mergeCopy`: merge, treating an empty target as missing.
- `overwriteCopy`: replace.
- `rolloutCopy`: merge, preserving empty-target metadata and the old loc app's 20-second save timeout. Identical content returns `undefined`; timeout returns `'timeout'`.
- `smartOverwriteCopy`: opt-in rollout that applies only upstream changes since the last rollout and keeps localized blocks; sets `url.skipped`. Without a baseline it is a regular merge review; when nothing changed upstream since the baseline it writes nothing. See [rollout-smart-overwrite.md](rollout-smart-overwrite.md).
- `markInSync(url, { dryRun })`: smart-overwrite sites only. Records the upstream page as the destination's baseline without changing content and saves a "Sync point set" version; sets `url.sync` (`marked`, `to-mark` with `url.differences` in a dry run, `in-sync`, `missing`, `unresolved`, `sheet`, `snapshot`).

The loc app configures its engine in `nx/blocks/loc/utils/utils.js`. Snapshot Admin and both Rollout plugins configure their own engines. No compatibility exports remain at the old project, diff, or private engine paths.

## SDK boundary

`fetch` is a caller-owned capability: a fetch-compatible function returning a `Response`. It may authenticate directly or proxy through a host. The core never receives a token, adds an authorization header, discovers IMS, or falls back to ambient fetch. Select the SDK and extract its transport in the consuming app, not here.
