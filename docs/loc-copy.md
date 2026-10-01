# MSM merge boundary

The only new public entrypoint is `nx/public/utils/loc.js`. It exports
`createMergeCopy({ fetch, daOrigin })`, returning a reusable merge function.
No public upload, configuration, metadata, hash, or general DA API.

```js
import DA_SDK from 'https://da.live/nx/utils/sdk.js';
import { createMergeCopy } from 'https://da.live/nx/public/utils/loc.js';

const { actions } = await DA_SDK;
const mergeCopy = createMergeCopy({
  fetch: actions.daFetch,
  daOrigin: 'https://admin.da.live',
});
const result = await mergeCopy({
  source: '/org/source-site/en/page.html',
  destination: '/org/target-site/fr/page.html',
}, 'MSM Merge');
```

`fetch(href, options)` supplies authentication and returns a `Response`.
Paths include org/site. Translation config comes from the destination site,
then its org on 404; no config means no equivalent hostnames. The private
loader caches per org/site and reports other failures. Nothing discovers
IMS, the host, or iframe location.

Merge returns a `Response`, `{ ok: true }` for identical content, or
`{ ok: false, status, error }` for operation failures. Missing/empty
destinations allow overwrite; auth/config failures do not. In-flight version
saves are deduplicated and awaited. A failed version save can follow a
successful content write; don't automatically retry an overwrite.

## Private implementation and migration

`nx/utils/loc.js` shares copy operations with internal loc and Rollout.
Pure diffing and the unchanged hash bundle remain under
`nx/blocks/loc/regional-diff/`. Original loc entrypoints remain adapters.
Loc supplies its existing backend-aware `source.save`; `nx2/utils/api.js`
and its DA/HLX6 routing are unchanged.

NX2 migration touchpoints: loc's project/config adapters, the nx2 Rollout
plugin, and the private engine's pure `nx2/utils/getElementMetadata.js`
dependency. That helper has no IMS/runtime dependency. External apps import
only the stable public entrypoint.

Deploy this entrypoint before merging AEM Apps' migration/shim removal.
AEM Apps remains DA-only. SDK auth-failure behavior is unchanged; broader
SDK/HLX6 support is separate work.
