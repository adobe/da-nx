import { DA_ORIGIN } from '../../../../public/utils/constants.js';
import { daFetch } from '../../../../utils/daFetch.js';
import {
  buildLangstoreDaSourcePath,
  buildLangstoreContentDaLiveUrl,
  contentDaLivePathKey,
  parseSrcsetUrl,
  contentDaLiveHrefForAttribute,
  rewriteContentDaLiveImageUrls,
  stripRegionalDeliveryPrefix,
} from '../../connectors/glaas/multimodalApi.js';
import { groupUrlsByWorkflow } from '../../connectors/glaas/locPageRules.js';
import { convertPath, createSnapshotPrefix, fetchConfig } from '../../utils/utils.js';

const CONTENT_DA_LIVE = 'content.da.live';

function workflowKeyIsMultimodal(workflowKey) {
  return workflowKey.endsWith('/MULTIMODAL');
}

/** Workflow task for this page on the lang, if any. */
export function findMultimodalWorkflowTask(lang, suppliedPath) {
  const tasks = lang.translation?.workflowTasks ?? {};
  return Object.values(tasks).find(
    (task) => task.workflowName === 'MULTIMODAL' && task.urls?.includes(suppliedPath),
  );
}

/** MULTIMODAL from persisted task metadata or loc-page-rules. */
export function isMultimodalPageForLang({ lang, suppliedPath, config }) {
  if (findMultimodalWorkflowTask(lang, suppliedPath)) return true;
  if (!config) return false;
  const langObjs = [{
    code: lang.code,
    workflow: lang.workflow,
    workflowName: lang.workflowName,
  }];
  const groups = groupUrlsByWorkflow([suppliedPath], langObjs, config);
  return Object.keys(groups).some(workflowKeyIsMultimodal);
}

export function mediaDaPathsFromPageAssets({ org, site, langLocation, pageAsset }) {
  if (!pageAsset?.images?.length) return [];
  return pageAsset.images.map((image) => buildLangstoreDaSourcePath({
    org,
    site,
    langLocation,
    glaasName: image.glaasName,
  }));
}

function isLangstoreContentDaLiveHref(href, org, site, langLocation) {
  if (!href) return false;
  try {
    const u = new URL(href, `https://${CONTENT_DA_LIVE}`);
    if (u.hostname !== CONTENT_DA_LIVE) return false;
    const root = `/${org}/${site}${langLocation}`;
    return decodeURIComponent(u.pathname).startsWith(root);
  } catch {
    return false;
  }
}

function collectSrcsetUrls(srcset) {
  return srcset.split(',').map(parseSrcsetUrl).filter(Boolean);
}

/** content.da.live image URLs in HTML that live under this lang's langstore prefix. */
export function collectLangstoreContentDaLiveImageUrls(html, org, site, langLocation) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const urls = new Set();
  const add = (href) => {
    if (isLangstoreContentDaLiveHref(href, org, site, langLocation)) urls.add(new URL(href).href);
  };
  doc.querySelectorAll('img[src]').forEach((img) => add(img.getAttribute('src')));
  doc.querySelectorAll('source[srcset]').forEach((source) => {
    collectSrcsetUrls(source.getAttribute('srcset') || '').forEach(add);
  });
  return [...urls];
}

export function daSourcePathFromContentDaLiveHref(href) {
  try {
    return decodeURIComponent(new URL(href).pathname);
  } catch {
    return undefined;
  }
}

export function daPathsFromLangstoreHtml({ html, org, site, langLocation }) {
  return collectLangstoreContentDaLiveImageUrls(html, org, site, langLocation)
    .map(daSourcePathFromContentDaLiveHref)
    .filter(Boolean);
}

/** AEM path after langstore prefix (for locale rollout dest). */
export function aemBasePathFromLangstoreSource({ org, site, langLocation, daSourcePath }) {
  const prefix = `/${org}/${site}${langLocation}`;
  if (daSourcePath.startsWith(prefix)) {
    return daSourcePath.slice(prefix.length);
  }
  return daSourcePath.replace(`/${org}/${site}`, '');
}

export function buildLocaleContentDaLiveUrl({ org, site, localeCode, glaasName }) {
  const logical = glaasName.startsWith('/') ? glaasName : `/${glaasName}`;
  const sitePrefix = `/${org}/${site}`;
  let relative = logical;
  if (logical.startsWith(`${sitePrefix}/`)) {
    relative = logical.slice(sitePrefix.length);
  }
  const localePrefix = localeCode.replace(/\/$/, '');
  return `https://${CONTENT_DA_LIVE}/${org}/${site}${localePrefix}${relative}`;
}

