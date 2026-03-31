import { Domains, MEDIA_UNDERSCORE_PREFIX, DA_ETC_ORIGIN } from './constants.js';

let mediaHashRuntimeHostUrl = null;
let mediaHashPreviewHostUrl = null;
const previewPreferredMediaKeys = new Set();

function toAemRuntimeHostname(hostname) {
  if (!hostname) return hostname;
  return hostname
    .replace('.hlx.page', Domains.AEM_PAGE)
    .replace('.hlx.live', Domains.AEM_LIVE);
}

function isMediaHashPath(pathname = '') {
  const fileName = pathname.split('/').pop() || '';
  return fileName.startsWith(MEDIA_UNDERSCORE_PREFIX);
}

function parseRuntimeHostUrl(hostValue) {
  if (!hostValue || typeof hostValue !== 'string') return null;
  const trimmed = hostValue.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
}

function normalizeRoute(route) {
  if (!route || typeof route !== 'string') return '';
  const trimmed = route.trim();
  if (!trimmed || trimmed === '/') return '';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, '');
}

function normalizePathname(pathname = '') {
  if (!pathname) return '/';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function joinUrlPath(basePath, pathname) {
  const normalizedBasePath = normalizeRoute(basePath);
  const normalizedPathname = normalizePathname(pathname);

  if (!normalizedBasePath) return normalizedPathname;
  if (normalizedPathname === normalizedBasePath
    || normalizedPathname.startsWith(`${normalizedBasePath}/`)) {
    return normalizedPathname;
  }

  return `${normalizedBasePath}${normalizedPathname}`;
}

function stripKnownBasePath(pathname, runtimeHostUrls = []) {
  const normalizedPathname = normalizePathname(pathname);

  for (const runtimeHostUrl of runtimeHostUrls) {
    const normalizedBasePath = normalizeRoute(runtimeHostUrl?.pathname);
    if (normalizedBasePath) {
      if (normalizedPathname === normalizedBasePath) return '/';
      if (normalizedPathname.startsWith(`${normalizedBasePath}/`)) {
        return normalizedPathname.slice(normalizedBasePath.length) || '/';
      }
    }
  }

  return normalizedPathname;
}

function applyRuntimeHostUrl(url, runtimeHostUrl, sourceRuntimeHostUrls = []) {
  if (!url || !runtimeHostUrl) return;

  url.protocol = runtimeHostUrl.protocol;
  url.host = runtimeHostUrl.host;
  const relativePath = stripKnownBasePath(url.pathname, sourceRuntimeHostUrls);
  url.pathname = joinUrlPath(runtimeHostUrl.pathname, relativePath);
}

function buildRuntimeUrl(runtimeHostUrl, mediaUrl) {
  if (!runtimeHostUrl) return '';

  const relativeUrl = new URL(mediaUrl, 'https://media-library.local');
  const resolvedUrl = new URL(runtimeHostUrl.toString());
  resolvedUrl.pathname = joinUrlPath(runtimeHostUrl.pathname, relativeUrl.pathname);
  resolvedUrl.search = relativeUrl.search;
  resolvedUrl.hash = relativeUrl.hash;
  return resolvedUrl.toString();
}

function getDefaultLiveRuntimeHostUrl(org, repo) {
  if (!org || !repo) return null;
  return parseRuntimeHostUrl(`https://main--${repo}--${org}${Domains.AEM_LIVE}`);
}

function getDefaultPreviewRuntimeHostUrl(org, repo) {
  if (!org || !repo) return null;
  return parseRuntimeHostUrl(`https://main--${repo}--${org}${Domains.AEM_PAGE}`);
}

function applyDefaultLiveHost(hostname) {
  return hostname
    .replace('.hlx.page', Domains.AEM_LIVE)
    .replace('.aem.page', Domains.AEM_LIVE)
    .replace('.hlx.live', Domains.AEM_LIVE);
}

function applyDefaultPreviewHost(hostname) {
  return hostname
    .replace('.hlx.page', Domains.AEM_PAGE)
    .replace('.aem.live', Domains.AEM_PAGE)
    .replace('.hlx.live', Domains.AEM_PAGE);
}

function getMediaIdentityKey(mediaUrl) {
  if (!mediaUrl) return '';

  try {
    const urlObj = mediaUrl.startsWith('http')
      ? new URL(mediaUrl)
      : new URL(mediaUrl, 'https://media-library.local');
    const filename = urlObj.pathname.split('/').pop();
    if (filename && filename.includes(MEDIA_UNDERSCORE_PREFIX)) {
      return filename;
    }
    return urlObj.pathname || mediaUrl.split('?')[0];
  } catch {
    return mediaUrl.split('?')[0];
  }
}

function getMediaHashRuntimeHostUrl(org, repo, preferPreview = false) {
  if (preferPreview) {
    return mediaHashPreviewHostUrl || getDefaultPreviewRuntimeHostUrl(org, repo);
  }
  return mediaHashRuntimeHostUrl || getDefaultLiveRuntimeHostUrl(org, repo);
}

function getKnownMediaHashRuntimeHostUrls(org, repo) {
  return [
    mediaHashRuntimeHostUrl || getDefaultLiveRuntimeHostUrl(org, repo),
    mediaHashPreviewHostUrl || getDefaultPreviewRuntimeHostUrl(org, repo),
  ].filter(Boolean);
}

function preferConfiguredPreviewHost(url, org, repo) {
  if (!url?.hostname) return;

  const previewHostUrl = getMediaHashRuntimeHostUrl(org, repo, true);
  if (previewHostUrl) {
    applyRuntimeHostUrl(url, previewHostUrl, getKnownMediaHashRuntimeHostUrls(org, repo));
    return;
  }

  url.hostname = applyDefaultPreviewHost(url.hostname);
}

function preferConfiguredHostForMediaHash(url, org, repo, preferPreview = false) {
  if (!url?.hostname || !isMediaHashPath(url.pathname)) return;
  const runtimeHostUrl = getMediaHashRuntimeHostUrl(org, repo, preferPreview);

  if (runtimeHostUrl) {
    applyRuntimeHostUrl(url, runtimeHostUrl, getKnownMediaHashRuntimeHostUrls(org, repo));
    return;
  }
  url.hostname = preferPreview
    ? applyDefaultPreviewHost(url.hostname)
    : applyDefaultLiveHost(url.hostname);
}

export function setMediaHashRuntimeHosts(
  hostValue,
  liveHostValue,
  previewHostValue,
  org,
  repo,
  _ = '',
) {
  // Always use previewHost for media-hash URLs, never the production host
  // Media-hash files on .aem.page match the audit log content
  mediaHashRuntimeHostUrl = parseRuntimeHostUrl(previewHostValue)
    || getDefaultPreviewRuntimeHostUrl(org, repo);

  mediaHashPreviewHostUrl = parseRuntimeHostUrl(previewHostValue)
    || getDefaultPreviewRuntimeHostUrl(org, repo);

  return mediaHashRuntimeHostUrl;
}

export function clearMediaHashRuntimeHost() {
  mediaHashRuntimeHostUrl = null;
  mediaHashPreviewHostUrl = null;
  previewPreferredMediaKeys.clear();
}

export function preferPreviewForMediaUrl(mediaUrl) {
  const key = getMediaIdentityKey(mediaUrl);
  if (!key || previewPreferredMediaKeys.has(key)) return false;
  previewPreferredMediaKeys.add(key);
  return true;
}

export function isPreviewPreferredForMediaUrl(mediaUrl) {
  const key = getMediaIdentityKey(mediaUrl);
  return !!key && previewPreferredMediaKeys.has(key);
}

/** Normalize HLX hostnames to AEM delivery suffixes for comparison. */
function hlxToAemHost(hostname) {
  if (!hostname) return '';
  return hostname
    .replace('.hlx.page', Domains.AEM_PAGE)
    .replace('.hlx.live', Domains.AEM_LIVE);
}

function matchesRepoDeliveryHost(hostname, org, repo) {
  const h = hlxToAemHost(hostname);
  return h === `main--${repo}--${org}.aem.page` || h === `main--${repo}--${org}.aem.live`;
}

/**
 * True for this site's preview/live delivery URLs or repo-relative paths only.
 * Pass the **raw** path/URL from medialog or audit — not a value already passed through
 * canonicalizeMediaUrl(), which rewrites some internal marketing URLs onto the delivery host.
 */
export function isDeliveryStandaloneUrl(mediaUrl, org, repo) {
  if (!mediaUrl || !org || !repo) return false;

  const raw = String(mediaUrl).trim();
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return true;
  }

  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://invalid.local${raw}`);
    return matchesRepoDeliveryHost(url.hostname, org, repo);
  } catch {
    return false;
  }
}

