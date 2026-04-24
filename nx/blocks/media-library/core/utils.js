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
  } catch (e) {
    return 'Invalid Date';
  }
}

// Returns singular or plural form based on count.
export function pluralize(singular, plural, count) {
  return count === 1 ? singular : plural;
}

/** Re-exported from parse-utils.js for backward compatibility */
export const getCanonicalMediaTimestamp = _getCanonicalMediaTimestamp;

/**
 * Computes status from doc field (referenced if doc present, unused if empty).
 * Includes backward compatibility fallback for old index entries with status field.
 */
export function getItemStatus(item) {
  if (!item) return 'unused';
  // Backward compatibility: prefer persisted status during transition
  if (item.status) return item.status;
  // Compute from doc field
  return item.doc ? 'referenced' : 'unused';
}

/** Re-exported from parse-utils.js for backward compatibility */
export const sortMediaData = _sortMediaData;

/**
 * Deduplicates media entries by hash, keeping one entry per unique media asset.
 * When multiple entries exist for the same hash (same media used on multiple pages),
 * keeps the entry with a doc (referenced usage) over unused, and most recent timestamp.
 */
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

    // Prefer entry with a doc (referenced) over unused
    const hasDoc = entry.doc && entry.doc !== '';
    const existingHasDoc = existing.doc && existing.doc !== '';

    if (hasDoc && !existingHasDoc) {
      hashMap.set(hash, entry);
      return;
    }

    if (!hasDoc && existingHasDoc) {
      return; // Keep existing
    }

    // Both have doc or both unused - prefer most recent canonical time
    const entryTs = getCanonicalMediaTimestamp(entry);
    const existingTs = getCanonicalMediaTimestamp(existing);

    if (entryTs > existingTs) {
      hashMap.set(hash, entry);
    }
  });

  return Array.from(hashMap.values());
}

// Returns true if user has valid IMS auth for DA.
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
  } catch {
    // Ignore cache write errors
  }
}

export async function checkSiteAuthRequired(org, repo) {
  const cacheKey = `${org}-${repo}-auth-status`;

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const result = JSON.parse(cached);
      debugLog('Using cached auth check result', { org, repo });
      return result;
    }
  } catch {
    // Ignore cache read errors
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
