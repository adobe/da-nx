// Flattens index into media sheet rows (hash, url, name, timestamp, etc.).
export function buildMediaSheet(flatIndex) {
  return flatIndex.map((entry) => ({
    hash: entry.hash,
    url: entry.url || '',
    name: entry.name || '',
    timestamp: entry.timestamp || 0,
    user: entry.user || '',
    operation: entry.operation || '',
    type: entry.type || '',
    doc: entry.doc || '',
    status: entry.status || '',
    displayName: entry.displayName || '',
    // Convert empty string to null for proper timestamp fallback
    modifiedTimestamp: entry.modifiedTimestamp || null,
    latestUsageTimestamp: entry.latestUsageTimestamp || null,
    nameSource: entry.nameSource || '',
    timestampSource: entry.timestampSource || '',
  }));
}

// Aggregates page -> hashes for usage sheet; one row per page.
export function buildUsageSheet(flatIndex) {
  const pageHashMap = new Map();

  flatIndex.forEach((entry) => {
    if (!entry.doc || !entry.hash) return;
    if (!pageHashMap.has(entry.doc)) {
      pageHashMap.set(entry.doc, new Set());
    }
    pageHashMap.get(entry.doc).add(entry.hash);
  });

  return Array.from(pageHashMap.entries()).map(([page, hashSet]) => ({
    page,
    hashes: JSON.stringify(Array.from(hashSet)),
  }));
}

// Parses usage sheet into Map<page, Set<hash>> for O(1) lookups.
export function buildUsageMap(usageData) {
  const usageMap = new Map();
  usageData.forEach((entry) => {
    try {
      const hashes = JSON.parse(entry.hashes);
      usageMap.set(entry.page, new Set(hashes));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn(`[MediaIndexer] Skipping malformed usage entry for page: ${entry.page}`, error);
    }
  });
  return usageMap;
}
