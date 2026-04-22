/**
 * Worker-safe utility functions extracted from core/utils.js and core/paths.js
 *
 * These functions have no window/localStorage dependencies.
 * Duplicated here to avoid importing:
 * - core/utils.js → utils/daFetch.js → public/utils/constants.js (window.location)
 * - core/paths.js → utils/daFetch.js → public/utils/constants.js (window.location)
 */

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

/**
 * Sorts media data by timestamp descending, then by path depth, then by name.
 * Extracted verbatim from core/utils.js
 */
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
 * Normalizes sitePath string
 * Extracted verbatim from core/paths.js
 */
export function normalizeSitePath(sitePath) {
  if (!sitePath || typeof sitePath !== 'string') return '';
  const trimmed = sitePath.trim();
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading === '/' ? '/' : withLeading.replace(/\/+$/, '');
}

/**
 * Gets content path from sitePath
 * Extracted verbatim from core/paths.js
 */
export function getContentPathFromSitePath(sitePath) {
  const normalized = normalizeSitePath(sitePath);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 2) return '';
  return `/${parts.slice(2).join('/')}`;
}
