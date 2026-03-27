import { fetchFileLastModified } from './admin-api.js';
import {
  normalizePath,
  isPdf,
  isSvg,
  isPdfOrSvg,
  isFragmentDoc,
  buildUsageMap,
  toLinkedContentEntry,
  toExternalMediaEntry,
} from './parse.js';
import { Operation } from '../core/constants.js';
import { isIndexedExternalMediaOperation, isIndexedExternalMediaEntry } from '../core/media.js';

/**
 * Enriches linked content entries with Last-Modified timestamps from HTTP HEAD requests.
 * Processes entries in batches with controlled concurrency.
 */
export async function enrichLinkedContentBatch(entries, concurrency = 10) {
  if (!entries || entries.length === 0) return entries;

  const enriched = [...entries];
  const tasks = [];

  for (let i = 0; i < enriched.length; i += 1) {
    const entry = enriched[i];
    if (entry.url) {
      tasks.push(
        fetchFileLastModified(entry.url).then((lastModified) => {
          if (lastModified) {
            entry.modifiedTimestamp = lastModified;
            entry.timestampSource = 'http-head';
          }
        }),
      );

      if (tasks.length >= concurrency) {
        await Promise.allSettled(tasks.splice(0, concurrency));
      }
    }
  }

  if (tasks.length > 0) {
    await Promise.allSettled(tasks);
  }

  return enriched;
}

/**
 * Removes invalid external media entries from the index.
 * An entry is invalid if it's marked as external media but doesn't have valid external media info.
 */
export function purgeInvalidExternalMediaEntries(index) {
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
 * Processes linked content (PDFs, SVGs, fragments) and external media references.
 * Updates the index with entries for all linked content found in pages.
 * Handles:
 * - Linked content from auditlog (PDFs, SVGs, fragments)
 * - External media URLs from markdown parsing
 * - Deletion and orphaning of unused content
 * - Enrichment with Last-Modified timestamps
 *
 * @param {Object} [prebuiltUsageMap] - Optional pre-built usage map to avoid re-parsing pages
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
  let removed = 0;

  const filesByPath = new Map();
  files.forEach((e) => {
    if (!isPdfOrSvg(e.path) && !isFragmentDoc(e.path)) return;
    const p = e.path;
    const existing = filesByPath.get(p);
    if (!existing || e.timestamp < existing.timestamp) filesByPath.set(p, e);
  });

  const deletedPaths = new Set();
  filesByPath.forEach((event, path) => {
    if (event.method === 'DELETE') deletedPaths.add(path);
  });

  deletedPaths.forEach((path) => {
    const toRemove = updatedIndex.filter(
      (e) => (e.operation === 'auditlog-parsed' || e.source === 'auditlog-parsed') && e.hash === path,
    );
    toRemove.forEach((e) => {
      const idx = updatedIndex.indexOf(e);
      updatedIndex.splice(idx, 1);
      removed += 1;
    });
    if (toRemove.length > 0) {
      onLog(`Removed linked content (DELETE): ${path} (${toRemove.length} entries)`);
    }
  });

  let usageMap;
  if (prebuiltUsageMap) {
    usageMap = prebuiltUsageMap;
  } else {
    onProgress({ stage: 'processing', message: 'Building usage map for linked content...' });
    usageMap = await buildUsageMap(pages, org, repo, ref, (p) => onProgress(p));
  }

  const allLinkedPaths = new Set(filesByPath.keys());
  ['pdfs', 'svgs', 'fragments'].forEach((key) => {
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
    const linkedPages = usageMap[key]?.get(filePath) || [];
    const status = linkedPages.length > 0 ? 'referenced' : 'unused';
    const fileEvent = filesByPath.get(filePath) || { timestamp: 0, user: '' };

    const isLinkedContent = (e) => (e.operation === 'auditlog-parsed' || e.source === 'auditlog-parsed')
      && e.hash === filePath;
    const isLinkedForDoc = (doc) => (e) => isLinkedContent(e) && e.doc === doc;

    if (linkedPages.length === 0) {
      const obsolete = updatedIndex.filter((e) => isLinkedContent(e));
      obsolete.forEach((e) => {
        updatedIndex.splice(updatedIndex.indexOf(e), 1);
        removed += 1;
      });
      const stillHasUnused = updatedIndex.some((e) => isLinkedContent(e) && !e.doc);
      if (!stillHasUnused) {
        updatedIndex.push(toLinkedContentEntry(filePath, '', fileEvent, status, org, repo));
        added += 1;
      }
    } else {
      const obsolete = updatedIndex.filter((e) => isLinkedContent(e) && (e.doc === '' || !linkedPages.includes(e.doc)));
      obsolete.forEach((e) => {
        updatedIndex.splice(updatedIndex.indexOf(e), 1);
        removed += 1;
      });
      linkedPages.forEach((doc) => {
        const existingIdx = updatedIndex.findIndex(isLinkedForDoc(doc));
        const freshEntry = toLinkedContentEntry(filePath, doc, fileEvent, status, org, repo);
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

  const externalUrls = usageMap.externalMedia ? [...usageMap.externalMedia.keys()] : [];
  externalUrls.forEach((url) => {
    const data = usageMap.externalMedia.get(url) || {
      pages: [],
      firstDiscoveredTimestamp: 0,
    };
    const { pages: linkedPages, firstDiscoveredTimestamp } = data;
    const isExtlinksForDoc = (doc) => (e) => {
      const op = e.operation || e.source;
      const isExt = op === Operation.EXTLINKS || op === Operation.MARKDOWN_PARSED;
      return isExt && e.hash === url && e.doc === doc;
    };
    const isExtlinksEntry = (e) => {
      const op = e.operation || e.source;
      return (op === Operation.EXTLINKS || op === Operation.MARKDOWN_PARSED) && e.hash === url;
    };

    const obsolete = updatedIndex.filter((e) => isExtlinksEntry(e) && (e.doc === '' || !linkedPages.includes(e.doc)));
    obsolete.forEach((e) => {
      updatedIndex.splice(updatedIndex.indexOf(e), 1);
      removed += 1;
    });

    linkedPages.forEach((doc) => {
      const existingIdx = updatedIndex.findIndex(isExtlinksForDoc(doc));
      const freshEntry = toExternalMediaEntry(url, doc, firstDiscoveredTimestamp);
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
  });

  // Enrich linked content with Last-Modified timestamps
  onProgress({ stage: 'processing', message: 'Enriching linked content with Last-Modified...' });
  const linkedContentEntries = updatedIndex.filter(
    (e) => e.operation === 'auditlog-parsed' || e.source === 'auditlog-parsed',
  );
  if (linkedContentEntries.length > 0) {
    await enrichLinkedContentBatch(linkedContentEntries);
    onLog(`Enriched ${linkedContentEntries.length} linked content entries with Last-Modified`);
  }

  return { added, removed };
}
