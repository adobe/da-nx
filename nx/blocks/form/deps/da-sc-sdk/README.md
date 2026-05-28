# da-sc-sdk (vendored bundle)

`dist/index.js` is a vendored copy of the `da-sc-sdk` browser bundle. The form block
imports it directly:

```js
import {
  createEngine,
  convertJsonToHtml,
  convertHtmlToJson,
} from "./deps/da-sc-sdk/dist/index.js";
```

**Current bundle:** built from
[`adobe-rnd/da-sc-sdk@1e81c45ead0481027f4ca242eb5fa5de6d8d6ada`](https://github.com/adobe-rnd/da-sc-sdk/commit/1e81c45ead0481027f4ca242eb5fa5de6d8d6ada).

> **Temporary arrangement.** This vendored bundle is in place until `da-sc-sdk` has a
> proper release process (npm publish or pinned tag/tarball). Once that exists, the
> form should consume the SDK through `package.json` and the bundle will be replaced
> by a build step that pulls from `node_modules` (or an import map).

## Updating the bundle

1. Clone the SDK repo somewhere outside `da-nx` and check out the exact commit you
   intend to ship:

   ```bash
   git clone https://github.com/adobe-rnd/da-sc-sdk.git
   cd da-sc-sdk
   git checkout <sha>
   git rev-parse HEAD   # capture this — it must be recorded below
   ```

2. Install dependencies and build:

   ```bash
   npm install
   npm run build
   ```

   This produces `dist/index.js` — a self-contained ESM bundle (no external runtime
   dependencies).

3. Copy the bundle into this folder:

   ```bash
   cp dist/index.js /path/to/da-nx/nx/blocks/form/deps/da-sc-sdk/dist/index.js
   ```

4. **Pin the SHA.** Update the **Current bundle** line at the top of this README to
   the SHA you captured in step 1, then commit `dist/index.js` and this README
   together. The commit message must reference the same SHA so the vendored artifact
   is always traceable back to the SDK source it was built from.
