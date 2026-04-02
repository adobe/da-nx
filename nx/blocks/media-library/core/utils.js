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

// Coerces timestamp to finite number, handling corrupted string timestamps.
function toFiniteTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

/** Same ordering key as sortMediaData / saved index rows: modified time, else ingest time. */
export function getCanonicalMediaTimestamp(item) {
  if (!item) return 0;
  return toFiniteTimestamp(item.modifiedTimestamp || item.timestamp);
}

export function sortMediaData(mediaData) {
  return [...mediaData].sort((a, b) => {
    const tsA = getCanonicalMediaTimestamp(a);
    const tsB = getCanonicalMediaTimestamp(b);
    const timeDiff = tsB - tsA;

    if (timeDiff !== 0) return timeDiff;

    const docPathA = a.doc || '';
    const docPathB = b.doc || '';

    const depthA = docPathA ? docPathA.split('/').filter((p) => p).length : 999;
    const depthB = docPathB ? docPathB.split('/').filter((p) => p).length : 999;

    const depthDiff = depthA - depthB;
    if (depthDiff !== 0) return depthDiff;

    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

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
  const { initIms } = await import('../../../utils/daFetch.js');
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

export async function checkSiteAuthRequired(org, repo) {
  const { Domains } = await import('./constants.js');
  const indexUrl = `https://main--${repo}--${org}${Domains.AEM_PAGE}/index.md`;

  debugLog('Checking site auth requirement', { org, repo, indexUrl });

  try {
    const { etcFetch } = await import('./urls.js');
    const response = await etcFetch(indexUrl, 'cors', { method: 'HEAD' });
    const requiresAuth = response.status === 401 || response.status === 403;
    const result = { requiresAuth, status: response.status };

    debugLog('Site auth check result', result);
    return result;
  } catch (error) {
    debugLog('Site auth check error', error);
    return { requiresAuth: false, status: 0 };
  }
}

export async function livePreviewLogin(owner, repo) {
  try {
    const { initIms } = await import('../../../utils/daFetch.js');
    const { getLivePreviewUrl } = await import('./urls.js');
    const { accessToken } = await initIms();
    const url = `${getLivePreviewUrl(owner, repo)}/gimme_cookie`;

    debugLog('Setting preview.da.live cookie', { owner, repo, url });

    await fetch(url, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${accessToken.token}` },
    });

    debugLog('Preview.da.live cookie set successfully');
  } catch (error) {
    debugLog('Preview.da.live login failed', error);
  }
}
