# `nx2/utils/aem-assets` AEM Assets

Shared, UI-free logic for picking assets from an AEM as a Cloud Service repository with the [AEM Asset Selector](https://experience.adobe.com/solutions/CQ-assets-selectors). It resolves the site's repository config, builds the URL to store or insert, checks approval and publish status, and loads Adobe's hosted selector script.

Three editors consume it.

- **Canvas** (da-live `blocks/canvas/ew-panel-extensions/aem-assets.js`)
- **Classic editor** (da-live `blocks/edit/da-assets/`)
- **SC editor** (`nx/blocks/form/utils/aem-selector.js`)

da-live loads these files at runtime through `getNx2()`, for example `` await import(`${getNx2()}/utils/aem-assets/urls.js`) ``. That makes every export a cross-repository contract. Keep file names, export names, and positional signatures backward compatible. Add new behavior through new exports or optional trailing parameters.

UI stays with each consumer. That covers the dialog, the error panels, Smart Crop selection, and ProseMirror or form insertion.

## File structure

```
aem-assets/
  constants.js          Default asset base path
  config.js             Dynamic Media and approved-only rules
  filter-schema.js      Approved-only Content Advisor filter props
  selector-props.js     Asset Selector props and feature set
  repository-config.js  DA site config resolution into repoConfig
  urls.js               URL builders, rendition resolution, metadata readers
  image-modifiers.js    Site-wide query modifiers for delivery image URLs
  selection.js          Asset to URL resolution with approval and publish checks
  selector.js           Memoized loader for the hosted selector script
```

---

## Repository modes

`aem.repositoryId` and a few optional flags decide the mode.

### 1. Author + Publish

`aem.repositoryId` starts with `author-`.

- The selector shows the full **folder hierarchy** from AEM DAM.
- URLs point to the **publish** tier, `https://publish-p…/content/dam/…`.
- An asset whose `repo:scene7FileStatus` is set to anything other than `PublishComplete` is rejected.

### 2. Author + Dynamic Media Delivery

`aem.repositoryId` starts with `author-` and one of these is true.

- `aem.asset.dm.delivery = on`
- `aem.asset.smartcrop.select = on`
- `aem.assets.prod.origin` starts with `delivery-`

In this mode the following applies.

- The selector shows the full **folder hierarchy** from AEM DAM.
- URLs are **DM delivery URLs**, `https://delivery-p…/<basePath>/<repo:id>/as/<name>.avif`.
- An asset must be **approved** (`dam:assetStatus = approved`) and **activated for delivery** (`dam:activationTarget = delivery` or empty). Otherwise it is rejected.
- Content Advisor shows only **Approved** assets through a locked filter. Exact `aem.asset.dm.approvedonly = off` removes the filter.
- With `aem.asset.smartcrop.select = on`, consumers may offer Smart Crop selection for images.

### 3. Delivery (DM Open API)

`aem.repositoryId` starts with `delivery-`. The AEM environment needs **DM Open API** enabled.

- The selector shows a **flat listing** of approved assets, with no folders.
- URLs follow the [AEM Delivery API spec](https://experienceleague.adobe.com/en/docs/experience-manager-cloud-service/content/assets/manage/asset-selector/asset-selector-integration/integrate-asset-selector-dynamic-media-open-api), `https://<host>/<basePath>/<repo:assetId>/as/<seo-name>.avif`.
- No approval check runs, because the delivery tier exposes only approved assets.

---

## Configuration

Keys live in the DA config at `https://da.live/config#/<org>/` or `https://da.live/config#/<org>/<site>/`, in the first sheet. Site values win over org values.

| Key | Required | Values | Description |
|---|---|---|---|
| `aem.repositoryId` | Yes | `author-p1-e1.adobeaemcloud.com` or `delivery-p1-e1.adobeaemcloud.com` | Selects the repository mode by its prefix. Host only, without `https://`. |
| `aem.assets.prod.origin` | No | e.g. `assets.example.com` | Overrides the derived URL host. A value starting with `delivery-` also enables DM delivery. |
| `aem.assets.prod.basepath` | No | e.g. `/adobe/assets` | Overrides the default base path for DM and delivery URLs. |
| `aem.assets.image.type` | No | `link` | Sets `insertAsLink` so consumers insert images as links. |
| `aem.asset.dm.delivery` | No | `on` | Browses author but builds DM delivery URLs. Enables Author + DM. |
| `aem.asset.dm.approvedonly` | No | absent, `on`, or `off` | Author + DM only. Absent or `on` locks the Approved filter. Exact `off` removes it. |
| `aem.asset.smartcrop.select` | No | `on` | Sets `isSmartCrop`. Implies DM delivery. |
| `aem.asset.mime.renditions` | No | e.g. `image/vnd.adobe.photoshop:avif, image/*:original` | Comma-separated `mimetype:rendition` overrides. See [Rendition resolution](#rendition-resolution). |
| `aem.asset.image.modifiers` | No | e.g. `width=1200&quality=80` | Query parameters added to delivery image URLs. See [`image-modifiers.js`](#image-modifiersjs). |

---

## URL construction

The base path defaults to `/adobe/assets`. `aem.assets.prod.basepath` overrides it.

### Rendition resolution

`resolveRenditionType()` picks the rendition for DM and delivery URLs in this order.

1. An **exact match** in `aem.asset.mime.renditions`, such as `image/vnd.adobe.photoshop` to `avif`.
2. A **prefix wildcard** in `aem.asset.mime.renditions`, such as `image/*` to `original`.
3. **Built-in defaults**, `image/*` to `avif` and `video/*` to `play`.
4. Anything else falls back to `original`.

| Rendition | URL suffix |
|---|---|
| `avif` | `/as/<seo-name>.avif` |
| `play` | `/play` |
| `original` | `/original/as/<filename>` |

`seo-name` is the file name without its extension.

### Author + Publish

| Asset type | URL pattern |
|---|---|
| Image, document, other | `https://<publishOrigin><asset.path>` |
| Video | The `/play` rendition link from `_links` when present, else `https://<publishOrigin><asset.path>` |

### Author + DM Delivery

| Asset type | URL pattern (default rendition) |
|---|---|
| Image | `https://<dmOrigin>/<basePath>/<repo:id>/as/<seo-name>.avif` |
| Video | `https://<dmOrigin>/<basePath>/<repo:id>/play` |
| Other (PDF, CSV) | `https://<dmOrigin>/<basePath>/<repo:id>/original/as/<filename>` |

### Delivery (DM Open API)

These URLs read `repo:assetId`, `repo:repositoryId`, and `repo:name` from the asset.

| Asset type | URL pattern (default rendition) |
|---|---|
| Image | `https://<host>/<basePath>/<repo:assetId>/as/<seo-name>.avif` |
| Video | `https://<host>/<basePath>/<repo:assetId>/play` |
| Other (PDF, CSV) | `https://<host>/<basePath>/<repo:assetId>/original/as/<repo:name>` |

`<host>` is `repo:repositoryId` unless `aem.assets.prod.origin` overrides it.

---

## Responsive image config

With `aem.asset.smartcrop.select = on`, consumers can offer multi-crop insert options. A `responsive-images` sheet in the DA config defines them.

| Column | Description |
|---|---|
| `name` | Label shown in the UI, e.g. `Full Width` |
| `position` | Where the option applies. `everywhere`, `outside-blocks`, or a block name such as `hero` |
| `crops` | Comma-separated Smart Crop names that must all exist on the asset, e.g. `desktop, mobile` |

---

## Module responsibilities

### `constants.js`

The default export is the base path `/adobe/assets`.

### `config.js`

- `isDynamicMediaEnabled({ repositoryId, customOrigin, dmDelivery, smartCrop })` returns whether DM delivery URLs apply.
- `shouldFilterApprovedAssets({ tierType, isDmEnabled, configuredValue })` returns whether the Approved filter is locked on.

### `filter-schema.js`

- `createApprovedOnlyFilterSchema()` returns the Content Advisor filter schema that locks the Approved status.
- `getApprovedOnlyFilterProps(approvedOnly)` returns `{ filterSchema, filterSchemaSource }` when `approvedOnly` is true, else `{}`.

### `selector-props.js`

- `buildFeatureSet(isDmEnabled)` returns `upload`, `collections`, `detail-panel`, and `advisor`, plus `dynamic-media` when DM is enabled.
- `buildAssetSelectorProps({ imsToken, repoConfig, externalBrief, onClose, handleSelection })` returns the props for `renderAssetSelector`, including the approved-only filter when enabled. For author-tier repos it also sets `path` to the last remembered folder of that repository.
- `rememberAssetFolder(repoConfig, assetPath)` remembers the folder of a selected asset per repository, in memory, so the picker reopens there. Delivery-tier repos have no folder structure and are ignored.

### `repository-config.js`

- `getRepositoryConfig(owner, repo)` resolves the config keys into `repoConfig`. It returns `null` when there is no owner or no `aem.repositoryId`.
- `getResponsiveImageConfig(owner, repo)` returns the parsed `responsive-images` sheet, or `false` when it is missing.
- `parseMimeRenditions(configValue, defaults)` parses `aem.asset.mime.renditions` into a mime type to rendition map.

Config documents load through `nx2/utils/daConfig.js`, which caches them per page and retries failed loads.

`repoConfig` shape.

```js
{
  repositoryId,           // e.g. 'author-p1-e1.adobeaemcloud.com'
  tierType,               // 'author' | 'delivery'
  assetOrigin,            // URL host for stored or inserted assets
  assetBasePath,          // default '/adobe/assets'
  isDmEnabled,            // DM delivery URLs apply
  isSmartCrop,            // Smart Crop selection is on
  approvedOnly,           // the Approved filter is locked on
  insertAsLink,           // insert images as links
  mimeRenditionOverrides, // Record<string, string> from aem.asset.mime.renditions
  siteImageModifiers,     // query string from aem.asset.image.modifiers, or null
}
```

### `urls.js`

URL builders per mode.

- `buildAuthorUrl(asset, publishOrigin)` for Author + Publish.
- `buildDmUrl(asset, host, basePath, renditionOptions)` for Author + DM. Uses `repo:id`.
- `buildDeliveryUrl(asset, overrideHost, basePath, renditionOptions)` for Delivery. Uses `repo:assetId` and `repo:repositoryId`. `overrideHost` wins over `repo:repositoryId`.
- `buildSmartCropUrl(asset, dmOrigin, cropName, basePath)` builds a crop URL with `?smartcrop=<cropName>`.
- `buildSmartCropsListUrl(asset, dmOrigin, basePath)` builds the URL that lists an asset's smart crops.

Helpers.

- `resolveRenditionType(mimetype, { mimeRenditionOverrides })` returns `avif`, `play`, or `original`.
- `getAssetAlt(asset)` prefers `Iptc4xmpExt:ExtDescrAccessibility`, then `dc:description`, `dc:title`, and the asset name.
- `getDmApprovalStatus(asset)` returns `{ status, activationTarget }` from the asset metadata.
- `getScene7PublishStatus(asset)` returns `repo:scene7FileStatus`.

### `image-modifiers.js`

- `parseSiteImageModifiers(rawValue)` trims the value and a leading `?`. It returns `null` when empty.
- `applySiteImageModifiers(srcUrl, modifiers)` adds the modifiers to image URLs under `/adobe/assets/` (`avif`, `webp`, `jpg`, `jpeg`, `png`, `gif`). Existing query parameters win, so a `smartcrop` parameter is kept. Other URLs are returned unchanged.

### `selection.js`

- `resolveAssetUrl(asset, repoConfig)` picks the URL builder for the mode and applies the site image modifiers.
- `resolveAssetSelection({ asset, repoConfig })` returns `{ href, isImage, alt }` or `{ error }`.

| Error | When |
|---|---|
| `MISSING_FORMAT_ERROR_MSG` | The asset has no `aem:formatName` |
| `DM_ERROR_MSG` | Author + DM, and the asset is not approved for delivery |
| `PUBLISH_ERROR_MSG` | Author + Publish, and the asset is not published |

Callers own the UI for each error. Canvas and the classic editor ignore a missing format silently and show the other two in their error panel. The SC editor shows every error inline and keeps the previous value.

### `selector.js`

- `ASSET_SELECTOR_URL` is the hosted `assets-selectors.js` script.
- `loadAssetSelector({ src })` loads the script once per `src` and resolves `{ selectors }`, where `selectors` is `window.PureJSSelectors`. On failure it removes the script tag, clears its cache so the next call retries, and resolves `{ error }` instead of rejecting.
