import { DA_ADMIN } from '../../../../../nx2/utils/utils.js';
import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { daFetch, source as daSource } from '../../../../../nx2/utils/api.js';
import { DA_ETC } from '../../../../utils/utils.js';
import {
  buildGlaasCreateMetadata,
  getOpts,
  glaasSourcePreviewUrl,
  shouldLogGLaaSRequests,
  throttle,
} from './api.js';
import {
  isEligibleMultimodalImageUrl, toHref, parseAemPageHost, aemPageToPreviewDaLiveUrl,
  ensureLivePreviewLogin,
} from './imageSelections.js';
import { LOC_SRC_ATTR } from './dnt.js';

export { shouldLogGLaaSRequests } from './api.js';

function logMultimodalDebug(logRequest, step, detail, { level = 'info' } = {}) {
  if (logRequest) {
    logRequest(step, detail);
    return;
  }
  if (!shouldLogGLaaSRequests()) return;
  const fn = level === 'warn' ? console.warn : console.info;
  // eslint-disable-next-line no-console -- dev GLaaS handoff (glaas.log)
  fn('[GLaaS multimodal]', step, detail);
}
/** Documented GLaaS budget is 120/min per client id; target 100 for shared-stage headroom. */
const GLAAS_API_LIMIT_PER_MINUTE = 100;
const GLAAS_API_WINDOW_MS = 60_000;
const GLAAS_API_MIN_INTERVAL_MS = Math.ceil(
  GLAAS_API_WINDOW_MS / GLAAS_API_LIMIT_PER_MINUTE,
);
const IMAGE_FETCH_QUEUE_CONCURRENCY = 5;
const IMAGE_SAVE_QUEUE_CONCURRENCY = 5;
const IMAGE_UPLOAD_QUEUE_CONCURRENCY = 3;
const V2_PROBE_QUEUE_CONCURRENCY = 3;
const IMAGE_PUSH_INTERVAL_MS = 250;
const PUT_URL_MAX_RETRIES = 4;
const PUT_URL_RETRY_WAIT_MS = 1000;
const PUT_URL_429_FALLBACK_DELAY_MS = Math.ceil(GLAAS_API_WINDOW_MS / 2) + 250;
// Translated images are saved as DA source files (see buildTranslatedImageSourcePath) - 20MB
// is DA's documented /source upload ceiling, not an empirically-observed workaround.
export const TRANSLATED_IMAGE_MAX_BYTES = 20 * 1024 * 1024;

export function createPutUrlRollingLimiter({
  limitPerWindow = GLAAS_API_LIMIT_PER_MINUTE,
  windowMs = GLAAS_API_WINDOW_MS,
  minIntervalMs = GLAAS_API_MIN_INTERVAL_MS,
} = {}) {
  let chain = Promise.resolve();
  let timestamps = [];
  let lastAcquireAt = 0;

  const prune = (now) => {
    timestamps = timestamps.filter((t) => now - t < windowMs);
  };

  return {
    windowRetryDelayMs(now = Date.now()) {
      prune(now);
      if (timestamps.length >= limitPerWindow) {
        return timestamps[0] + windowMs - now + 250;
      }
      return 0;
    },
    async acquire() {
      const previous = chain;
      let release;
      chain = new Promise((resolve) => { release = resolve; });
      await previous;
      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const now = Date.now();
          prune(now);
          const waitForWindow = timestamps.length >= limitPerWindow
            ? timestamps[0] + windowMs - now
            : 0;
          const waitForSpacing = Math.max(0, lastAcquireAt + minIntervalMs - now);
          const waitMs = Math.max(waitForWindow, waitForSpacing);
          if (waitMs > 0) {
            await throttle(waitMs);
            // eslint-disable-next-line no-continue
            continue;
          }
          lastAcquireAt = now;
          timestamps.push(now);
          return;
        }
      } finally {
        release();
      }
    },
    reset() {
      chain = Promise.resolve();
      timestamps = [];
      lastAcquireAt = 0;
    },
  };
}

const glaasApiLimiter = createPutUrlRollingLimiter();

async function acquireGlaasApiSlot() {
  await glaasApiLimiter.acquire();
}

function putUrlOpaqueRetryDelayMs({ waitInterval }) {
  const windowWait = glaasApiLimiter.windowRetryDelayMs();
  if (windowWait > 0) return windowWait;
  return Math.max(waitInterval, PUT_URL_429_FALLBACK_DELAY_MS);
}

function putUrlReactiveRetryDelayMs({ waitInterval }) {
  return Math.max(
    waitInterval,
    glaasApiLimiter.windowRetryDelayMs() || PUT_URL_429_FALLBACK_DELAY_MS,
  );
}

