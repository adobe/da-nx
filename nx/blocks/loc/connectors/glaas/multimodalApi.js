import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { Queue } from '../../../../public/utils/tree.js';
import { daFetch } from '../../../../utils/daFetch.js';
import {
  buildGlaasCreateMetadata, getOpts, glaasSourcePreviewUrl, throttle,
} from './api.js';

const MULTIMODAL_LOG_KEY = 'glaas.multimodal.log';
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
export const MEDIA_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const MEDIA_IMAGE_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

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

export function siteRelativePathFromContentDaLiveUrl(contentDaLiveUrl) {
  try {
    const pathname = decodeURIComponent(new URL(contentDaLiveUrl).pathname);
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length <= 2) return '/';
    return `/${segments.slice(2).join('/')}`;
  } catch {
    return '/';
  }
}

export function buildTranslatedMediaPath({ langCode, glaasName }) {
  const base = ensureLeadingSlash(glaasName);
  const locale = String(langCode ?? '').replace(/^\/+|\/+$/g, '');
  if (!locale) return base;
  return `/${locale}${base}`;
}

export function shouldLogMultimodalRequests() {
  try {
    return localStorage.getItem(MULTIMODAL_LOG_KEY) === 'true';
  } catch {
    return false;
  }
}

export function logMultimodalRequest(step, detail) {
  // eslint-disable-next-line no-console -- dev multimodal handoff
  console.info('[GLaaS multimodal]', step, detail);
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
  if (logRequest) {
    // eslint-disable-next-line no-console -- dev handoff
    console.info('[GLaaS multimodal] v2-create-body-json\n', JSON.stringify(body, null, 2));
  }
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

const CONTENT_DA_LIVE = 'content.da.live';

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

function isProjectContentDaLiveUrl(href, org, site) {
  if (!isAbsoluteContentDaLiveUrl(href)) return false;
  if (!org || !site) return true;
  const prefix = `https://${CONTENT_DA_LIVE}/${org}/${site}`;
  try {
    return new URL(href).href.startsWith(prefix);
  } catch {
    return false;
  }
}

const GLAAS_MULTIMODAL_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg']);

function isGlaasMultimodalImageUrl(href) {
  try {
    const pathname = decodeURIComponent(new URL(href).pathname);
    const filename = pathname.split('/').pop() ?? '';
    const dot = filename.lastIndexOf('.');
    if (dot === -1) return false;
    return GLAAS_MULTIMODAL_IMAGE_EXTS.has(filename.slice(dot + 1).toLowerCase());
  } catch {
    return false;
  }
}

/** MVP: absolute https://content.da.live/... png/jpeg image URLs from img[src] only. */
export function collectContentDaLiveImageUrls(html, { org, site } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const urls = new Set();
  doc.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (isProjectContentDaLiveUrl(src, org, site) && isGlaasMultimodalImageUrl(src)) {
      urls.add(new URL(src).href);
    }
  });
  return [...urls];
}

const CONTENT_DA_LIVE_ORIGIN = `https://${CONTENT_DA_LIVE}`;

/** Map delivery URL to DA Admin source (same path after /source/). */
export function contentDaLiveToDaSourceUrl(imageUrl) {
  return imageUrl.replace(CONTENT_DA_LIVE_ORIGIN, `${DA_ORIGIN}/source`);
}

export function contentDaLivePathKey(href) {
  try {
    const u = new URL(href, `https://${CONTENT_DA_LIVE}`);
    if (u.hostname !== CONTENT_DA_LIVE) return undefined;
    return decodeURIComponent(u.pathname);
  } catch {
    return undefined;
  }
}

/** Replace content.da.live image URLs using pathname → new delivery URL map. */
export function rewriteContentDaLiveImageUrls(html, pathToNewUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const resolveNewUrl = (href) => {
    const key = contentDaLivePathKey(href);
    if (!key) return undefined;
    return pathToNewUrl.get(key);
  };

  doc.querySelectorAll('img[src]').forEach((img) => {
    const next = resolveNewUrl(img.getAttribute('src'));
    if (!next) return;
    const encoded = contentDaLiveHrefForAttribute(next);
    img.setAttribute('src', encoded);
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
    glaasName: ensureLeadingSlash(siteRelativePathFromContentDaLiveUrl(contentDaLiveUrl)),
  }));
  return { htmlGlaasName, images };
}

export function buildMultimodalTextAsset({
  pagePath,
  signedUrl,
  targetLocales,
  pagePreviewUrl,
  translationMetadata,
  languageContext,
}) {
  return {
    type: 'TEXT',
    name: pagePath,
    parentAsset: pagePath,
    signedUrl,
    targetLocales,
    ...(pagePreviewUrl && { sourcePreviewUrlPage: pagePreviewUrl }),
    ...(translationMetadata && Object.keys(translationMetadata).length > 0 && {
      langMetadata: translationMetadata,
    }),
    ...(languageContext && Object.keys(languageContext).length > 0 && { languageContext }),
  };
}

