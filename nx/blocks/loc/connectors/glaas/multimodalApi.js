import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { daFetch } from '../../../../utils/daFetch.js';
import { buildGlaasCreateMetadata, getOpts, glaasSourcePreviewUrl } from './api.js';

const MULTIMODAL_LOG_KEY = 'glaas.multimodal.log';

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

export async function getV2Asset(service, token, task, assetName) {
  const { clientid, origin } = service;
  const { name: taskName, code: lang, workflow } = task;
  const [product = '', project = ''] = workflow?.split('/') ?? [];
  const opts = getOpts(clientid, token);
  try {
    const path = ensureLeadingSlash(assetName);
    const resp = await fetch(`${origin}/api/l10n/v2.0/tasks/${product}/${project}/${taskName}/assets/${lang}${path}`, opts);
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

/** MVP: absolute https://content.da.live/... image URLs only (not relative ./media_ from DNT). */
export function collectContentDaLiveImageUrls(html, { org, site } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const urls = new Set();
  doc.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src');
    if (isProjectContentDaLiveUrl(src, org, site)) urls.add(new URL(src).href);
  });
  doc.querySelectorAll('source[srcset]').forEach((source) => {
    collectSrcsetUrls(source.getAttribute('srcset') || '').forEach((src) => {
      if (isProjectContentDaLiveUrl(src, org, site)) urls.add(new URL(src).href);
    });
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
  const sentImageUrls = [];

  for (let i = 0; i < imageUrls.length; i += 1) {
    const n = i + 1;
    const imageUrl = imageUrls[i];
    const imageAssetName = siteRelativePathFromContentDaLiveUrl(imageUrl);
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
      name: ensureLeadingSlash(imageAssetName),
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

export async function postImageToDaMedia({
  org, site, langCode, glaasName, blob, contentType,
}) {
  const mediaPath = buildTranslatedMediaPath({ langCode, glaasName });
  const type = blobContentTypeForDaSource({ daSourcePath: mediaPath, blob, contentType });
  const data = blob.type === type ? blob : new Blob([await blob.arrayBuffer()], { type });
  const body = new FormData();
  body.append('data', data, mediaPath.split('/').pop());
  try {
    const resp = await daFetch(`${DA_ORIGIN}/media/${org}/${site}${mediaPath}`, { method: 'POST', body });
    if (!resp.ok) return { error: 'Error uploading image to media.', status: resp.status };
    const json = await resp.json();
    const href = json?.uri ?? json?.url;
    if (!href) return { error: 'Missing media URI in response.', status: resp.status, json };
    return { url: href, status: resp.status };
  } catch {
    return { error: 'Error uploading image to media.' };
  }
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
}) {
  const pathToNewUrl = new Map();
  const locale = langCode ?? task.code;

  for (const image of pageAsset.images) {
    const downloaded = await downloadMultimodalAssetBlob(service, token, task, image.glaasName);
    if (downloaded.error) return downloaded;

    const uploaded = await postImageToDaMedia({
      org,
      site,
      langCode: locale,
      glaasName: image.glaasName,
      blob: downloaded.blob,
      contentType: downloaded.contentType,
    });
    if (uploaded.error) return uploaded;

    const sourceKey = contentDaLivePathKey(image.contentDaLiveUrl);
    if (sourceKey) pathToNewUrl.set(sourceKey, uploaded.url);
  }

  const htmlDownload = await downloadMultimodalAsset(service, token, task, htmlAssetName);
  if (htmlDownload?.error) return { error: htmlDownload.error };

  const text = pageAsset.images.length
    ? rewriteContentDaLiveImageUrls(htmlDownload, pathToNewUrl)
    : htmlDownload;

  return { text };
}