export function resetPutUrlRateLimitGateForTests() {
  glaasApiLimiter.reset();
}

function getPutUrlRateLimitHeaders(resp) {
  return {
    retryAfter: resp.headers.get('retry-after'),
    xRateLimitRetryAfterSeconds: resp.headers.get('x-rate-limit-retry-after-seconds'),
  };
}

function getMillisToSleep(retryHeaderString) {
  if (typeof retryHeaderString === 'string' && retryHeaderString) {
    const millisToSleep = Math.round(parseFloat(retryHeaderString) * 1000);
    if (!Number.isNaN(millisToSleep) && millisToSleep > 0) return millisToSleep;
    const dateDiff = new Date(retryHeaderString) - Date.now();
    if (dateDiff > 0) return dateDiff;
  }
  return -1;
}

function putUrl429RetryDelayMs({ resp, waitInterval }) {
  const { retryAfter, xRateLimitRetryAfterSeconds } = getPutUrlRateLimitHeaders(resp);
  const retryIn = getMillisToSleep(retryAfter || xRateLimitRetryAfterSeconds || '');
  if (retryIn > 0) return retryIn + 250;
  return putUrlReactiveRetryDelayMs({ waitInterval });
}

async function backoffPutUrl429({
  waitMs,
  logRequest,
  attempt,
  assetName,
  status,
  detail = {},
}) {
  logRequest?.('getPutURL-retry', {
    status,
    attempt: attempt + 1,
    waitMs,
    assetName,
    ...detail,
  });
  await throttle(waitMs);
}

function putUrlAssetName(assetName) {
  return assetName.replace(/^\/+/, '').replaceAll('/', '-');
}

export function ensureLeadingSlash(assetName) {
  return assetName.startsWith('/') ? assetName : `/${assetName}`;
}

const CONTENT_DA_LIVE = 'content.da.live';

export function siteRelativePathFromImageUrl(imageUrl) {
  try {
    const url = new URL(imageUrl);
    const pathname = decodeURIComponent(url.pathname);
    // Only content.da.live paths have an /{org}/{site} prefix to strip.
    if (url.hostname !== CONTENT_DA_LIVE) return pathname || '/';
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length <= 2) return '/';
    return `/${segments.slice(2).join('/')}`;
  } catch {
    return '/';
  }
}

// Deliberately path-based, not content-addressed: an image shared across pages saves a
// separate copy per page today (dedup is left to a future job over /translated-images).
export function buildTranslatedImageSourcePath({ langCode, glaasName }) {
  const base = ensureLeadingSlash(glaasName);
  const locale = String(langCode ?? '').replace(/^\/+|\/+$/g, '');
  return locale ? `/translated-images/${locale}${base}` : `/translated-images${base}`;
}

export function logMultimodalRequest(step, detail) {
  logMultimodalDebug(undefined, step, detail);
}

export async function getPutUrlForFile({
  origin,
  clientid,
  token,
  assetName,
  logRequest,
  maxRetries = PUT_URL_MAX_RETRIES,
}) {
  const opts = getOpts(clientid, token);
  const pathName = putUrlAssetName(assetName);
  const url = `${origin}/api/l10n/v1.1/asset/getPutURLForFile/${pathName}`;
  logRequest?.('getPutURL', { method: 'GET', url, assetName, wireName: pathName });

  let waitInterval = PUT_URL_RETRY_WAIT_MS;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      await acquireGlaasApiSlot();
      const resp = await fetch(url, opts);
      if (resp.status === 429 && attempt < maxRetries) {
        waitInterval *= 2;
        const waitMs = putUrl429RetryDelayMs({ resp, waitInterval });
        await backoffPutUrl429({
          waitMs,
          logRequest,
          attempt,
          assetName,
          status: 429,
          detail: getPutUrlRateLimitHeaders(resp),
        });
        // eslint-disable-next-line no-continue
        continue;
      }
      const json = await resp.json();
      if (!resp.ok) return { error: 'Error getting put URL for file.', status: resp.status, json };
      if (!json.putURL) return { error: 'Missing putURL in response.', status: resp.status, json };
      logRequest?.('getPutURL-response', { status: resp.status, assetName });
      return { putURL: json.putURL, instanceId: json.instanceId, status: resp.status };
    } catch (e) {
      if (attempt < maxRetries) {
        const waitMs = putUrlOpaqueRetryDelayMs({ waitInterval });
        await backoffPutUrl429({
          waitMs,
          logRequest,
          attempt,
          assetName,
          status: 'fetch-error',
          detail: { error: String(e) },
        });
        // eslint-disable-next-line no-continue
        continue;
      }
      return { error: 'Error getting put URL for file.' };
    }
  }
  return { error: 'Error getting put URL for file.' };
}

