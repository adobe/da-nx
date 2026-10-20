# Rollout merge copy

`nx/public/plugins/rollout/utils.js` exports `mergeCopy`, which merges a source page into a target page the same way Rollout does: changes are diffed against the target and marked for review, preserving prior accept/reject decisions.

```js
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { mergeCopy } from 'https://da.live/nx/public/plugins/rollout/utils.js';

const { actions } = await DA_SDK;
const result = await mergeCopy({
  fetch: actions.daFetch,
  daOrigin: 'https://admin.da.live',
  urlSource: '/org/source-site/en/page.html',
  urlTarget: '/org/target-site/fr/page.html',
  msg: 'MSM Merge',
});
```

## Parameters

| Name | Description |
|---|---|
| `fetch` | `(href, options) => Promise<Response>`. Supplies authentication; nothing else discovers IMS, host, or iframe context. |
| `daOrigin` | DA admin origin, e.g. `https://admin.da.live`. |
| `urlSource` | Source path including org and site. |
| `urlTarget` | Target path including org and site. |
| `msg` | Version label prefix; the saved version is labeled `<msg> - Rolled Out`. |

## Behavior

- Missing or empty target: the source is copied over the target. Loc diff tags and deleted content are removed, as are accepted/rejected hashes; the page is rebuilt from the source's main content and DA metadata.
- Identical content: nothing is written.
- Otherwise: the diffed result is written to the target, then a version is saved.
- Reads, writes, versions, and translation config all go to `daOrigin`. Helix 6 sites are not supported yet.
- Translation config is read from the target site's `.da/translate.json`, falling back to the org's on 404. No config means no equivalent hostnames. Config is cached per `fetch`, `daOrigin`, and org/site; failed loads are not cached.
- Concurrent version saves for the same path are deduplicated.

## Return value

- `{ ok: true, status }` on success, including when content is identical (`status: 200`).
- `{ ok: false, status, error }` on any failure: read, config, missing source, write, or version save.

A version-save failure can follow a successful content write. Don't automatically retry on failure; a retry may overwrite.

## Implementation

- `nx/utils/loc.js`: private copy engine (`createCopy`, `createConfigLoader`) shared by loc and Rollout. Not public API.
- `nx/blocks/loc/regional-diff/regional-diff.js`: diff algorithm. Passing explicit config skips legacy page-context config loading.