async function fetchMultimodalImage({ imageIndex, imageUrl, logRequest }) {
  const imageAssetName = siteRelativePathFromContentDaLiveUrl(imageUrl);
  const imageSourceUrl = contentDaLiveToDaSourceUrl(imageUrl);
  logRequest?.('fetch-image', { imageIndex, contentDaLiveUrl: imageUrl, daSourceUrl: imageSourceUrl });
  let imageResp;
  try {
    imageResp = await daFetch(imageSourceUrl);
  } catch {
    return { error: 'Error fetching content.da.live image.', step: `fetch-image-${imageIndex}` };
  }
  if (!imageResp.ok) {
    return {
      error: 'Error fetching content.da.live image.',
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
  const assets = [buildMultimodalTextAsset({
    pagePath,
    signedUrl: htmlPut.putURL,
    targetLocales,
    pagePreviewUrl,
    translationMetadata,
    languageContext,
  })];

  let imageUrls = collectContentDaLiveImageUrls(htmlContent, { org, site });
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

export function checkMediaImageSize({ glaasName, mediaPath, sizeBytes, logRequest }) {
  const exceedsDocumentedLimit = sizeBytes > MEDIA_IMAGE_MAX_BYTES;
  const exceedsUploadLimit = sizeBytes > MEDIA_IMAGE_UPLOAD_MAX_BYTES;
  const detail = {
    glaasName,
    mediaPath,
    sizeBytes,
    sizeFormatted: formatMediaImageByteSize(sizeBytes),
    maxBytes: MEDIA_IMAGE_UPLOAD_MAX_BYTES,
    maxFormatted: formatMediaImageByteSize(MEDIA_IMAGE_UPLOAD_MAX_BYTES),
    documentedMaxBytes: MEDIA_IMAGE_MAX_BYTES,
    documentedMaxFormatted: formatMediaImageByteSize(MEDIA_IMAGE_MAX_BYTES),
    exceedsUploadLimit,
    exceedsDocumentedLimit,
  };
  logRequest?.('media-image-size', detail);
  if (!logRequest) {
    console.info('[GLaaS multimodal] Media image upload size:', detail);
  }
  if (exceedsUploadLimit) {
    console.warn('[GLaaS multimodal] Image exceeds observed Media Bus upload limit:', detail);
  } else if (exceedsDocumentedLimit) {
    console.warn('[GLaaS multimodal] Image exceeds documented Media Bus limit:', detail);
  }
  return detail;
}

function mediaImageSkipWarning({ glaasName, sizeFormatted, maxFormatted }) {
  return `Skipping oversized image (keeping source URL): ${glaasName} (${sizeFormatted} exceeds ${maxFormatted} upload limit). Compress or resize the source asset.`;
}

function skippedOversizedMediaUpload({ glaasName, sizeCheck }) {
  return {
    skipped: true,
    reason: 'exceeds_upload_limit',
    warning: mediaImageSkipWarning({
      glaasName,
      sizeFormatted: sizeCheck.sizeFormatted,
      maxFormatted: sizeCheck.maxFormatted,
    }),
    glaasName,
    ...sizeCheck,
  };
}

export async function postImageToDaMedia({
  org, site, langCode, glaasName, blob, contentType, logRequest,
}) {
  const mediaPath = buildTranslatedMediaPath({ langCode, glaasName });
  const type = blobContentTypeForDaSource({ daSourcePath: mediaPath, blob, contentType });
  const data = blob.type === type ? blob : new Blob([await blob.arrayBuffer()], { type });
  const sizeCheck = checkMediaImageSize({
    glaasName,
    mediaPath,
    sizeBytes: data.size,
    logRequest,
  });
  if (sizeCheck.exceedsUploadLimit) {
    return skippedOversizedMediaUpload({ glaasName, sizeCheck });
  }
  const body = new FormData();
  body.append('data', data, mediaPath.split('/').pop());
  try {
    const resp = await daFetch(`${DA_ORIGIN}/media/${org}/${site}${mediaPath}`, { method: 'POST', body });
    if (!resp.ok) {
      if (resp.status === 413) {
        return skippedOversizedMediaUpload({ glaasName, sizeCheck });
      }
      return { error: 'Error uploading image to media.', status: resp.status, glaasName, ...sizeCheck };
    }
    const json = await resp.json();
    const href = json?.uri ?? json?.url;
    if (!href) return { error: 'Missing media URI in response.', status: resp.status, json };
    return { url: href, status: resp.status };
  } catch {
    return { error: 'Error uploading image to media.' };
  }
}

async function saveMultimodalImageToMedia({
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

  const uploaded = await postImageToDaMedia({
    org,
    site,
    langCode,
    glaasName: image.glaasName,
    blob: downloaded.blob,
    contentType: downloaded.contentType,
    logRequest,
  });
  if (uploaded.skipped) {
    const detail = {
      glaasName: image.glaasName,
      contentDaLiveUrl: image.contentDaLiveUrl,
      warning: uploaded.warning,
      sizeFormatted: uploaded.sizeFormatted,
      maxFormatted: uploaded.maxFormatted,
    };
    logRequest?.('media-image-skip', detail);
    console.warn('[GLaaS multimodal] Skipping oversized image (keeping source URL):', detail);
    return {
      skipped: true,
      glaasName: image.glaasName,
      contentDaLiveUrl: image.contentDaLiveUrl,
      warning: uploaded.warning,
    };
  }
  if (uploaded.error) return uploaded;

  const sourceKey = contentDaLivePathKey(image.contentDaLiveUrl);
  return { sourceKey, url: uploaded.url };
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
    processItem: (image) => saveMultimodalImageToMedia({
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