export function buildLocaleImageUrlMap({ org, site, langLocation, localeCode, glaasNames }) {
  const map = new Map();
  glaasNames.forEach((glaasName) => {
    const langstoreUrl = buildLangstoreContentDaLiveUrl({ org, site, langLocation, glaasName });
    const localeUrl = buildLocaleContentDaLiveUrl({ org, site, localeCode, glaasName });
    const key = contentDaLivePathKey(langstoreUrl);
    if (key) map.set(key, localeUrl);
  });
  return map;
}

export function buildLocaleImageUrlMapFromLangstoreHtml({
  html, org, site, langLocation, localeCode,
}) {
  const map = new Map();
  const localePrefix = localeCode.replace(/\/$/, '');
  const sitePrefix = `/${org}/${site}`;
  const localePathPrefix = `${sitePrefix}${localePrefix}`;

  collectLangstoreContentDaLiveImageUrls(html, org, site, langLocation).forEach((href) => {
    const key = contentDaLivePathKey(href);
    if (!key) return;
    const assetPath = stripRegionalDeliveryPrefix(key.slice(sitePrefix.length));
    map.set(key, contentDaLiveHrefForAttribute(`https://${CONTENT_DA_LIVE}${localePathPrefix}${assetPath}`));
  });
  return map;
}

/** pageAssets glaas names + langstore URLs scanned from HTML (tier 2 / no task). */
export function buildLocaleImageUrlMapForRollout({
  html, org, site, langLocation, localeCode, glaasNames = [],
}) {
  const fromNames = buildLocaleImageUrlMap({ org, site, langLocation, localeCode, glaasNames });
  if (!html) return fromNames;
  const fromHtml = buildLocaleImageUrlMapFromLangstoreHtml({
    html, org, site, langLocation, localeCode,
  });
  return new Map([...fromNames, ...fromHtml]);
}

export function rewriteHtmlForLocaleRollout(html, pathToNewUrl) {
  if (!html || !pathToNewUrl?.size) return html;
  return rewriteContentDaLiveImageUrls(html, pathToNewUrl);
}

export function extFromPath(path) {
  const name = path.split('/').pop() ?? '';
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : 'html';
}

export function mimeTypeForExt(ext) {
  const types = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    avif: 'image/avif',
    json: 'application/json',
  };
  return types[ext] ?? 'application/octet-stream';
}

/** Tier-2: langstore HTML references langstore content.da.live images. */
export function isMultimodalRolloutFromLangstoreHtml({ html, org, site, langLocation }) {
  if (!html) return false;
  return daPathsFromLangstoreHtml({ html, org, site, langLocation }).length > 0;
}

/** Rules/task (tier 1) or langstore image refs in HTML (tier 2). */
export function shouldRunMultimodalRollout({
  lang, suppliedPath, config, html, org, site, langLocation,
}) {
  if (isMultimodalPageForLang({ lang, suppliedPath, config })) return true;
  return isMultimodalRolloutFromLangstoreHtml({ html, org, site, langLocation });
}

/**
 * Resolve langstore image DA paths for rollout (caller must gate with shouldRunMultimodalRollout).
 * pageAssets when present, else HTML scan.
 */