export function isInternalToSite(urlString, org, repo) {
  if (!org || !repo || !urlString) return false;

  if (urlString.startsWith('/') && !urlString.startsWith('//')) {
    return true;
  }

  try {
    const url = new URL(urlString);

    const isAemDomain = url.hostname === `main--${repo}--${org}.aem.page`
        || url.hostname === `main--${repo}--${org}.aem.live`;

    const hasOrgRepoPath = url.pathname.startsWith(`/${org}/${repo}/`);

    const isProductionInternal = url.hostname === 'www.adobe.com'
        && !url.pathname.startsWith('/etc/')
        && !url.pathname.startsWith('/content/dam/');

    return isAemDomain || hasOrgRepoPath || isProductionInternal;
  } catch {
    return false;
  }
}

export function canonicalizeMediaUrl(mediaUrl, org, repo) {
  if (!mediaUrl) return '';

  const preferPreview = isPreviewPreferredForMediaUrl(mediaUrl);

  try {
    const url = new URL(mediaUrl);
    url.hostname = toAemRuntimeHostname(url.hostname);

    // Normalize internal absolute URLs to .aem.page (matches audit log content)
    if (org && repo && isInternalToSite(url.toString(), org, repo)) {
      url.hostname = `main--${repo}--${org}${Domains.AEM_PAGE}`;

      // Remove /{org}/{repo}/ prefix from path
      url.pathname = url.pathname.replace(`/${org}/${repo}`, '');
    }

    if (preferPreview) {
      if (isMediaHashPath(url.pathname)) {
        preferConfiguredHostForMediaHash(url, org, repo, true);
      } else {
        preferConfiguredPreviewHost(url, org, repo);
      }
    } else {
      preferConfiguredHostForMediaHash(url, org, repo);
    }

    return url.toString();
  } catch (_) {
    if (org && repo) {
      const cleanUrl = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
      const runtimeHostUrl = isMediaHashPath(cleanUrl)
        ? getMediaHashRuntimeHostUrl(org, repo, preferPreview)
        : null;
      if (runtimeHostUrl) {
        return buildRuntimeUrl(runtimeHostUrl, cleanUrl);
      }
      const defaultDomain = preferPreview ? Domains.AEM_PAGE : Domains.AEM_LIVE;
      return `https://main--${repo}--${org}${defaultDomain}${cleanUrl}`;
    }
    return mediaUrl;
  }
}

