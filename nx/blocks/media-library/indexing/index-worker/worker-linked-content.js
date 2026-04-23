/**
 * Worker-safe version of processLinkedContent
 *
 * Processes PDFs, SVGs, fragments, and external media from usageMap.
 * For incremental builds without prebuiltUsageMap, calls buildUsageMap
 * to parse changed pages and extract media references.
 */

import {
  toLinkedContentEntry,
  toExternalMediaEntry,
} from '../parse.js';
import { buildUsageMap } from './worker-parse.js';

/**
 * Worker-safe processLinkedContent
 *
 * @param {Array} updatedIndex - Index array to update
 * @param {Array} files - File events (not used in full build)
 * @param {Array} pages - Page entries
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} ref - Reference
 * @param {function} onProgress - Progress callback
 * @param {function} onLog - Log callback
 * @param {object} prebuiltUsageMap - Usage map from buildUsageMap (full builds)
 * @param {object} context - Worker runtime context (REQUIRED for worker builds)
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
  context = null,
) {
  let added = 0;

  // For incremental builds: parse changed pages to extract media references
  // For full builds: use prebuiltUsageMap (already parsed all pages)
  let usageMap;
  if (prebuiltUsageMap) {
    usageMap = prebuiltUsageMap;
  } else if (pages && pages.length > 0) {
    // Parse changed pages' markdown to extract media usage
    onProgress?.({ stage: 'processing', message: `Parsing ${pages.length} changed pages for media usage...` });
    usageMap = await buildUsageMap(pages, org, repo, ref, (p) => onProgress?.(p), null, context);
  } else {
    // No pages to parse and no prebuilt map
    return { added: 0, removed: 0 };
  }

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

  if (context?.isPerfEnabled) {
    // eslint-disable-next-line no-console
    console.log(`[worker-linked-content] Added ${added} linked content entries`);
  }

  return {
    added,
    removed: 0,
  };
}
