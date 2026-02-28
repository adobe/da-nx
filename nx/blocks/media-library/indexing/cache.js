/**
 * Cache management for processed media data.
 * Prevents stale derived data after index builds.
 */

/**
 * Cache for processMediaData results.
 * Key: hash of mediaData characteristics
 * Value: { uniqueItems, usageIndex, folderPaths }
 */
const processDataCache = new Map();
const MAX_CACHE_SIZE = 5;

/**
 * Clear the process data cache. Call after index builds to prevent stale data.
 */
export function clearProcessDataCache() {
  processDataCache.clear();
}

/**
 * Get cached processed data if available.
 * @param {string} cacheKey - Cache key
 * @returns {object|undefined} - Cached data or undefined
 */
export function getCachedProcessData(cacheKey) {
  return processDataCache.get(cacheKey);
}

/**
 * Set cached processed data.
 * @param {string} cacheKey - Cache key
 * @param {object} data - Data to cache
 */
export function setCachedProcessData(cacheKey, data) {
  if (processDataCache.size >= MAX_CACHE_SIZE) {
    const firstKey = processDataCache.keys().next().value;
    processDataCache.delete(firstKey);
  }
  processDataCache.set(cacheKey, data);
}

/**
 * Generate cache key from media data characteristics.
 * @param {Array} mediaData - Media data array
 * @returns {string} - Cache key
 */
export function generateCacheKey(mediaData) {
  if (!mediaData || mediaData.length === 0) {
    return 'empty';
  }

  const length = mediaData.length;
  const first = mediaData[0]?.hash || '';
  const last = mediaData[length - 1]?.hash || '';
  const mid = Math.floor(length / 2);
  const middle = mediaData[mid]?.hash || '';

  // Include timestamp range from first 10 items to detect incremental changes
  const timestamps = mediaData
    .slice(0, Math.min(10, length))
    .map((m) => m.timestamp || 0)
    .join(',');

  return `${length}-${first}-${middle}-${last}-${timestamps}`;
}