function contentTypeForPutUrl(putURL, contentType) {
  try {
    const rsct = new URL(putURL).searchParams.get('rsct');
    if (rsct) return decodeURIComponent(rsct);
  } catch { /* skip */ }
  return contentType;
}

export async function putAssetToSignedUrl({ putURL, body, contentType, logRequest, putLabel }) {
  try {
    const headers = { 'x-ms-blob-type': 'BlockBlob' };
    const type = contentTypeForPutUrl(putURL, contentType);
    if (type) headers['Content-Type'] = type;
    logRequest?.('put-signedURL', { method: 'PUT', putLabel, contentType: type });
    const resp = await fetch(putURL, { method: 'PUT', body, headers });
    logRequest?.('put-signedURL-response', { putLabel, status: resp.status });
    if (!resp.ok) return { error: 'Error uploading to signed URL.', status: resp.status };
    return { status: resp.status };
  } catch {
    return { error: 'Error uploading to signed URL.' };
  }
}

export async function createMultimodalTask({
  origin, clientid, token, task, service, logRequest,
}) {
  const {
    name,
    workflowName,
    workflow,
    targetLocales,
    assets,
    textLocalizationWorkflow = 'Transcreation',
    imageLocalizationWorkflow = 'Agentic_Translation',
  } = task;
  const [product = '', project = ''] = workflow?.split('/') ?? [];
  const { callbackConfig, config } = await buildGlaasCreateMetadata({ task, service });

  const body = {
    productName: product,
    projectName: project,
    contentSource: 'Adhoc',
    state: 'CREATED',
    taskName: name,
    modality: 'MULTIMODAL',
    workflowName,
    textLocalizationWorkflow,
    imageLocalizationWorkflow,
    videoLocalizationWorkflow: null,
    audioLocalizationWorkflow: null,
    targetLocales,
    callbackConfig,
    config,
    assets,
  };

  const url = `${origin}/api/l10n/v2.0/tasks/${product}/${project}/create`;
  logRequest?.('v2-create', { method: 'POST', url, body });
  logMultimodalDebug(logRequest, 'v2-create-body-json\n', JSON.stringify(body, null, 2));
  const opts = getOpts(clientid, token, JSON.stringify(body), 'application/json', 'POST');
  try {
    const resp = await fetch(url, opts);
    let json;
    try {
      json = await resp.json();
    } catch {
      json = null;
    }
    logRequest?.('v2-create-response', { status: resp.status, json });
    if (!resp.ok) return { error: 'Error creating multimodal task.', status: resp.status, json };
    return task;
  } catch (e) {
    logRequest?.('v2-create-response', { error: String(e) });
    return { error: 'Error creating multimodal task.', status: e };
  }
}

export async function getV2Asset(service, token, task, assetName) {
  const { clientid, origin } = service;
  const { name: taskName, code: lang, workflow } = task;
  const [product = '', project = ''] = workflow?.split('/') ?? [];
  const opts = getOpts(clientid, token);
  try {
    await acquireGlaasApiSlot();
    const path = ensureLeadingSlash(assetName);
    const resp = await fetch(`${origin}/api/l10n/v2.0/tasks/${product}/${project}/${taskName}/assets/${lang}${path}`, opts);
    let json;
    try {
      json = await resp.json();
    } catch {
      json = null;
    }
    return { status: resp.status, json };
  } catch {
    return { error: 'Error getting v2 asset.' };
  }
}

export async function fetchFromSignedUrl(signedURL) {
  try {
    const resp = await fetch(signedURL);
    if (!resp.ok) return { error: 'Error fetching signed URL.', status: resp.status };
    return { status: resp.status, text: await resp.text() };
  } catch {
    return { error: 'Error fetching signed URL.' };
  }
}

export async function fetchBlobFromSignedUrl(signedURL) {
  try {
    const resp = await fetch(signedURL);
    if (!resp.ok) return { error: 'Error fetching signed URL.', status: resp.status };
    const blob = await resp.blob();
    return {
      status: resp.status,
      blob,
      contentType: blob.type || resp.headers.get('content-type') || 'application/octet-stream',
    };
  } catch {
    return { error: 'Error fetching signed URL.' };
  }
}