/** Parent folder path (pathname minus filename) after canonicalizeMediaUrl. */
export function folderPathFromAssetUrl(mediaUrl, org, repo) {
  if (!mediaUrl || !org || !repo) return '';

  try {
    const resolved = canonicalizeMediaUrl(mediaUrl, org, repo);
    const url = new URL(resolved);
    let { pathname } = url;
    pathname = pathname.replace(/\/$/, '');
    const lastSlash = pathname.lastIndexOf('/');
    if (lastSlash <= 0) return '';
    return pathname.slice(0, lastSlash);
  } catch {
    return '';
  }
}

export function isExternalUrl(url) {
  if (!url) return false;
  const normalizedUrl = canonicalizeMediaUrl(url);
  return !normalizedUrl.includes(Domains.AEM_LIVE) && !normalizedUrl.includes(Domains.AEM_PAGE);
}

export function resolveMediaUrl(mediaUrl, org, repo) {
  return canonicalizeMediaUrl(mediaUrl, org, repo);
}

export function parseMediaUrl(mediaUrl) {
  try {
    const url = new URL(canonicalizeMediaUrl(mediaUrl));
    return {
      origin: url.origin,
      path: `${url.pathname}${url.search}${url.hash}`,
      fullUrl: url.toString(),
    };
  } catch (e) {
    return {
      origin: '',
      path: mediaUrl,
      fullUrl: mediaUrl,
    };
  }
}

export function normalizeUrl(url) {
  if (!url) return '';

  try {
    const urlObj = new URL(canonicalizeMediaUrl(url));
    const { pathname } = urlObj;
    if (pathname.toLowerCase().endsWith('.svg')) {
      return `${urlObj.protocol}//${urlObj.host}${pathname}`;
    }
    return urlObj.pathname;
  } catch {
    return url;
  }
}

export function parseOrgRepoFromUrl(siteUrl) {
  if (!siteUrl) {
    throw new Error('Site URL is required');
  }

  try {
    const url = new URL(siteUrl);
    const { hostname, pathname } = url;

    const match = hostname.match(/^main--(.+?)--([^.]+)\.aem\.page$/);

    if (match) {
      const [, repo, org] = match;
      const path = pathname && pathname !== '/' ? pathname.replace(/\/+$/, '') : '';
      return { org, repo, path };
    }

    throw new Error(`Unable to parse AEM URL format from: ${siteUrl}`);
  } catch (e) {
    throw new Error(`Invalid URL format: ${siteUrl}. Expected format: https://main--site--org.aem.page`);
  }
}

// Returns stable key for dedupe (filename or pathname).
export function getDedupeKey(url) {
  if (!url) return '';

  try {
    const urlObj = new URL(canonicalizeMediaUrl(url));
    const { pathname } = urlObj;
    const filename = pathname.split('/').pop();

    if (filename && filename.includes(MEDIA_UNDERSCORE_PREFIX)) {
      return filename;
    }

    return pathname;
  } catch (e) {
    return url.split('?')[0];
  }
}

// CORS proxy fetch - self-contained for media-library
export function etcFetch(href, api, options) {
  const url = `${DA_ETC_ORIGIN}/${api}?url=${encodeURIComponent(href)}`;
  const opts = options || {};
  return fetch(url, opts);
}