export async function resolveMultimodalMediaDaPathsForRollout({
  org,
  site,
  lang,
  suppliedPath,
  langstorePageSource,
  html,
}) {
  const task = findMultimodalWorkflowTask(lang, suppliedPath);
  const pageAsset = task?.pageAssets?.[suppliedPath];
  if (pageAsset?.images?.length) {
    return mediaDaPathsFromPageAssets({
      org, site, langLocation: lang.location, pageAsset,
    });
  }

  if (html) {
    return daPathsFromLangstoreHtml({ html, org, site, langLocation: lang.location });
  }

  if (!langstorePageSource) return [];

  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${langstorePageSource}`);
    if (!resp.ok) return [];
    const fetchedHtml = await resp.text();
    return daPathsFromLangstoreHtml({ html: fetchedHtml, org, site, langLocation: lang.location });
  } catch {
    return [];
  }
}

async function copyMultimodalImageToLocale({
  org, site, langLocation, localeCode, daSource, copyFn, copyLabel,
}) {
  const aemBasePath = aemBasePathFromLangstoreSource({
    org, site, langLocation, daSourcePath: daSource,
  });
  const { daDestPath } = convertPath({
    path: aemBasePath,
    destPrefix: localeCode,
  });
  const resp = await daFetch(`${DA_ORIGIN}/source${daSource}`);
  if (!resp.ok) return;
  const blob = await resp.blob();
  const ext = extFromPath(aemBasePath);
  await copyFn({
    source: daSource,
    destination: `/${org}/${site}${daDestPath}`,
    sourceContent: blob,
    contentType: blob.type || mimeTypeForExt(ext),
    isMultimodalMedia: true,
    hasExt: true,
    org,
    site,
  }, copyLabel);
}

/** Langstore DA paths → rollout media fetch rows. */
export function buildMultimodalRolloutMediaEntries({ org, site, langLocation, daSourcePaths }) {
  const prefix = `/${org}/${site}`;
  const seen = new Set();
  const entries = [];

  daSourcePaths.forEach((daSourcePath) => {
    if (!daSourcePath || seen.has(daSourcePath) || !daSourcePath.startsWith(prefix)) return;
    seen.add(daSourcePath);
    const aemBasePath = aemBasePathFromLangstoreSource({
      org, site, langLocation, daSourcePath,
    });
    const ext = extFromPath(aemBasePath);
    entries.push({
      source: daSourcePath,
      aemBasePath,
      ext,
      isMultimodalMedia: true,
      hasExt: true,
    });
  });

  return entries;
}

/** Resolve langstore image DA paths when already gated as multimodal (rules/task). */
export async function resolveMultimodalMediaDaPaths({
  org,
  site,
  lang,
  suppliedPath,
  config,
  langstorePageSource,
}) {
  if (!isMultimodalPageForLang({ lang, suppliedPath, config })) return [];
  return resolveMultimodalMediaDaPathsForRollout({
    org, site, lang, suppliedPath, langstorePageSource,
  });
}

/** Project suppliedPath from da-rollout page path under a langstore prefix. */
export function suppliedPathFromPagePath(pagePath, langLocation) {
  const normalized = pagePath.endsWith('.html') ? pagePath.slice(0, -5) : pagePath;
  if (langLocation && langLocation !== '/' && normalized.startsWith(langLocation)) {
    const trimmed = normalized.slice(langLocation.length);
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

export function langCodeFromLangstoreLocation(langLocation) {
  const match = langLocation?.match(/^\/langstore\/([^/]+)/);
  return match?.[1] ?? 'en';
}

export function glaasNamesForRolloutRewrite({ pageAsset, daSourcePaths, org, site, langLocation }) {
  if (pageAsset?.images?.length) {
    return pageAsset.images.map((image) => image.glaasName);
  }
  return daSourcePaths.map((daPath) => {
    const prefix = `/${org}/${site}${langLocation}`;
    if (!daPath.startsWith(prefix)) return daPath;
    return daPath.slice(prefix.length);
  });
}

/**
 * Plugin rollout: multimodal images + rewritten HTML to locale, or plain copy.
 */
export async function rolloutMultimodalToLocale({
  org,
  site,
  langLocation,
  langCode,
  suppliedPath,
  config,
  langstorePageSource,
  localeCode,
  pageCopyUrl,
  copyFn,
  copyLabel,
}) {
  const lang = { code: langCode, location: langLocation };

  let html = '';
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${langstorePageSource}`);
    if (resp.ok) html = await resp.text();
  } catch { /* plain copy below */ }

  const multimodal = shouldRunMultimodalRollout({
    lang, suppliedPath, config, html, org, site, langLocation,
  });

  if (!multimodal) {
    await copyFn(pageCopyUrl, copyLabel);
    return;
  }

  const daPaths = await resolveMultimodalMediaDaPathsForRollout({
    org, site, lang, suppliedPath, langstorePageSource, html,
  });

  await Promise.all(daPaths.map((daSource) => copyMultimodalImageToLocale({
    org, site, langLocation, localeCode, daSource, copyFn, copyLabel,
  })));

  const task = findMultimodalWorkflowTask(lang, suppliedPath);
  const pageAsset = task?.pageAssets?.[suppliedPath];
  const glaasNames = glaasNamesForRolloutRewrite({
    pageAsset,
    daSourcePaths: daPaths,
    org,
    site,
    langLocation,
  });

  if (html) {
    const pathToNewUrl = buildLocaleImageUrlMapForRollout({
      org, site, langLocation, localeCode, glaasNames, html,
    });
    if (pathToNewUrl.size) {
      const rewritten = rewriteHtmlForLocaleRollout(html, pathToNewUrl);
      pageCopyUrl.sourceContent = new Blob([rewritten], { type: 'text/html' });
      await copyFn(pageCopyUrl, copyLabel);
      return;
    }
  }

  await copyFn(pageCopyUrl, copyLabel);
}

export const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif']);

export function isBinaryRolloutUrl(url) {
  if (url.isMultimodalMedia) return true;
  const ext = url.ext ?? extFromPath(url.source ?? url.aemBasePath ?? '');
  return url.hasExt && ext !== 'html';
}

