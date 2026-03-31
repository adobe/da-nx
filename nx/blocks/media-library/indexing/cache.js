const processDataCache = new Map();
const MAX_CACHE_SIZE = 5;

// Clears cache after index builds so fresh data is used.
export function clearProcessDataCache() {
  processDataCache.clear();
}

// Returns cached processed data or undefined if miss.
export function getCachedProcessData(cacheKey) {
  return processDataCache.get(cacheKey);
}

// Stores processed data; evicts oldest when over MAX_CACHE_SIZE.
export function setCachedProcessData(cacheKey, data) {
  if (processDataCache.size >= MAX_CACHE_SIZE) {
    const firstKey = processDataCache.keys().next().value;
    processDataCache.delete(firstKey);
  }
  processDataCache.set(cacheKey, data);
}

// Hashes length + sample hashes/timestamps to detect data changes.
export function generateCacheKey(mediaData) {
  if (!mediaData || mediaData.length === 0) {
    return 'empty';
  }

  const { length } = mediaData;
  const first = mediaData[0]?.hash || '';
  const last = mediaData[length - 1]?.hash || '';
  const mid = Math.floor(length / 2);
  const middle = mediaData[mid]?.hash || '';

  const timestamps = mediaData
    .slice(0, Math.min(10, length))
    .map((m) => m.timestamp || 0)
    .join(',');

  return `${length}-${first}-${middle}-${last}-${timestamps}`;
}
