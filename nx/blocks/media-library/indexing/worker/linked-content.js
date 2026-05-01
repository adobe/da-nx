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
  isVideo,
  isPdfOrSvg,
  isFragmentDoc,
} from '../parse.js';
import { normalizePath } from '../parse-utils.js';
import { buildUsageMap } from './parse.js';
import { Operation } from '../../core/constants.js';
import {
  isIndexedExternalMediaOperation,
  isIndexedExternalMediaEntry,
  normalizeExternalVideoUrl,
} from '../../core/media.js';
import { canonicalizeMediaUrl } from '../../core/urls.js';

/**
 * Remove invalid external media entries from index
 * (entries that have extlinks/markdown-parsed operation but no valid media type)
 */
function purgeInvalidExternalMediaEntries(index) {
  let removed = 0;

  for (let i = index.length - 1; i >= 0; i -= 1) {
    const entry = index[i];
    const shouldRemove = isIndexedExternalMediaOperation(entry)
      && !isIndexedExternalMediaEntry(entry);
    if (shouldRemove) {
      index.splice(i, 1);
      removed += 1;
    }
  }

  return removed;
}

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
    usageMap = {
      pdfs: new Map(),
      svgs: new Map(),
      videos: new Map(),
      fragments: new Map(),
      externalMedia: new Map(),
    };
  }

  // Collect ALL linked paths (from Status API files + parsed usage map)
  const allLinkedPaths = new Set(filesByPath.keys());
  ['pdfs', 'svgs', 'videos', 'fragments'].forEach((key) => {
    usageMap[key]?.forEach((_, path) => allLinkedPaths.add(path));
  });

  const parsedPages = new Set(pages.map((p) => normalizePath(p.path)));
  updatedIndex.forEach((e) => {
    const isLinkedContent = e.operation === 'auditlog-parsed' || e.source === 'auditlog-parsed';
    if (!isLinkedContent) return;
    if (e.doc && parsedPages.has(e.doc)) {
      allLinkedPaths.add(e.hash);
    }
  });
  allLinkedPaths.forEach((filePath) => {
    if (deletedPaths.has(filePath)) return;
    let key = 'fragments';
    if (isPdf(filePath)) key = 'pdfs';
    else if (isSvg(filePath)) key = 'svgs';
    else if (isVideo(filePath)) key = 'videos';

    const linkedPages = usageMap[key]?.get(filePath) || [];
    const fileEvent = filesByPath.get(filePath) || { timestamp: 0, user: '' };

    const isLinkedContent = (e) => (
      e.operation === 'auditlog-parsed' || e.source === 'auditlog-parsed'
    ) && e.hash === filePath;
    const isLinkedForDoc = (doc) => (e) => isLinkedContent(e) && e.doc === doc;

    if (linkedPages.length === 0) {
      const obsolete = updatedIndex.filter(
        (e) => isLinkedContent(e) && e.doc && parsedPages.has(normalizePath(e.doc)),
      );
      obsolete.forEach((e) => {
        updatedIndex.splice(updatedIndex.indexOf(e), 1);
        removed += 1;
      });
      const stillHasEntry = updatedIndex.some((e) => isLinkedContent(e));
      if (!stillHasEntry) {
        updatedIndex.push(toLinkedContentEntry(filePath, '', fileEvent, org, repo));
        added += 1;
      }
    } else {
      const obsolete = updatedIndex.filter(
        (e) => isLinkedContent(e)
          && e.doc
          && parsedPages.has(e.doc)
          && !linkedPages.includes(e.doc),
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

  removed += purgeInvalidExternalMediaEntries(updatedIndex);

  // Collect all external URLs to process:
  // 1. URLs found in parsed pages (from usageMap) - already normalized
  // 2. URLs from existing index entries for parsed pages (to remove obsolete refs)
  const allExternalUrls = new Set(usageMap.externalMedia ? usageMap.externalMedia.keys() : []);
  updatedIndex.forEach((e) => {
    const isExternal = isIndexedExternalMediaOperation(e);
    if (isExternal && e.doc && parsedPages.has(normalizePath(e.doc))) {
      // Normalize the URL to match usageMap keys and avoid duplicates
      const canonical = canonicalizeMediaUrl(e.url, org, repo);
      const normalized = normalizeExternalVideoUrl(canonical);
      allExternalUrls.add(normalized);
    }
  });

  const externalUrls = [...allExternalUrls];

  externalUrls.forEach((url) => {
    const data = usageMap.externalMedia.get(url) || {
      pages: [],
      firstDiscoveredTimestamp: 0,
    };
    const { pages: linkedPages, firstDiscoveredTimestamp } = data;

    const canonicalUrl = canonicalizeMediaUrl(url, org, repo);
    const entryHash = normalizeExternalVideoUrl(canonicalUrl);
    const isExtlinksForDoc = (doc) => (e) => {
      const op = e.operation || e.source;
      const isExt = op === Operation.EXTLINKS || op === Operation.MARKDOWN_PARSED;
      return isExt && e.hash === entryHash && e.doc === doc;
    };
    const isExtlinksEntry = (e) => {
      const op = e.operation || e.source;
      return (
        op === Operation.EXTLINKS || op === Operation.MARKDOWN_PARSED
      ) && e.hash === entryHash;
    };

    if (linkedPages.length === 0) {
      const obsolete = updatedIndex.filter(
        (e) => isExtlinksEntry(e) && e.doc && parsedPages.has(normalizePath(e.doc)),
      );
      obsolete.forEach((e) => {
        updatedIndex.splice(updatedIndex.indexOf(e), 1);
        removed += 1;
      });
    } else {
      const obsolete = updatedIndex.filter(
        (e) => isExtlinksEntry(e)
          && e.doc
          && parsedPages.has(normalizePath(e.doc))
          && !linkedPages.includes(e.doc),
      );
      obsolete.forEach((e) => {
        updatedIndex.splice(updatedIndex.indexOf(e), 1);
        removed += 1;
      });

      linkedPages.forEach((doc) => {
        const existingIdx = updatedIndex.findIndex(isExtlinksForDoc(doc));
        const freshEntry = toExternalMediaEntry(
          url,
          doc,
          firstDiscoveredTimestamp,
          org,
          repo,
        );
        if (!freshEntry) {
          return;
        }
        if (existingIdx !== -1) {
          updatedIndex[existingIdx] = freshEntry;
        } else {
          updatedIndex.push(freshEntry);
          added += 1;
        }
      });
    }
  });

  return {
    added,
    removed,
    usageMap,
  };
}
