import { Domains } from './constants.js';
import { etcFetch, getLivePreviewUrl } from './urls.js';
import { initIms } from '../../../utils/daFetch.js';
import {
  getCanonicalMediaTimestamp as _getCanonicalMediaTimestamp,
  sortMediaData as _sortMediaData,
} from '../indexing/parse-utils.js';

export function formatDateTime(isoString) {
  if (!isoString) return 'Unknown';

  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return 'Invalid Date';
  }
}

export function pluralize(singular, plural, count) {
  return count === 1 ? singular : plural;
}

export const getCanonicalMediaTimestamp = _getCanonicalMediaTimestamp;

export function getItemStatus(item) {
  if (!item) return 'unused';
  if (item.status) return item.status;
  return item.doc ? 'referenced' : 'unused';
}

export const sortMediaData = _sortMediaData;

export function deduplicateMediaByHash(mediaData) {
  if (!mediaData || mediaData.length === 0) return [];

  const hashMap = new Map();

  mediaData.forEach((entry) => {
    const { hash } = entry;
    if (!hash) return;

    const existing = hashMap.get(hash);

    if (!existing) {
      hashMap.set(hash, entry);
      return;
    }

    const hasDoc = entry.doc && entry.doc !== '';
    const existingHasDoc = existing.doc && existing.doc !== '';

    if (hasDoc && !existingHasDoc) {
      hashMap.set(hash, entry);
      return;
    }

    if (!hasDoc && existingHasDoc) {
      return;
    }

    const entryTs = getCanonicalMediaTimestamp(entry);
    const existingTs = getCanonicalMediaTimestamp(existing);

    if (entryTs > existingTs) {
      hashMap.set(hash, entry);
    }
  });

  return Array.from(hashMap.values());
}

export async function ensureAuthenticated() {
  const imsResult = await initIms();

  if (!imsResult || imsResult.anonymous) {
    const { loadIms, handleSignIn } = await import('../../../utils/ims.js');
    await loadIms();
    handleSignIn();
    return false;
  }

  return true;
}

function shouldDebugLog() {
  const params = new URLSearchParams(window.location.search);
  const debugValue = params.get('debug');
  return debugValue?.split(',').includes('perf') || localStorage.getItem('debug:perf') === '1';
}

export function debugLog(message, data) {
  if (shouldDebugLog()) {
    // eslint-disable-next-line no-console
    console.log(`[MediaLibrary:Auth] ${message}`, data);
  }
}

function saveSiteAuthCache(cacheKey, result) {
  try {
    localStorage.setItem(cacheKey, JSON.stringify(result));
    return true;
  } catch {
    return false;
  }
}

function parseCachedAuth(raw) {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function checkSiteAuthRequired(org, repo) {
  const cacheKey = `${org}-${repo}-auth-status`;

  let raw = null;
  try {
    raw = localStorage.getItem(cacheKey);
  } catch {
    raw = null;
  }

  const cached = parseCachedAuth(raw);
  if (cached !== undefined) {
    debugLog('Using cached auth check result', { org, repo });
    return cached;
  }

  const indexUrl = `https://main--${repo}--${org}${Domains.AEM_PAGE}/index.md`;

  debugLog('Checking site auth requirement', { org, repo, indexUrl });

  try {
    const response = await etcFetch(indexUrl, 'cors', { method: 'HEAD' });
    const requiresAuth = response.status === 401 || response.status === 403;
    const result = { requiresAuth, status: response.status };

    debugLog('Site auth check result', result);
    saveSiteAuthCache(cacheKey, result);
    return result;
  } catch (error) {
    debugLog('Site auth check error', error);
    const result = { requiresAuth: false, status: 0 };
    saveSiteAuthCache(cacheKey, result);
    return result;
  }
}

export async function livePreviewLogin(owner, repo) {
  try {
    const { accessToken } = await initIms();
    const url = `${getLivePreviewUrl(owner, repo)}/gimme_cookie`;

    debugLog('Setting preview.da.live cookie', { owner, repo, url });

    const response = await fetch(url, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken.token}` },
    });

    if (!response.ok) {
      debugLog('Preview.da.live login failed', { status: response.status });
      return false;
    }

    debugLog('Preview.da.live cookie set successfully');
    return true;
  } catch (error) {
    debugLog('Preview.da.live login failed', error);
    return false;
  }
}

export function getMediaLibraryHostMode() {
  if (typeof window === 'undefined' || !window.location?.pathname) {
    return 'app';
  }
  return window.location.pathname.includes('/apps/media-library') ? 'app' : 'plugin';
}

export function isMediaLibraryPluginMode() {
  return getMediaLibraryHostMode() === 'plugin';
}

export function withTimeout(promise, ms, reason = 'timeout') {
  let timeoutId;
  const deadline = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(reason)), ms);
  });
  return Promise.race([
    Promise.resolve(promise).finally(() => {
      clearTimeout(timeoutId);
    }),
    deadline,
  ]);
}

const DA_SDK_CLOSE_MS = 1500;

export async function tryClosePluginPanel() {
  try {
    const { default: DA_SDK } = await import('../../../utils/sdk.js');
    const sdk = await withTimeout(DA_SDK, DA_SDK_CLOSE_MS, 'sdk-close-timeout');
    sdk?.actions?.closeLibrary?.();
    return undefined;
  } catch {
    return undefined;
  }
}
