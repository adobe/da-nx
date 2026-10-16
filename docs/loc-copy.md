# MSM merge boundary

The only new public entrypoint is `nx/public/plugins/rollout/utils.js`. It exports
`mergeCopy({ fetch, daOrigin, urlSource, urlTarget, msg })`.
No public upload, configuration, metadata, hash, or general DA API.

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

`fetch(href, options)` supplies authentication and returns a `Response`.
Paths include org/site. Translation config comes from the destination site,
then its org on 404; no config means no equivalent hostnames. The private
loader caches per fetch callback, DA origin, and org/site and reports other failures. Nothing discovers
IMS, the host, or iframe location.

Merge returns a `Response`, `{ ok: true }` for identical content, or
`{ ok: false, status, error }` for operation failures. Missing/empty
destinations allow overwrite; auth/config failures do not. In-flight version
saves are deduplicated and awaited. A failed version save can follow a
successful content write; don't automatically retry an overwrite.

## Private implementation and migration

`nx/utils/loc.js` shares copy operations with internal loc and Rollout.
Diffing stays in `nx/blocks/loc/regional-diff/regional-diff.js`, beside the
unchanged hash bundle. It retains its positional signature; explicit config
skips legacy page-context/config loading.
Loc supplies its existing backend-aware `source.save`; `nx2/utils/api.js`
and its DA/HLX6 routing are unchanged.

NX2 migration touchpoints: loc's project adapter, the nx2 Rollout
plugin, and the private engine's pure `nx2/utils/getElementMetadata.js`
dependency. That helper has no IMS/runtime dependency. External apps import
only the stable public entrypoint.

Deploy this entrypoint before merging AEM Apps' migration/shim removal.
AEM Apps remains DA-only. SDK auth-failure behavior is unchanged; broader
SDK/HLX6 support is separate work.
