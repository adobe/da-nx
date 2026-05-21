// Flattens index into media sheet rows (hash, url, timestamp, etc.).
export function buildMediaSheet(flatIndex) {
  return flatIndex.map((entry) => {
    // Normalize hash: should always be bare (e.g. "abc123"), never with prefix
    let normalizedHash = entry.hash;
    if (normalizedHash && normalizedHash.startsWith('media_') && normalizedHash.includes('.')) {
      normalizedHash = normalizedHash.substring(6, normalizedHash.lastIndexOf('.'));
    }

    // Normalize timestamps: always use numbers, never ISO strings or empty strings
    const normalizeTimestamp = (ts) => {
      if (!ts || ts === '') return 0;
      if (typeof ts === 'number') return ts;
      if (typeof ts === 'string') {
        const parsed = new Date(ts).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return 0;
    };

    return {
      hash: normalizedHash,
      url: entry.url || '',
      originalPath: entry.originalPath || '',
      timestamp: normalizeTimestamp(entry.timestamp),
      user: entry.user || '',
      operation: entry.operation || '',
      type: entry.type || '',
      doc: entry.doc || '',
      displayName: entry.displayName || '',
      // Normalize modifiedTimestamp: number, or null if empty/missing
      modifiedTimestamp: (entry.modifiedTimestamp !== null && entry.modifiedTimestamp !== undefined && entry.modifiedTimestamp !== '')
        ? normalizeTimestamp(entry.modifiedTimestamp)
        : null,
    };
  });
}

// Aggregates page -> hashes for usage sheet; one row per page.
export function buildUsageSheet(flatIndex) {
  const pageHashMap = new Map();

  flatIndex.forEach((entry) => {
    if (!entry.doc || !entry.hash) return;

    // Normalize hash before storing
    let normalizedHash = entry.hash;
    if (normalizedHash && normalizedHash.startsWith('media_') && normalizedHash.includes('.')) {
      normalizedHash = normalizedHash.substring(6, normalizedHash.lastIndexOf('.'));
    }

    if (!pageHashMap.has(entry.doc)) {
      pageHashMap.set(entry.doc, new Set());
    }
    pageHashMap.get(entry.doc).add(normalizedHash);
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
