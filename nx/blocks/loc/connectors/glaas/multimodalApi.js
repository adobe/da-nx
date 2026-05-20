import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { buildGlaasCreateMetadata, getOpts, glaasSourcePreviewUrl } from './api.js';

const MULTIMODAL_LOG_KEY = 'glaas.multimodal.log';

function putUrlAssetName(assetName) {
  return assetName.replace(/^\/+/, '').replaceAll('/', '-');
}

export function glaasLogicalAssetName(assetName) {
  return assetName.startsWith('/') ? assetName : `/${assetName}`;
}

export function langstorePathFromGlaasName({ org, site, glaasName }) {
  const logical = glaasLogicalAssetName(glaasName);
  const sitePrefix = `/${org}/${site}`;
  if (logical === sitePrefix) return '/';
  if (logical.startsWith(`${sitePrefix}/`)) {
    return logical.slice(sitePrefix.length);
  }
  return logical;
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

export async function getPutUrlForFile({ origin, clientid, token, assetName, logRequest }) {
  const opts = getOpts(clientid, token);
  const pathName = putUrlAssetName(assetName);
  const url = `${origin}/api/l10n/v1.1/asset/getPutURLForFile/${pathName}`;
  logRequest?.('getPutURL', { method: 'GET', url, assetName, wireName: pathName });
  try {
    const resp = await fetch(url, opts);
    const json = await resp.json();
    if (!resp.ok) return { error: 'Error getting put URL for file.', status: resp.status, json };
    if (!json.putURL) return { error: 'Missing putURL in response.', status: resp.status, json };
    logRequest?.('getPutURL-response', { status: resp.status, assetName });
    return { putURL: json.putURL, instanceId: json.instanceId, status: resp.status };
  } catch {
    return { error: 'Error getting put URL for file.' };
  }
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

export async function getV2Asset(service, token, task, assetName, { storageSource = 'AZ', withMetadata } = {}) {
  const { clientid, origin } = service;
  const { name: taskName, code: lang, workflow } = task;
  const [product = '', project = ''] = workflow?.split('/') ?? [];
  const opts = getOpts(clientid, token);
  const sp = new URLSearchParams({ storageSource });
  if (withMetadata === true) sp.set('withMetadata', 'true');
  try {
    const path = glaasLogicalAssetName(assetName);
    const resp = await fetch(`${origin}/api/l10n/v2.0/tasks/${product}/${project}/${taskName}/assets/${lang}${path}?${sp}`, opts);
    const json = await resp.json();
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

/** One srcset candidate URL; strips trailing width/density descriptor (e.g. 600w, 2x) only. */
export function parseSrcsetUrl(part) {
  const trimmed = part.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\s+\d+(?:\.\d+)?[wx]\s*$/i, '').trim();
}

function collectSrcsetUrls(srcset) {
  return srcset.split(',').map(parseSrcsetUrl).filter(Boolean);
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

/** MVP: absolute https://content.da.live/... image URLs only (not relative ./media_ from DNT). */
export function collectContentDaLiveImageUrls(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const urls = new Set();
  doc.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (isAbsoluteContentDaLiveUrl(src)) urls.add(new URL(src).href);
  });
  doc.querySelectorAll('source[srcset]').forEach((source) => {
    collectSrcsetUrls(source.getAttribute('srcset') || '').forEach((src) => {
      if (isAbsoluteContentDaLiveUrl(src)) urls.add(new URL(src).href);
    });
  });
  return [...urls];
}

function assetNameFromUrl(url) {
  return decodeURIComponent(new URL(url).pathname);
}

const CONTENT_DA_LIVE_ORIGIN = `https://${CONTENT_DA_LIVE}`;

/** Map delivery URL to DA Admin source (same path after /source/). */
export function contentDaLiveToDaSourceUrl(imageUrl) {
  return imageUrl.replace(CONTENT_DA_LIVE_ORIGIN, `${DA_ORIGIN}/source`);
}

/** DA Admin source path for a translated image in langstore. */
export function buildLangstoreDaSourcePath({ org, site, langLocation, glaasName }) {
  return `/${org}/${site}${langLocation}${langstorePathFromGlaasName({ org, site, glaasName })}`;
}

/** AEM delivery URL for a langstore image (matches quick-edit pattern). */
export function buildLangstoreContentDaLiveUrl({ org, site, langLocation, glaasName }) {
  const path = buildLangstoreDaSourcePath({ org, site, langLocation, glaasName });
  return `https://content.da.live${path}`;
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

/** Strip /langstore/{lang} or /{locale} prefix; keep shared asset path (e.g. /acrobat/...). */
export function stripRegionalDeliveryPrefix(siteRelativePath) {
  if (!siteRelativePath?.startsWith('/')) return siteRelativePath ?? '';
  if (siteRelativePath.startsWith('/langstore/')) {
    const afterLangstore = siteRelativePath.slice('/langstore/'.length);
    const slashIdx = afterLangstore.indexOf('/');
    return slashIdx >= 0 ? afterLangstore.slice(slashIdx) : '/';
  }
  const slashIdx = siteRelativePath.indexOf('/', 1);
  return slashIdx >= 0 ? siteRelativePath.slice(slashIdx) : '/';
}

function replaceSrcsetUrls(srcset, resolveNewUrl) {
  return srcset.split(',').map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return part;
    const src = parseSrcsetUrl(trimmed);
    const descriptor = trimmed.slice(src.length).trim();
    const resolved = resolveNewUrl(src);
    if (!resolved) return part;
    const encoded = contentDaLiveHrefForAttribute(resolved);
    return descriptor ? `${encoded} ${descriptor}` : encoded;
  }).join(', ');
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
    if (next) img.setAttribute('src', contentDaLiveHrefForAttribute(next));
  });
  doc.querySelectorAll('source[srcset]').forEach((source) => {
    const srcset = source.getAttribute('srcset');
    if (!srcset) return;
    source.setAttribute('srcset', replaceSrcsetUrls(srcset, resolveNewUrl));
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

/** Map one v2 get-asset probe to v1.2-style asset status for countMultimodalTranslatedPages. */
export function v2AssetStatusFromProbe(assetName, meta) {
  const logical = glaasLogicalAssetName(assetName);
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

async function probeMultimodalAssetStatuses({
  service, token, task, langCode, assetNames,
}) {
  const langTask = { ...task, code: langCode };
  const probes = await Promise.all(
    assetNames.map(async (assetName) => {
      const meta = await getV2Asset(service, token, langTask, assetName);
      return v2AssetStatusFromProbe(assetName, meta);
    }),
  );
  return probes;
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

  const subtasks = await Promise.all(
    langs.map(async (lang) => {
      const assets = await probeMultimodalAssetStatuses({
        service,
        token,
        task,
        langCode: lang.code,
        assetNames,
      });
      const allCompleted = assets.every((asset) => asset.status === 'COMPLETED');
      return {
        targetLocale: lang.code,
        status: allCompleted ? 'COMPLETED' : 'IN_PROGRESS',
        assets,
      };
    }),
  );

  const anyNotFound = subtasks.some((subtask) => (
    subtask.assets.some((asset) => asset.status === 'NOT_FOUND')
  ));
  if (anyNotFound) {
    return { status: 404, json: subtasks };
  }

  return { status: 200, json: subtasks };
}

export function countMultimodalTranslatedPages(pageAssets, assets) {
  const completedNames = new Set(
    (assets ?? [])
      .filter((asset) => asset.status === 'COMPLETED')
      .map((asset) => glaasLogicalAssetName(asset.assetName ?? '')),
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
  const htmlGlaasName = glaasLogicalAssetName(htmlAssetName);
  const images = imageUrls.map((contentDaLiveUrl) => {
    const pathname = assetNameFromUrl(contentDaLiveUrl);
    return {
      contentDaLiveUrl,
      glaasName: glaasLogicalAssetName(pathname),
    };
  });
  return { htmlGlaasName, images };
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

  const pagePath = glaasLogicalAssetName(htmlAssetName);
  const pagePreviewUrl = sourcePreviewUrl ?? glaasSourcePreviewUrl(aemHref);
  const assets = [{
    type: 'TEXT',
    name: pagePath,
    signedUrl: htmlPut.putURL,
    targetLocales,
    ...(pagePreviewUrl && { sourcePreviewUrlPage: pagePreviewUrl }),
  }];

  let imageUrls = collectContentDaLiveImageUrls(htmlContent);
  if (maxImages != null) imageUrls = imageUrls.slice(0, maxImages);
  logRequest?.('collect-images', { htmlAssetName, count: imageUrls.length, imageUrls });
  const sentImageUrls = [];

  for (let i = 0; i < imageUrls.length; i += 1) {
    const n = i + 1;
    const imageUrl = imageUrls[i];
    const imageAssetName = assetNameFromUrl(imageUrl);
    const imageSourceUrl = contentDaLiveToDaSourceUrl(imageUrl);
    logRequest?.('fetch-image', { n, contentDaLiveUrl: imageUrl, daSourceUrl: imageSourceUrl });
    let imageResp;
    try {
      imageResp = await daFetch(imageSourceUrl);
    } catch {
      return { error: 'Error fetching content.da.live image.', step: `fetch-image-${n}` };
    }
    if (!imageResp.ok) {
      return {
        error: 'Error fetching content.da.live image.',
        step: `fetch-image-${n}`,
        status: imageResp.status,
      };
    }

    const imagePut = await getPutUrlForFile({
      origin, clientid, token, assetName: imageAssetName, logRequest,
    });
    if (imagePut.error) return { error: imagePut.error, step: `getPutURL-image-${n}`, ...imagePut };

    const imageBlob = await imageResp.blob();
    const imageUpload = await putAssetToSignedUrl({
      putURL: imagePut.putURL,
      body: imageBlob,
      contentType: imageBlob.type || 'image/png',
      logRequest,
      putLabel: `image-${n}`,
    });
    if (imageUpload.error) return { error: imageUpload.error, step: `put-image-${n}`, ...imageUpload };

    assets.push({
      type: 'IMAGE',
      name: glaasLogicalAssetName(imageAssetName),
      parentAsset: pagePath,
      signedUrl: imagePut.putURL,
      targetLocales,
      ...(pagePreviewUrl && { sourcePreviewUrlPage: pagePreviewUrl }),
    });
    sentImageUrls.push(imageUrl);
  }

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
    const fetched = await fetchBlobFromSignedUrl(meta.json.signedURL);
    if (fetched.error) return fetched;
    return fetched;
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

function isGenericBlobType(type) {
  return !type || type === 'application/octet-stream';
}

/** Pick a concrete MIME for DA /source uploads (GLaaS often returns octet-stream). */
export function blobContentTypeForDaSource({ daSourcePath, blob, contentType }) {
  const fromPath = mimeTypeForPath(daSourcePath);
  if (fromPath) return fromPath;
  if (!isGenericBlobType(contentType)) return contentType;
  if (!isGenericBlobType(blob?.type)) return blob.type;
  return contentType || blob?.type || 'application/octet-stream';
}

export async function saveBlobToDaSource(daSourcePath, blob, contentType) {
  const type = blobContentTypeForDaSource({ daSourcePath, blob, contentType });
  const data = blob.type === type ? blob : new Blob([await blob.arrayBuffer()], { type });
  const body = new FormData();
  body.append('data', data, daSourcePath.split('/').pop());
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${daSourcePath}`, { method: 'POST', body });
    if (!resp.ok) return { error: 'Error saving asset to DA.', status: resp.status };
    return { status: resp.status };
  } catch {
    return { error: 'Error saving asset to DA.' };
  }
}

/**
 * MULTIMODAL save: download images → langstore, rewrite HTML URLs, return translated HTML.
 */
export async function prepareMultimodalPageForSave({
  service,
  token,
  task,
  org,
  site,
  langLocation,
  pageAsset,
  htmlAssetName,
}) {
  const pathToNewUrl = new Map();

  for (const image of pageAsset.images) {
    const downloaded = await downloadMultimodalAssetBlob(service, token, task, image.glaasName);
    if (downloaded.error) return downloaded;

    const daPath = buildLangstoreDaSourcePath({
      org,
      site,
      langLocation,
      glaasName: image.glaasName,
    });
    const saved = await saveBlobToDaSource(daPath, downloaded.blob, downloaded.contentType);
    if (saved.error) return saved;

    const newUrl = buildLangstoreContentDaLiveUrl({
      org,
      site,
      langLocation,
      glaasName: image.glaasName,
    });
    const sourceKey = contentDaLivePathKey(image.contentDaLiveUrl);
    if (sourceKey) pathToNewUrl.set(sourceKey, newUrl);
  }

  const htmlDownload = await downloadMultimodalAsset(service, token, task, htmlAssetName);
  if (htmlDownload?.error) return { error: htmlDownload.error };

  const text = pageAsset.images.length
    ? rewriteContentDaLiveImageUrls(htmlDownload, pathToNewUrl)
    : htmlDownload;

  const mediaPaths = pageAsset.images.map((image) => buildLangstoreDaSourcePath({
    org,
    site,
    langLocation,
    glaasName: image.glaasName,
  }));

  return { text, mediaPaths };
}