/** Encode delivery URL for HTML src/srcset (spaces → %20, valid srcset). */
export function contentDaLiveHrefForAttribute(href) {
  if (!href) return href;
  try {
    return new URL(href).href;
  } catch {
    return href;
  }
}

function isAbsoluteContentDaLiveUrl(href) {
  if (!href || href.startsWith('./') || href.startsWith('../')) return false;
  try {
    return new URL(href).hostname === CONTENT_DA_LIVE;
  } catch {
    return false;
  }
}

/**
 * Which images on the page could be sent for translation at all - opt-in
 * selection (da-metadata's loc-images) is applied on top of this by callers.
 * Any absolute http(s) png/jpg/jpeg image on an aem.live, aem.page, or
 * content.da.live host is eligible.
 *
 * LOC_SRC_ATTR (see dnt.js), if present, is the image's real href - DNT relativizes
 * some absolute image srcs, which would otherwise make a marked image look ineligible.
 */
export function collectMultimodalImageUrls(html, { imageSelections } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const urls = new Set();
  doc.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute(LOC_SRC_ATTR) || img.getAttribute('src');
    if (!isEligibleMultimodalImageUrl(src)) return;
    const href = toHref(src);
    if (href && imageSelections?.has(href)) urls.add(href);
  });
  return [...urls];
}

const CONTENT_DA_LIVE_ORIGIN = `https://${CONTENT_DA_LIVE}`;

/** Map delivery URL to DA Admin source (same path after /source/). content.da.live only. */
export function contentDaLiveToDaSourceUrl(imageUrl) {
  return imageUrl.replace(CONTENT_DA_LIVE_ORIGIN, `${DA_ADMIN}/source`);
}

/** Replace original image URLs (any host) using normalized href → new delivery URL map. */
export function rewriteContentDaLiveImageUrls(html, pathToNewUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const resolveNewUrl = (href) => {
    const key = toHref(href);
    if (!key) return undefined;
    return pathToNewUrl.get(key);
  };

  doc.querySelectorAll('img[src]').forEach((img) => {
    // LOC_SRC_ATTR (see dnt.js): the image's real href if DNT relativized its src -
    // pathToNewUrl is keyed by the original absolute href, not the relativized one.
    const next = resolveNewUrl(img.getAttribute(LOC_SRC_ATTR) || img.getAttribute('src'));
    if (!next) return;
    const encoded = contentDaLiveHrefForAttribute(next);
    img.setAttribute('src', encoded);
    img.removeAttribute(LOC_SRC_ATTR);
    const picture = img.closest('picture');
    if (!picture) return;
    picture.querySelectorAll('source[srcset]').forEach((source) => {
      source.setAttribute('srcset', encoded);
    });
  });

  return doc.documentElement?.querySelector('body')?.innerHTML
    ? doc.body.innerHTML
    : html;
}

/** v2 get-asset response means the asset is ready to download (COMPLETED). */
export function isV2AssetReady(meta) {
  return meta?.status === 200 && Boolean(meta?.json?.signedURL);
}

export function collectMultimodalAssetNames(pageAssets) {
  const names = new Set();
  Object.values(pageAssets ?? {}).forEach((page) => {
    if (page?.htmlGlaasName) names.add(page.htmlGlaasName);
    (page?.images ?? []).forEach((image) => {
      if (image?.glaasName) names.add(image.glaasName);
    });
  });
  return [...names];
}

export function v2AssetStatusFromProbe(assetName, meta) {
  const logical = ensureLeadingSlash(assetName);
  if (isV2AssetReady(meta)) {
    return {
      assetName: logical,
      status: 'COMPLETED',
      assetType: meta.json?.assetType,
    };
  }
  return {
    assetName: logical,
    status: meta?.status === 404 ? 'NOT_FOUND' : 'IN_PROGRESS',
    assetType: meta?.json?.assetType,
  };
}

async function runImageQueue({
  items,
  processItem,
  concurrency = IMAGE_SAVE_QUEUE_CONCURRENCY,
  pushIntervalMs,
}) {
  if (!items.length) return { results: [] };

  let firstError;
  const results = [];
  const queue = new Queue(async (item) => {
    if (firstError) return;
    const result = await processItem(item);
    if (result?.error) {
      firstError = result;
      return;
    }
    results.push(result);
  }, concurrency);

  if (pushIntervalMs) {
    const pending = [];
    for (let i = 0; i < items.length; i += 1) {
      if (i > 0) await throttle(pushIntervalMs);
      pending.push(queue.push(items[i]));
    }
    await Promise.all(pending);
  } else {
    await Promise.all(items.map((item) => queue.push(item)));
  }

  if (firstError) return { error: firstError };
  return { results };
}

