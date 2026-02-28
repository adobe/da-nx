import { Domains, MEDIA_UNDERSCORE_PREFIX } from './constants.js';

export function isExternalUrl(url) {
  if (!url) return false;
  return !url.includes(Domains.AEM_LIVE) && !url.includes(Domains.AEM_PAGE);
}

export function resolveMediaUrl(mediaUrl, org, repo) {
  if (!mediaUrl) return '';

  try {
    const url = new URL(mediaUrl);
    return url.href;
  } catch {
    if (org && repo) {
      const cleanUrl = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
      return `https://main--${repo}--${org}${Domains.AEM_LIVE}${cleanUrl}`;
    }
    return mediaUrl;
  }
}

export function parseMediaUrl(mediaUrl) {
  try {
    const url = new URL(mediaUrl);
    return {
      origin: url.origin,
      path: url.pathname,
      fullUrl: mediaUrl,
    };
  } catch (error) {
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
    const urlObj = new URL(url);
    const { pathname } = urlObj;
    if (pathname.toLowerCase().endsWith('.svg')) {
      return `${urlObj.protocol}//${urlObj.host}${pathname}`;
    }
    return urlObj.pathname;
  } catch {
    return url;
  }
}

export function urlsMatch(url1, url2) {
  if (!url1 || !url2) return false;

  const path1 = normalizeUrl(url1);
  const path2 = normalizeUrl(url2);
  if (path1 === path2) return true;

  const normalizedPath1 = path1.startsWith('/') ? path1 : `/${path1}`;
  const normalizedPath2 = path2.startsWith('/') ? path2 : `/${path2}`;

  if (normalizedPath1 === normalizedPath2) return true;

  const fileName1 = path1.split('/').pop();
  const fileName2 = path2.split('/').pop();

  return fileName1 === fileName2 && fileName1 && fileName2;
}

export function parseOrgRepoFromUrl(siteUrl) {
  if (!siteUrl) {
    throw new Error('Site URL is required');
  }

  try {
    const url = new URL(siteUrl);
    const { hostname } = url;

    const match = hostname.match(/^main--(.+?)--([^.]+)\.aem\.page$/);

    if (match) {
      const [, repo, org] = match;
      return { org, repo };
    }

    throw new Error(`Unable to parse AEM URL format from: ${siteUrl}`);
  } catch (error) {
    throw new Error(`Invalid URL format: ${siteUrl}. Expected format: https://main--site--org.aem.page`);
  }
}

/**
 * Get dedupe key for media URL.
 * Used by both indexing and features for consistent deduplication.
 */
export function getDedupeKey(url) {
  if (!url) return '';

  try {
    const urlObj = new URL(url);
    const { pathname } = urlObj;
    const filename = pathname.split('/').pop();

    if (filename && filename.includes(MEDIA_UNDERSCORE_PREFIX)) {
      return filename;
    }

    return pathname;
  } catch (error) {
    return url.split('?')[0];
  }
}
