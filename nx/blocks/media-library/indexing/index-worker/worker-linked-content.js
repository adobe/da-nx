/**
 * Worker-safe version of processLinkedContent
 *
 * Processes PDFs, SVGs, fragments, and external media.
 * Handles ALL files from Status API (not just referenced ones).
 * For incremental builds without prebuiltUsageMap, calls buildUsageMap
 * to parse changed pages and extract media references.
 */

import {
  toLinkedContentEntry,
  toExternalMediaEntry,
  isPdf,
  isSvg,
  isPdfOrSvg,
  isFragmentDoc,
} from '../parse.js';
import { normalizePath } from '../../core/parse-utils.js';
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
  let removed = 0;

  // Build filesByPath from files parameter (from Status API)
  const filesByPath = new Map();
  files.forEach((e) => {
    if (!isPdfOrSvg(e.path) && !isFragmentDoc(e.path)) return;
    const p = e.path;
    const existing = filesByPath.get(p);
    if (!existing || e.timestamp < existing.timestamp) filesByPath.set(p, e);
  });

  // Track deleted files
  const deletedPaths = new Set();
  filesByPath.forEach((event, path) => {
    if (event.method === 'DELETE') deletedPaths.add(path);
  });

  // Remove deleted linked content from index
  deletedPaths.forEach((path) => {
    const toRemove = updatedIndex.filter(
      (e) => (e.operation === 'auditlog-parsed' || e.source === 'auditlog-parsed') && e.hash === path,
    );
    toRemove.forEach((e) => {
      const idx = updatedIndex.indexOf(e);
      updatedIndex.splice(idx, 1);
      removed += 1;
    });
    if (toRemove.length > 0 && onLog) {
      onLog(`Removed linked content (DELETE): ${path} (${toRemove.length} entries)`);
    }
  });

  // For incremental builds: parse changed pages to extract media references
  // For full builds: use prebuiltUsageMap (already parsed all pages)
  let usageMap;
  if (prebuiltUsageMap) {
    usageMap = prebuiltUsageMap;
  } else if (pages && pages.length > 0) {
    onProgress?.({ stage: 'processing', message: 'Building usage map for linked content...' });
    usageMap = await buildUsageMap(pages, org, repo, ref, (p) => onProgress?.(p), null, context);
  } else {
    usageMap = { pdfs: new Map(), svgs: new Map(), fragments: new Map(), externalMedia: new Map() };
  }

  // Collect ALL linked paths (from Status API files + parsed usage map)
  const allLinkedPaths = new Set(filesByPath.keys());
  ['pdfs', 'svgs', 'fragments'].forEach((key) => {
    usageMap[key]?.forEach((_, path) => allLinkedPaths.add(path));
  });

  // Also include paths already in index that belong to parsed pages
  const parsedPages = new Set(pages.map((p) => normalizePath(p.path)));
  updatedIndex.forEach((e) => {
    const isLinkedContent = e.operation === 'auditlog-parsed' || e.source === 'auditlog-parsed';
    if (!isLinkedContent) return;
    if (e.doc && parsedPages.has(e.doc)) {
      allLinkedPaths.add(e.hash);
    }
  });

  // Process each linked file
  allLinkedPaths.forEach((filePath) => {
    if (deletedPaths.has(filePath)) return;

    // Determine file type
    let key = 'fragments';
    if (isPdf(filePath)) key = 'pdfs';
    else if (isSvg(filePath)) key = 'svgs';

    const linkedPages = usageMap[key]?.get(filePath) || [];
    const fileEvent = filesByPath.get(filePath) || { timestamp: 0, user: '' };

    const isLinkedContent = (e) => (e.operation === 'auditlog-parsed' || e.source === 'auditlog-parsed')
      && e.hash === filePath;
    const isLinkedForDoc = (doc) => (e) => isLinkedContent(e) && e.doc === doc;

    if (linkedPages.length === 0) {
      // Not referenced in any page - create/keep standalone entry
      const obsolete = updatedIndex.filter((e) => isLinkedContent(e));
      obsolete.forEach((e) => {
        updatedIndex.splice(updatedIndex.indexOf(e), 1);
        removed += 1;
      });
      const stillHasUnused = updatedIndex.some((e) => isLinkedContent(e) && !e.doc);
      if (!stillHasUnused) {
        updatedIndex.push(toLinkedContentEntry(filePath, '', fileEvent, org, repo));
        added += 1;
      }
    } else {
      // Referenced in pages - remove obsolete entries, add/update current ones
      const obsolete = updatedIndex.filter(
        (e) => isLinkedContent(e) && (e.doc === '' || !linkedPages.includes(e.doc)),
      );
      obsolete.forEach((e) => {
        updatedIndex.splice(updatedIndex.indexOf(e), 1);
        removed += 1;
      });
      linkedPages.forEach((doc) => {
        const existingIdx = updatedIndex.findIndex(isLinkedForDoc(doc));
        const freshEntry = toLinkedContentEntry(filePath, doc, fileEvent, org, repo);
        if (existingIdx !== -1) {
          updatedIndex[existingIdx] = freshEntry;
        } else {
          updatedIndex.push(freshEntry);
          added += 1;
        }
      });
    }
  });

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
    removed,
    usageMap, // Return usageMap so incremental build can use it for image truthing
  };
}