async function probeMultimodalAssetStatuses({
  service, token, task, langCode, assetNames,
}) {
  const langTask = { ...task, code: langCode };
  const queued = await runImageQueue({
    items: assetNames,
    concurrency: V2_PROBE_QUEUE_CONCURRENCY,
    processItem: async (assetName) => {
      const meta = await getV2Asset(service, token, langTask, assetName);
      if (meta.error) return meta;
      return v2AssetStatusFromProbe(assetName, meta);
    },
  });
  if (queued.error) return { error: queued.error };
  return queued.results ?? [];
}

/**
 * Poll MULTIMODAL completion via v2 get-asset (same contract as save/download).
 * Returns v1.2-shaped `{ status, json }` where json is one subtask per locale.
 */
export async function getMultimodalV2TaskStatus({
  service, token, task, langs, pageAssets,
}) {
  const assetNames = collectMultimodalAssetNames(pageAssets);
  if (assetNames.length === 0) {
    return { status: 404, json: [] };
  }

  const subtasks = [];
  for (const lang of langs) {
    // eslint-disable-next-line no-await-in-loop
    const assets = await probeMultimodalAssetStatuses({
      service,
      token,
      task,
      langCode: lang.code,
      assetNames,
    });
    if (assets?.error) {
      subtasks.push({
        targetLocale: lang.code,
        status: 'IN_PROGRESS',
        assets: [],
      });
      // eslint-disable-next-line no-continue
      continue;
    }
    const allCompleted = assets.every((asset) => asset.status === 'COMPLETED');
    subtasks.push({
      targetLocale: lang.code,
      status: allCompleted ? 'COMPLETED' : 'IN_PROGRESS',
      assets,
    });
  }

  return { status: 200, json: subtasks };
}

export function countMultimodalTranslatedPages(pageAssets, assets) {
  const completedNames = new Set(
    (assets ?? [])
      .filter((asset) => asset.status === 'COMPLETED')
      .map((asset) => ensureLeadingSlash(asset.assetName ?? '')),
  );

  if (!pageAssets || Object.keys(pageAssets).length === 0) {
    return 0;
  }

  return Object.values(pageAssets).reduce((count, page) => {
    if (!completedNames.has(page.htmlGlaasName)) return count;
    const imagesReady = (page.images ?? []).every((img) => completedNames.has(img.glaasName));
    return imagesReady ? count + 1 : count;
  }, 0);
}

export function buildMultimodalPageAssetEntry({ htmlAssetName, imageUrls }) {
  const htmlGlaasName = ensureLeadingSlash(htmlAssetName);
  const images = imageUrls.map((contentDaLiveUrl) => ({
    contentDaLiveUrl,
    glaasName: ensureLeadingSlash(siteRelativePathFromImageUrl(contentDaLiveUrl)),
  }));
  return { htmlGlaasName, images };
}

export function buildMultimodalTextAsset({
  pagePath,
  signedUrl,
  targetLocales,
  pagePreviewUrl,
  assetMetadataUrl,
}) {
  return {
    type: 'TEXT',
    name: pagePath,
    parentAsset: pagePath,
    signedUrl,
    targetLocales,
    ...(assetMetadataUrl && { assetMetadataUrl }),
    ...(pagePreviewUrl && { sourcePreviewUrlPage: pagePreviewUrl }),
  };
}

function buildMultimodalMetadataAssetName(htmlAssetName) {
  if (/\.html$/i.test(htmlAssetName)) return htmlAssetName.replace(/\.html$/i, '.metadata.json');
  return `${htmlAssetName}.metadata.json`;
}

function buildMultimodalAssetMetadataPayload({
  pagePath,
  pagePreviewUrl,
  targetLocales,
  translationMetadata,
  languageContext,
}) {
  return {
    assetName: pagePath,
    metadata: { 'source-preview-url': pagePreviewUrl },
    assetType: 'SOURCE',
    targetLocales,
    ...(translationMetadata && Object.keys(translationMetadata).length > 0 && {
      langMetadata: translationMetadata,
    }),
    ...(languageContext && Object.keys(languageContext).length > 0 && { languageContext }),
  };
}

// Plain absolute image URLs (e.g. published .aem.live media, or any other external host)
// aren't CORS-enabled for reads from da.live - same proxy pattern already used by the
// trados connector (connectors/trados/utils.js's corsFetch) and media-library.
function corsProxyFetch(url) {
  return fetch(`${DA_ETC}/cors?url=${encodeURIComponent(url)}`);
}

