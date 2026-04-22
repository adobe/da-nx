/**
 * Worker-safe version of processLinkedContent
 *
 * Simplified version for full builds that:
 * - Processes PDFs, SVGs, fragments, and external media from usageMap
 * - Creates index entries for linked content
 * - Skips validation/fetching (not needed for full builds)
 *
 * For incremental builds, this would need to be enhanced with:
 * - File validation (HEAD requests to external URLs)
 * - Metadata fetching from DA storage
 * - Orphaning logic for deleted files
 */

import {
  toLinkedContentEntry,
  toExternalMediaEntry,
} from '../parse.js';

/**
 * Simplified processLinkedContent for worker (full builds only)
 *
 * @param {Array} updatedIndex - Index array to update
 * @param {Array} files - File events (not used in full build)
 * @param {Array} pages - Page entries
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} ref - Reference
 * @param {function} onProgress - Progress callback
 * @param {function} onLog - Log callback
 * @param {object} prebuiltUsageMap - Usage map from buildUsageMap
 * @returns {Promise<{added: number, removed: number}>}
 */
export async function processLinkedContent(
  updatedIndex,
  files,
  pages,
  org,
  repo,
  ref,
  onProgress,
  onLog,
  prebuiltUsageMap = null,
) {
  let added = 0;

  if (!prebuiltUsageMap) {
    // eslint-disable-next-line no-console
    console.warn('[worker-linked-content] No prebuiltUsageMap provided, skipping');
    return { added: 0, removed: 0 };
  }

  const usageMap = prebuiltUsageMap;

  // Process PDFs
  if (usageMap.pdfs) {
    usageMap.pdfs.forEach((linkedPages, filePath) => {
      linkedPages.forEach((doc) => {
        const entry = toLinkedContentEntry(filePath, doc, { timestamp: 0, user: '' }, org, repo);
        updatedIndex.push(entry);
        added += 1;
      });
    });
  }

  // Process SVGs
  if (usageMap.svgs) {
    usageMap.svgs.forEach((linkedPages, filePath) => {
      linkedPages.forEach((doc) => {
        const entry = toLinkedContentEntry(filePath, doc, { timestamp: 0, user: '' }, org, repo);
        updatedIndex.push(entry);
        added += 1;
      });
    });
  }

  // Process fragments
  if (usageMap.fragments) {
    usageMap.fragments.forEach((linkedPages, filePath) => {
      linkedPages.forEach((doc) => {
        const entry = toLinkedContentEntry(filePath, doc, { timestamp: 0, user: '' }, org, repo);
        updatedIndex.push(entry);
        added += 1;
      });
    });
  }

  // Process external media
  if (usageMap.externalMedia) {
    usageMap.externalMedia.forEach((data, url) => {
      const { pages: linkedPages, firstDiscoveredTimestamp } = data;
      linkedPages.forEach((doc) => {
        const entry = toExternalMediaEntry(url, doc, firstDiscoveredTimestamp, org, repo);
        if (entry) {
          updatedIndex.push(entry);
          added += 1;
        }
      });
    });
  }

  // eslint-disable-next-line no-console
  console.log(`[worker-linked-content] Added ${added} linked content entries`);

  return {
    added,
    removed: 0,
  };
}
