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
- Pages are compared and saved in the form the editor saves (see "Editor form" in [rollout-smart-overwrite.md](rollout-smart-overwrite.md)). Diff markup is grouped per conflict (`data-diff-group`, `data-diff-side`, `data-diff-kind`, `data-diff-reason`); editors must run a `@adobe/da-parser` that keeps it.
- Missing target, or one with an empty `main`: the source is copied over the target. Loc diff tags and deleted content are removed, as are accepted/rejected hashes; the page is rebuilt from the source's main content and DA metadata. The target's own metadata is not kept.
- Identical content: nothing is written. Metadata values are kept as written.
- Otherwise: the diffed result is written to the target. A version is saved only when the page content changed, not for a metadata-only write.
- `mergeCopy` and `overwriteCopy` remove the smart-overwrite sync point (`rolloutbase` and `rolloutorder` in DA metadata) from the page they write, as they can't tell whether the source is the target's rollout parent; the next Smart Overwrite rollout to that page is a merge review. See [rollout-smart-overwrite.md](rollout-smart-overwrite.md).
- Reads, writes, versions, and translation config all go to `daOrigin`. Helix 6 sites are not supported yet.
- Translation config is read from the target site's `.da/translate.json`, falling back to the org's on 404. A 404 or 403 on the org config means no config. No config means no equivalent hostnames. Config is cached per `fetch`, `daOrigin`, and org/site; failed loads are not cached.
- Other config failures stop the merge and report the config path and status.
- If converting a page to the editor form would lose content, nothing is written. The result has `code: 'canonicalize-loss'` and an `error` that tells the author to open both pages in the editor, save them, and copy again.
- Concurrent version saves for the same path are deduplicated.

## Return value

- `{ ok: true, status }` on success, including when content is identical (`status: 200`).
- `{ ok: false, status, error }` on any failure: read, config, missing source, write, or version save.
- Thrown transport errors retain their optional string `code`. Errors without an HTTP status use `status: 500`; this is not an HTTP response from the host.

A version-save failure can follow a successful content write. Don't automatically retry on failure; a retry may overwrite.

## Review hashes

`getDiffHash(serializedContent)` returns the existing 12-character review hash. Input is the serialized content, not a DOM element. `HASH_LENGTH`, `ACCEPTED_KEY`, and `REJECTED_KEY` expose the existing format and metadata keys. Stored hashes are unchanged.

## Internal modules

The merge engine is the `@adobe/da-merge` package ([da-tools](https://github.com/adobe/da-tools/tree/main/da-merge)), bundled with `@adobe/da-parser` and `yjs` in `nx/deps/da-merge` (`npm run build:da-merge`). `nx/public/loc/da-merge.js` creates the one shared engine with the browser DOM and the editor's canonicalizer; `copy.js` loads it only when a copy runs.

The public index exports only `mergeCopy`, `overwriteCopy`, and the hash helpers. `copy.js` (`createCopy`, `createConfigLoader`) is Nexter-internal and may change. `regional-diff.js`, `smart-merge.js`, `hashes.js` and `object_hash.js` only re-export da-merge's functions under their old names, for callers that import them by URL; new code should not use them.

`createCopy({ fetch, daOrigin, loadConfig, saveSource })` creates an isolated engine. `loadConfig({ org, site })` defaults to `createConfigLoader({ fetch, daOrigin })`; `saveSource({ org, site, path, body })` optionally supplies the caller's backend-aware HTML writer.

Its methods accept `(url, title, options)`, where `url` contains `source`, `destination`, optional `sourceContent`, `sourceHtml` (prepared source used instead of reading `source`), and `normalizeImages`. `options` contains optional review labels (`labelLocal`, `labelUpstream`) and `recordBaseline`:

- `mergeCopy` and `overwriteCopy` require `recordBaseline` as a boolean and throw a `TypeError` without it, so a caller can't forget to decide. Rollout callers pass `true`: on sites that opted into smart-overwrite, HTML pages outside snapshots then also store the smart-overwrite baseline. Every other caller passes `false`, which removes the page's baseline. `overwriteCopy` treats an unreadable translation config as not opted in.
- Destinations that aren't pages (e.g. `.json`) are saved exactly as the source, without the engine.

Methods update `url.status` and return the underlying write response or an error/no-op result:

- `mergeCopy`: merge, treating an empty target as missing.
- `overwriteCopy`: replace. Doesn't read the target.
- `rolloutCopy`: merge without a baseline, with the old loc app's 20-second save timeout. An empty target is overwritten. Identical content returns `undefined`; timeout returns `'timeout'`.
- `smartOverwriteCopy`: opt-in rollout that applies only upstream changes since the last rollout and keeps localized blocks; sets `url.skipped`, `url.removedUpstream`, `url.reordered`, and `url.outcome` (`'review'` when the page has review markers after the copy, also when nothing was written; `'unchanged'` when nothing new needs applying, nothing was written except a changed `rolloutorder` row, and the page has no markers; absent otherwise). `url.skipped` counts upstream changes that were not applied, where the page kept its own version. It reads the source before the destination, so the destination is read last before saving. An empty but successful destination read is an error. Snapshot destinations (`/.snapshots/…`) never record a baseline: they keep the one they have, and a new snapshot page gets the live page's. See [rollout-smart-overwrite.md](rollout-smart-overwrite.md).
- `markInSync(url, { dryRun })`: smart-overwrite sites only. Records the upstream page as the destination's baseline without changing content and saves a "Sync point set" version; sets `url.sync` (`marked`, `to-mark` with `url.differences` in a dry run, `in-sync`, `missing`, `unresolved`, `sheet`, `snapshot`).

The loc app configures its engine in `nx/blocks/loc/utils/utils.js`. Snapshot Admin and both Rollout plugins configure their own engines.

## SDK boundary

`fetch` is a caller-owned capability: a fetch-compatible function returning a `Response`. It may authenticate directly or proxy through a host. The core never receives a token, adds an authorization header, discovers IMS, or falls back to ambient fetch. Select the SDK and extract its transport in the consuming app, not here.