export async function fetchMultimodalImage({ imageIndex, imageUrl, logRequest }) {
  const imageAssetName = siteRelativePathFromImageUrl(imageUrl);
  // Only content.da.live needs the DA Admin source proxy for auth.
  const imageSourceUrl = isAbsoluteContentDaLiveUrl(imageUrl)
    ? contentDaLiveToDaSourceUrl(imageUrl)
    : imageUrl;
  logRequest?.('fetch-image', { imageIndex, contentDaLiveUrl: imageUrl, daSourceUrl: imageSourceUrl });
  let imageResp;
  try {
    const aemPageHost = parseAemPageHost(imageSourceUrl);
    if (aemPageHost) {
      const loggedIn = await ensureLivePreviewLogin(aemPageHost);
      if (!loggedIn) {
        return { error: 'Error fetching image.', step: `fetch-image-${imageIndex}` };
      }
      const previewUrl = aemPageToPreviewDaLiveUrl(imageSourceUrl, aemPageHost);
      imageResp = await fetch(previewUrl, { credentials: 'include' });
    } else if (isAbsoluteContentDaLiveUrl(imageUrl)) {
      imageResp = await daFetch({ url: imageSourceUrl });
    } else {
      imageResp = await corsProxyFetch(imageSourceUrl);
    }
  } catch {
    return { error: 'Error fetching image.', step: `fetch-image-${imageIndex}` };
  }
  if (!imageResp.ok) {
    return {
      error: 'Error fetching image.',
      step: `fetch-image-${imageIndex}`,
      status: imageResp.status,
    };
  }

  const imageBlob = await imageResp.blob();
  return {
    imageIndex,
    imageUrl,
    imageAssetName,
    imageBlob,
  };
}

async function uploadFetchedMultimodalImage({
  imageIndex,
  imageUrl,
  imageAssetName,
  imageBlob,
  origin,
  clientid,
  token,
  pagePath,
  pagePreviewUrl,
  targetLocales,
  logRequest,
}) {
  const imagePut = await getPutUrlForFile({
    origin, clientid, token, assetName: imageAssetName, logRequest,
  });
  if (imagePut.error) return { error: imagePut.error, step: `getPutURL-image-${imageIndex}`, ...imagePut };

  const imageUpload = await putAssetToSignedUrl({
    putURL: imagePut.putURL,
    body: imageBlob,
    contentType: imageBlob.type || 'image/png',
    logRequest,
    putLabel: `image-${imageIndex}`,
  });
  if (imageUpload.error) return { error: imageUpload.error, step: `put-image-${imageIndex}`, ...imageUpload };

  return {
    asset: {
      type: 'IMAGE',
      name: ensureLeadingSlash(imageAssetName),
      parentAsset: pagePath,
      signedUrl: imagePut.putURL,
      targetLocales,
      ...(pagePreviewUrl && { sourcePreviewUrlPage: pagePreviewUrl }),
    },
    imageUrl,
    imageIndex,
  };
}

