/**
 * Sheet building utilities.
 * Follows helix-admin pattern: single-purpose, focused functions.
 */

import { SheetNames } from '../core/constants.js';

/**
 * Build 'media' sheet: flat structure, one row per (hash, doc) combination.
 * Columns: hash, url, name, timestamp, user, operation, type, doc, status
 * Each row preserves the specific timestamp and user for that page preview.
 *
 * @param {Array} flatIndex flat index array
 * @returns {Array} media sheet data
 */
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
  }));
}

/**
 * Build 'usage' sheet: page-hash relationships.
 * Columns: page, hashes
 * One row per page, hashes stored as JSON array.
 *
 * @param {Array} flatIndex flat index array
 * @returns {Array} usage sheet data
 */
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

/**
 * Build usage map for O(1) lookups.
 * @param {Array} usageData usage sheet data
 * @returns {Map<string, Set<string>>} page -> Set of hashes
 */
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
