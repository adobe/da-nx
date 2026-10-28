# Public localization core

Import the core live from https://da.live/nx/public/loc/index.js. It owns copy, diff, loc tags, and review hashes; it does not import the SDK, IMS, connectors, or loc app.

Extensions can use SDK1's lazy `actions.loc` wrappers instead:

```js
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const { actions } = await DA_SDK;
const result = await actions.loc.mergeCopy({
  urlSource: '/org/source-site/en/page.html',
  urlTarget: '/org/target-site/fr/page.html',
  msg: 'MSM Merge',
});
```

`actions.loc.mergeCopy` and `actions.loc.overwriteCopy` bind SDK fetch and the configured DA origin. They accept only `urlSource`, `urlTarget`, `msg`, `sourceContent`, `labelLocal`, and `labelUpstream`. Transport overrides and function hooks are not forwarded. The core loads on first use, not during SDK initialization.

These wrappers do not change SDK1's token exposure or add host-side permission enforcement. They leave room for a future tokenless SDK to preserve the operation interface.

## Direct core parameters

The direct `mergeCopy` and `overwriteCopy` exports accept the same operation arguments plus explicit transport and the optional merge hook:

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
- Translation config is read from the target site's `.da/translate.json`, falling back to the org's on 404. No config means no equivalent hostnames. Config is cached per `fetch`, `daOrigin`, and org/site; failed loads are not cached.
- Non-404 config failures stop the merge and report the config path and status. Without site config, the user needs read access to `/<org>/.da/translate.json`; site-only permissions may not include it.
- Concurrent version saves for the same path are deduplicated.

## Return value

- `{ ok: true, status }` on success, including when content is identical (`status: 200`).
- `{ ok: false, status, error }` on any failure: read, config, missing source, write, or version save.
- Thrown transport errors retain their optional string `code`. Errors without an HTTP status use `status: 500`; this is not an HTTP response from the host.

A version-save failure can follow a successful content write. Don't automatically retry on failure; a retry may overwrite.

## Diff, tags, and hashes

- `regionalDiff(original, modified, acceptedHashes, rejectedHashes, { site, config, normalizeImages })` returns the annotated `<main>` element. Documents are mutated. Config is optional; without it, no equivalent-site mappings apply. No page-context discovery or network calls.
- `normalizeLinks(doc, site, equivalentSites)` mutates links to canonical `.aem.live` URLs and maps equivalent sites.
- `removeLocTags(doc)` removes upstream deletions and unwraps local additions, including legacy loc tags.
- `getDiffHash(serializedContent)` returns the existing 12-character review hash. Input is the serialized content, not a DOM element. `HASH_LENGTH`, `ACCEPTED_KEY`, and `REJECTED_KEY` expose the existing format and metadata keys. Stored hashes are unchanged.
- `regionalDiff` hashes each block in the markup the editor saves: no heading ids, cell content in paragraphs, and the editor's picture markup. Content written through the API therefore gets the same hash as the editor's copy of it, and the hashes the editor stores for review decisions match. Merges read the review hashes from rows of any key casing and save them back as `acceptedHashes` and `rejectedHashes`, the keys the editor reads.

## Configured copy engine

`createCopy({ fetch, daOrigin, loadConfig, saveSource })` creates an isolated engine. `loadConfig({ org, site })` defaults to `createConfigLoader({ fetch, daOrigin })`; `saveSource({ org, site, path, body })` optionally supplies the caller's backend-aware HTML writer.

Its methods accept `(url, title, options)`, where `url` contains `source`, `destination`, optional `sourceContent` and `normalizeImages`. `options` contains optional review labels. Methods update `url.status` and return the underlying write response or an error/no-op result:

- `mergeCopy`: merge, treating an empty target as missing.
- `overwriteCopy`: replace.
- `rolloutCopy`: merge, preserving empty-target metadata and the old loc app's 20-second save timeout. Identical content returns `undefined`; timeout returns `'timeout'`.

The loc app configures its engine in `nx/blocks/loc/utils/utils.js`. Snapshot Admin and both Rollout plugins configure their own engines. No compatibility exports remain at the old project, diff, or private engine paths.

## SDK boundary

`fetch` is a caller-owned capability: a fetch-compatible function returning a `Response`. It may authenticate directly or proxy through a host. The core never receives a token, adds an authorization header, discovers IMS, or falls back to ambient fetch. Select the SDK and extract its transport in the consuming app, not here.