export async function uploadMultimodalPageAssets({
  origin,
  clientid,
  token,
  htmlAssetName,
  htmlContent,
  targetLocales,
  maxImages,
  logRequest,
  aemHref,
  sourcePreviewUrl,
  translationMetadata,
  languageContext,
  imageSelections,
  org,
  site,
}) {
  const htmlPut = await getPutUrlForFile({
    origin, clientid, token, assetName: htmlAssetName, logRequest,
  });
  if (htmlPut.error) return { error: htmlPut.error, step: 'getPutURL-html', ...htmlPut };

  const htmlUpload = await putAssetToSignedUrl({
    putURL: htmlPut.putURL,
    body: htmlContent,
    contentType: 'text/html',
    logRequest,
    putLabel: 'html',
  });
  if (htmlUpload.error) return { error: htmlUpload.error, step: 'put-html', ...htmlUpload };

  const pagePath = ensureLeadingSlash(htmlAssetName);
  const pagePreviewUrl = sourcePreviewUrl ?? glaasSourcePreviewUrl(aemHref);

  const metadataAssetName = buildMultimodalMetadataAssetName(htmlAssetName);
  const metadataPut = await getPutUrlForFile({
    origin, clientid, token, assetName: metadataAssetName, logRequest,
  });
  if (metadataPut.error) return { error: metadataPut.error, step: 'getPutURL-metadata', ...metadataPut };

  const assetMetadataPayload = buildMultimodalAssetMetadataPayload({
    pagePath,
    pagePreviewUrl,
    targetLocales,
    translationMetadata,
    languageContext,
  });
  const metadataUpload = await putAssetToSignedUrl({
    putURL: metadataPut.putURL,
    body: JSON.stringify(assetMetadataPayload),
    contentType: 'application/json',
    logRequest,
    putLabel: 'metadata',
  });
  if (metadataUpload.error) return { error: metadataUpload.error, step: 'put-metadata', ...metadataUpload };

  const assets = [buildMultimodalTextAsset({
    pagePath,
    signedUrl: htmlPut.putURL,
    targetLocales,
    pagePreviewUrl,
    assetMetadataUrl: metadataPut.putURL,
  })];

  let imageUrls = collectMultimodalImageUrls(htmlContent, { imageSelections });
  if (maxImages != null) imageUrls = imageUrls.slice(0, maxImages);
  logRequest?.('collect-images', { htmlAssetName, org, site, count: imageUrls.length, imageUrls });

  const imageItems = imageUrls.map((imageUrl, index) => ({ imageIndex: index + 1, imageUrl }));
  const { error: fetchError, results: fetchedImages } = await runImageQueue({
    items: imageItems,
    concurrency: IMAGE_FETCH_QUEUE_CONCURRENCY,
    processItem: ({ imageIndex, imageUrl }) => fetchMultimodalImage({
      imageIndex,
      imageUrl,
      logRequest,
    }),
  });
  if (fetchError) return fetchError;

  const { error: imageError, results: imageResults } = await runImageQueue({
    items: fetchedImages,
    concurrency: IMAGE_UPLOAD_QUEUE_CONCURRENCY,
    processItem: (fetched) => uploadFetchedMultimodalImage({
      ...fetched,
      origin,
      clientid,
      token,
      pagePath,
      pagePreviewUrl,
      targetLocales,
      logRequest,
    }),
  });
  if (imageError) return imageError;

  imageResults.sort((a, b) => a.imageIndex - b.imageIndex);
  const sentImageUrls = imageResults.map((result) => result.imageUrl);
  imageResults.forEach((result) => {
    assets.push(result.asset);
  });

  const pageAsset = buildMultimodalPageAssetEntry({ htmlAssetName, imageUrls: sentImageUrls });
  logRequest?.('upload-page-assets', { htmlAssetName, assetCount: assets.length, pageAsset });
  return { assets, pageAsset };
}

async function downloadMultimodalFromGlaas(service, token, task, assetName, format) {
  const meta = await getV2Asset(service, token, task, assetName);
  if (meta.error || meta.status !== 200 || !meta.json?.signedURL) {
    return { error: 'Error downloading multimodal asset.', status: meta.status, json: meta.json };
  }
  if (format === 'blob') {
    return fetchBlobFromSignedUrl(meta.json.signedURL);
  }
  const fetched = await fetchFromSignedUrl(meta.json.signedURL);
  if (fetched.error) return fetched;
  return { text: fetched.text };
}

export async function downloadMultimodalAsset(service, token, task, assetName) {
  const result = await downloadMultimodalFromGlaas(service, token, task, assetName, 'text');
  if (result.error) return result;
  return result.text;
}

export async function downloadMultimodalAssetBlob(service, token, task, assetName) {
  return downloadMultimodalFromGlaas(service, token, task, assetName, 'blob');
}

const MIME_BY_EXT = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

function mimeTypeForPath(path) {
  const name = path.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  if (dot === -1) return undefined;
  return MIME_BY_EXT[name.slice(dot + 1).toLowerCase()];
}

export function blobContentTypeForDaSource({ daSourcePath, blob, contentType }) {
  const fromPath = mimeTypeForPath(daSourcePath);
  if (fromPath) return fromPath;
  if (contentType && contentType !== 'application/octet-stream') return contentType;
  if (blob?.type && blob.type !== 'application/octet-stream') return blob.type;
  return contentType || blob?.type || 'application/octet-stream';
}

export function formatMediaImageByteSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function checkTranslatedImageSize({ glaasName, sourcePath, sizeBytes, logRequest }) {
  const exceedsMaxBytes = sizeBytes > TRANSLATED_IMAGE_MAX_BYTES;
  const detail = {
    glaasName,
    sourcePath,
    sizeBytes,
    sizeFormatted: formatMediaImageByteSize(sizeBytes),
    maxBytes: TRANSLATED_IMAGE_MAX_BYTES,
    maxFormatted: formatMediaImageByteSize(TRANSLATED_IMAGE_MAX_BYTES),
    exceedsMaxBytes,
  };
  logMultimodalDebug(logRequest, 'translated-image-size', detail);
  if (exceedsMaxBytes) {
    logMultimodalDebug(
      logRequest,
      'Image exceeds DA source size limit',
      detail,
      { level: 'warn' },
    );
  }
  return detail;
}