export function resolveLocaleSourceContent(langUrl, {
  org, site, langLocation, localeCode, pageRolloutMeta,
}) {
  if (langUrl.isMultimodalMedia) return langUrl.content;
  if (!langUrl.content || typeof langUrl.content !== 'string' || !langUrl.suppliedPath) {
    return langUrl.sourceContent;
  }
  const { glaasNames = [] } = pageRolloutMeta.get(langUrl.suppliedPath) ?? {};
  const pathToNewUrl = buildLocaleImageUrlMapForRollout({
    html: langUrl.content, org, site, langLocation, localeCode, glaasNames,
  });
  return pathToNewUrl.size
    ? rewriteHtmlForLocaleRollout(langUrl.content, pathToNewUrl)
    : langUrl.sourceContent;
}

export async function collectMultimodalRolloutData({
  org, site, lang, projectUrls, snapshot, sourceLocation,
}) {
  const config = await fetchConfig(org, site);
  const snapshotPrefix = createSnapshotPrefix(snapshot);
  const seen = new Set();
  const mediaUrls = [];
  const pageRolloutMeta = new Map();

  await Promise.all(projectUrls.map(async (projectUrl) => {
    const { daDestPath } = convertPath({
      path: projectUrl.suppliedPath,
      sourcePrefix: sourceLocation,
      destPrefix: lang.location,
      snapshotPrefix,
    });
    const langstorePageSource = `/${org}/${site}${daDestPath}`;

    if (!shouldRunMultimodalRollout({
      lang,
      suppliedPath: projectUrl.suppliedPath,
      config,
      html: '',
      org,
      site,
      langLocation: lang.location,
    })) {
      try {
        const resp = await daFetch(`${DA_ORIGIN}/source${langstorePageSource}`);
        if (!resp.ok) return;
        const html = await resp.text();
        if (!isMultimodalRolloutFromLangstoreHtml({
          html, org, site, langLocation: lang.location,
        })) return;
        const daPaths = daPathsFromLangstoreHtml({
          html, org, site, langLocation: lang.location,
        });
        const glaasNames = glaasNamesForRolloutRewrite({
          pageAsset: null,
          daSourcePaths: daPaths,
          org,
          site,
          langLocation: lang.location,
        });
        pageRolloutMeta.set(projectUrl.suppliedPath, { glaasNames });
        buildMultimodalRolloutMediaEntries({
          org, site, langLocation: lang.location, daSourcePaths: daPaths,
        }).forEach((entry) => {
          if (!seen.has(entry.source)) {
            seen.add(entry.source);
            mediaUrls.push(entry);
          }
        });
      } catch { /* not multimodal */ }
      return;
    }

    const daPaths = await resolveMultimodalMediaDaPaths({
      org, site, lang, suppliedPath: projectUrl.suppliedPath, config, langstorePageSource,
    });
    const task = findMultimodalWorkflowTask(lang, projectUrl.suppliedPath);
    const pageAsset = task?.pageAssets?.[projectUrl.suppliedPath];
    const glaasNames = glaasNamesForRolloutRewrite({
      pageAsset, daSourcePaths: daPaths, org, site, langLocation: lang.location,
    });
    pageRolloutMeta.set(projectUrl.suppliedPath, { glaasNames });
    buildMultimodalRolloutMediaEntries({
      org, site, langLocation: lang.location, daSourcePaths: daPaths,
    }).forEach((entry) => {
      if (!seen.has(entry.source)) {
        seen.add(entry.source);
        mediaUrls.push(entry);
      }
    });
  }));

  return { mediaUrls, pageRolloutMeta };
}

/**
 * da-rollout plugin: multimodal rollout from langstore when loc-page-rules say MULTIMODAL.
 * Returns null → use plain copyFn (not langstore, or page not flagged).
 */
export async function getMultimodalRollout({ org, site, path, currPrefix }) {
  if (!currPrefix?.startsWith('/langstore/')) return null;

  const langLocation = currPrefix;
  const langCode = langCodeFromLangstoreLocation(langLocation);
  const suppliedPath = suppliedPathFromPagePath(path, currPrefix);
  const config = await fetchConfig(org, site);
  const lang = { code: langCode, location: langLocation };

  if (!isMultimodalPageForLang({ lang, suppliedPath, config })) return null;

  const langstorePageSource = `/${org}/${site}${path.endsWith('.html') ? path : `${path}.html`}`;

  return {
    copyFn: async ({ prefix, copyLabel, copyFn: save }) => {
      const pageCopyUrl = {
        source: prefix.source, destination: prefix.destination,
      };
      await rolloutMultimodalToLocale({
        org,
        site,
        langLocation,
        langCode,
        suppliedPath,
        config,
        langstorePageSource,
        localeCode: prefix.path,
        pageCopyUrl,
        copyFn: save,
        copyLabel,
      });
      prefix.status = pageCopyUrl.status === 'success' ? 'success' : 'error';
    },
  };
}