function translatedImageSkipWarning({ glaasName, sizeFormatted, maxFormatted }) {
  return `Skipping oversized image (keeping source URL): ${glaasName} (${sizeFormatted} exceeds ${maxFormatted} limit). Compress or resize the source asset.`;
}

function skippedOversizedTranslatedImage({ glaasName, sizeCheck }) {
  return {
    skipped: true,
    reason: 'exceeds_size_limit',
    warning: translatedImageSkipWarning({
      glaasName,
      sizeFormatted: sizeCheck.sizeFormatted,
      maxFormatted: sizeCheck.maxFormatted,
    }),
    glaasName,
    ...sizeCheck,
  };
}

export async function saveTranslatedImageToDaSource({
  org, site, langCode, glaasName, blob, contentType, logRequest,
}) {
  const sourcePath = buildTranslatedImageSourcePath({ langCode, glaasName });
  const type = blobContentTypeForDaSource({ daSourcePath: sourcePath, blob, contentType });
  const data = blob.type === type ? blob : new Blob([await blob.arrayBuffer()], { type });
  const sizeCheck = checkTranslatedImageSize({
    glaasName,
    sourcePath,
    sizeBytes: data.size,
    logRequest,
  });
  if (sizeCheck.exceedsMaxBytes) {
    return skippedOversizedTranslatedImage({ glaasName, sizeCheck });
  }
  try {
    const resp = await daSource.save({
      org, site, path: sourcePath, body: data,
    });
    if (!resp.ok) {
      return { error: 'Error saving translated image to DA.', status: resp.status, glaasName, ...sizeCheck };
    }
    return { url: `${CONTENT_DA_LIVE_ORIGIN}/${org}/${site}${sourcePath}`, status: resp.status };
  } catch {
    return { error: 'Error saving translated image to DA.' };
  }
}

async function saveMultimodalTranslatedImage({
  service,
  token,
  task,
  org,
  site,
  langCode,
  image,
  logRequest,
}) {
  const downloaded = await downloadMultimodalAssetBlob(service, token, task, image.glaasName);
  if (downloaded.error) return downloaded;

  const saved = await saveTranslatedImageToDaSource({
    org,
    site,
    langCode,
    glaasName: image.glaasName,
    blob: downloaded.blob,
    contentType: downloaded.contentType,
    logRequest,
  });
  if (saved.skipped) {
    const detail = {
      glaasName: image.glaasName,
      contentDaLiveUrl: image.contentDaLiveUrl,
      warning: saved.warning,
      sizeFormatted: saved.sizeFormatted,
      maxFormatted: saved.maxFormatted,
    };
    logMultimodalDebug(
      logRequest,
      'Skipping oversized image (keeping source URL)',
      detail,
      { level: 'warn' },
    );
    return {
      skipped: true,
      glaasName: image.glaasName,
      contentDaLiveUrl: image.contentDaLiveUrl,
      warning: saved.warning,
    };
  }
  if (saved.error) return saved;

  const sourceKey = toHref(image.contentDaLiveUrl);
  return { sourceKey, url: saved.url };
}

export async function prepareMultimodalPageForSave({
  service,
  token,
  task,
  org,
  site,
  langCode,
  pageAsset,
  htmlAssetName,
  logRequest,
  onWarning,
}) {
  const pathToNewUrl = new Map();
  const skippedImages = [];
  const locale = langCode ?? task.code;

  const { error: imageError, results: imageEntries } = await runImageQueue({
    items: pageAsset.images,
    pushIntervalMs: IMAGE_PUSH_INTERVAL_MS,
    processItem: (image) => saveMultimodalTranslatedImage({
      service,
      token,
      task,
      org,
      site,
      langCode: locale,
      image,
      logRequest,
    }),
  });
  if (imageError) return imageError;

  imageEntries.forEach((entry) => {
    if (entry?.skipped) {
      skippedImages.push(entry);
      return;
    }
    if (entry?.sourceKey) pathToNewUrl.set(entry.sourceKey, entry.url);
  });

  skippedImages.forEach(({ warning }) => {
    onWarning?.({ text: warning, type: 'warning' });
  });

  const htmlDownload = await downloadMultimodalAsset(service, token, task, htmlAssetName);
  if (htmlDownload?.error) return { error: htmlDownload.error };

  const text = pageAsset.images.length
    ? rewriteContentDaLiveImageUrls(htmlDownload, pathToNewUrl)
    : htmlDownload;

  return { text, skippedImages };
}
