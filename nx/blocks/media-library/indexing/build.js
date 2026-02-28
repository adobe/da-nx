import {
  streamLog, loadIndexMeta, saveIndexMeta, checkIndex, loadSheet, createSheet, createMultiSheet, loadMultiSheet,
} from './admin-api.js';
import {
  normalizePath, isPage, extractName, detectMediaType,
  isPdf, isSvg, isFragmentDoc, isPdfOrSvg,
  isLinkedContentPath, toAbsoluteFilePath,
  buildUsageMap,
  toLinkedContentEntry, toExternalMediaEntry, checkMemory,
  getDedupeKey,
} from './parse.js';
import { buildMediaSheet, buildUsageSheet, buildUsageMap as buildUsageMapFromSheet } from './sheets.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { daFetch } from '../../../utils/daFetch.js';
import {
  IndexConfig,
  Operation,
  IndexFiles,
  Paths,
  SheetNames,
} from '../core/constants.js';
import { isPerfEnabled } from '../core/debug.js';

/** Update PERF_TAG when making significant changes (e.g. phase3-parallel, after-page-media) */
const PERF_TAG = 'phase3-split-sheets';

function logPerf(perf) {
  if (!isPerfEnabled()) return;

  const mem = checkMemory();
  if (mem.usedMB != null) {
    perf.memoryUsedMB = Math.round(mem.usedMB * 10) / 10;
  }
  // Audit log: dropped = non-preview entries
  if (perf.auditLog?.streamed != null && perf.auditLog?.previewOnly != null) {
    perf.auditLog.dropped = perf.auditLog.streamed - perf.auditLog.previewOnly;
  }
  // Medialog: unmatched = resourcePath entries that consolidated (same hash|doc, kept latest)
  if (perf.medialog?.resourcePathCount != null && perf.medialog?.matched != null) {
    perf.medialog.unmatched = Math.max(0, perf.medialog.resourcePathCount - perf.medialog.matched);
  }
  // Throughput
  if (perf.auditLog?.durationMs > 0 && perf.auditLog?.streamed != null) {
    perf.auditLog.entriesPerSec = Math.round((perf.auditLog.streamed / perf.auditLog.durationMs) * 1000);
  }
  if (perf.medialog?.durationMs > 0 && perf.medialog?.streamed != null) {
    perf.medialog.entriesPerSec = Math.round((perf.medialog.streamed / perf.medialog.durationMs) * 1000);
  }
  if (perf.markdownParse?.durationMs > 0 && perf.markdownParse?.pages != null) {
    perf.markdownParse.pagesPerSec = Math.round((perf.markdownParse.pages / perf.markdownParse.durationMs) * 1000 * 10) / 10;
  }
  // eslint-disable-next-line no-console
  console.log('[MediaIndexer:perf]', JSON.stringify(perf, null, 2));
}

/** Dedupe by url (keep newest timestamp) so mergeDataForDisplay gets correct order */
function dedupeProgressiveItems(items) {
  const byKey = new Map();
  items.forEach((item) => {
    const key = item.url ? getDedupeKey(item.url) : (item.hash || '');
    const existing = byKey.get(key);
    if (!existing || (item.timestamp ?? 0) > (existing.timestamp ?? 0)) {
      byKey.set(key, item);
    }
  });
  return Array.from(byKey.values());
}

export async function getIndexStatus(sitePath, org, repo) {
  const metaPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`;
  const meta = await loadIndexMeta(metaPath);
  const checkResult = await checkIndex(IndexFiles.FOLDER, org, repo);
  const { exists: indexExists, lastModified: indexLastModified } = checkResult;

  return {
    lastRefresh: meta?.lastFetchTime || null,
    entriesCount: meta?.entriesCount || 0,
    lastBuildMode: meta?.lastBuildMode || null,
    indexExists,
    indexLastModified,
  };
}

export async function checkReindexEligibility(sitePath, org, repo) {
  const metaPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`;
  const meta = await loadIndexMeta(metaPath);
  const { exists: indexExists, lastModified: indexLastModified } = await checkIndex(IndexFiles.FOLDER, org, repo);

  if (!meta?.lastFetchTime) {
    return { shouldReindex: false, reason: 'No previous fetch (meta missing lastFetchTime)' };
  }
  if (!indexExists) {
    return { shouldReindex: false, reason: 'Index file does not exist in DA' };
  }
  if (indexLastModified == null) {
    return { shouldReindex: false, reason: `DA List API did not return lastModified for ${IndexFiles.MEDIA_INDEX}` };
  }

  const lastFetch = meta.lastFetchTime;
  const diff = Math.abs(lastFetch - indexLastModified);
  if (diff > IndexConfig.ALIGNMENT_TOLERANCE_MS) {
    return {
      shouldReindex: false,
      reason: `Index lastModified (${indexLastModified}) does not align with meta lastFetchTime (${lastFetch})`,
    };
  }

  return { shouldReindex: true };
}

function noop() {}

/**
 * Build page-media map from medialog entries (resourcePath-based, no 5s rule).
 * Rule: same timestamp = same preview session, add to media; different timestamp = new preview, replace.
 */
function buildPageMediaFromMedialog(medialogEntries) {
  const pageMediaMap = new Map(); // path -> { timestamp, entries: [{ hash, url, name, ... }] }
  const standaloneBuffer = [];

  medialogEntries.forEach((media) => {
    if (media.originalFilename && !media.resourcePath) {
      standaloneBuffer.push(media);
      return;
    }
    if (!media.resourcePath) return;

    const normPath = normalizePath(media.resourcePath);

    // Check if resourcePath points to the media file itself (self-reference)
    // media.path is the full URL, extract pathname for comparison
    let mediaFilePath;
    try {
      const url = new URL(media.path);
      // Remove query params and hash
      mediaFilePath = normalizePath(url.pathname);
    } catch {
      // If not a URL, assume it's already a path
      mediaFilePath = normalizePath(media.path);
    }

    // Self-reference check: resourcePath === media file path
    // Example: resourcePath="/images/logo.png" and media.path="https://.../images/logo.png"
    if (mediaFilePath === normPath) {
      // Self-reference: media file previewed directly, not embedded in a page
      standaloneBuffer.push(media);
      return;
    }

    const entry = {
      hash: media.mediaHash,
      url: media.path,
      name: extractName(media),
      timestamp: media.timestamp,
      user: media.user,
      operation: media.operation,
      type: detectMediaType(media),
    };

    const existing = pageMediaMap.get(normPath);
    if (!existing || media.timestamp !== existing.timestamp) {
      pageMediaMap.set(normPath, { timestamp: media.timestamp, entries: [entry] });
    } else {
      existing.entries.push(entry);
    }
  });

  return { pageMediaMap, standaloneBuffer };
}

/**
 * Convert page-media map to entryMap (hash|doc -> entry).
 */
function pageMediaToEntryMap(pageMediaMap) {
  const entryMap = new Map();
  const referencedHashes = new Set();

  pageMediaMap.forEach(({ entries }, doc) => {
    entries.forEach((e) => {
      const key = `${e.hash}|${doc}`;
      const existing = entryMap.get(key);
      if (!existing || e.timestamp > existing.timestamp) {
        entryMap.set(key, {
          hash: e.hash,
          url: e.url,
          name: e.name,
          timestamp: e.timestamp,
          user: e.user,
          operation: e.operation,
          type: e.type,
          doc,
          status: 'referenced',
        });
        referencedHashes.add(e.hash);
      }
    });
  });

  return { entryMap, referencedHashes };
}

function removeOrOrphanMedia(idx, entry, path, medialog) {
  const i = idx.findIndex((e) => e.hash === entry.hash && e.doc === path);
  if (i === -1) return 0;
  const { hash } = entry;
  const hasUnlink = medialog.some((m) => m.mediaHash === hash && (m.operation === 'unlink' || m.operation === 'delete'));
  idx.splice(i, 1);
  const stillHasEntry = idx.some((e) => e.hash === hash);
  const alreadyUnused = idx.some((e) => e.hash === hash && !e.doc);
  if (!stillHasEntry && !hasUnlink && !alreadyUnused) {
    idx.push({
      hash,
      url: entry.url,
      name: entry.name,
      timestamp: entry.timestamp,
      user: entry.user,
      operation: entry.operation,
      type: entry.type,
      doc: '',
      status: 'unused',
    });
  }
  return 1;
}

/**
 * Page-based incremental update: use resourcePath directly (no window).
 * Processes union of pages from audit log and pages from medialog.
 * Uses bypage map for O(1) lookups of existing page media.
 */
function processPageMediaUpdates(updatedIndex, pagesByPath, medialogEntries, usageMap, onLog) {
  const { pageMediaMap } = buildPageMediaFromMedialog(medialogEntries);
  const allPages = new Set([...pagesByPath.keys(), ...pageMediaMap.keys()]);
  let added = 0;
  let removed = 0;

  allPages.forEach((normalizedPath) => {
    const oldHashes = usageMap.get(normalizedPath) || new Set();
    const pageData = pageMediaMap.get(normalizedPath);
    const newEntries = pageData ? pageData.entries : [];

    onLog(`--- Page: ${normalizedPath} ---`);
    onLog(`  Old (bypage): ${oldHashes.size}, New (page-based): ${newEntries.length}`);

    if (newEntries.length === 0 && oldHashes.size > 0) {
      onLog('  Edge case: Page previewed with no media - removing old entries');
      oldHashes.forEach((hash) => {
        const oldEntry = updatedIndex.find((e) => e.hash === hash && e.doc === normalizedPath);
        if (oldEntry) {
          removed += removeOrOrphanMedia(updatedIndex, oldEntry, normalizedPath, medialogEntries);
        }
      });
      return;
    }

    const newHashes = new Set(newEntries.map((e) => e.hash));
    const toRemove = [...oldHashes].filter((h) => !newHashes.has(h));
    const toAdd = [...newHashes].filter((h) => !oldHashes.has(h));

    if (toRemove.length || toAdd.length) {
      onLog(`  Diff: remove ${toRemove.length}, add ${toAdd.length}`);
    }

    toRemove.forEach((hash) => {
      const oldEntry = updatedIndex.find((e) => e.hash === hash && e.doc === normalizedPath);
      if (oldEntry) {
        removed += removeOrOrphanMedia(updatedIndex, oldEntry, normalizedPath, medialogEntries);
      }
    });

    toAdd.forEach((hash) => {
      const entry = newEntries.find((e) => e.hash === hash);
      if (entry) {
        updatedIndex.push({
          hash: entry.hash,
          url: entry.url,
          name: entry.name,
          timestamp: entry.timestamp,
          user: entry.user,
          operation: entry.operation,
          type: entry.type,
          doc: normalizedPath,
          status: 'referenced',
        });
        added += 1;
      }
    });

    newEntries.forEach((e) => {
      const idx = updatedIndex.findIndex((x) => x.hash === e.hash && x.doc === normalizedPath);
      if (idx !== -1) updatedIndex[idx].timestamp = e.timestamp;
    });
  });

  return { added, removed };
}

function processStandaloneUploads(updatedIndex, medialogEntries, referencedHashes) {
  let added = 0;
  const standaloneUploads = medialogEntries.filter((m) => !m.resourcePath && m.originalFilename);

  standaloneUploads.forEach((media) => {
    if (!referencedHashes.has(media.mediaHash)) {
      const exists = updatedIndex.some((e) => e.hash === media.mediaHash && !e.doc);
      if (!exists) {
        updatedIndex.push({
          hash: media.mediaHash,
          url: media.path,
          name: media.originalFilename.split('/').pop(),
          timestamp: media.timestamp,
          user: media.user,
          operation: media.operation,
          type: detectMediaType(media),
          doc: '',
          status: 'unused',
        });
        added += 1;
      }
    }
  });

  return added;
}

async function processLinkedContent(
  updatedIndex,
  files,
  pages,
  org,
  repo,
  ref,
  onProgress,
  onLog,
) {
  let added = 0;
  let removed = 0;

  const filesByPath = new Map();
  files.forEach((e) => {
    if (!isPdfOrSvg(e.path) && !isFragmentDoc(e.path)) return;
    const p = e.path;
    const existing = filesByPath.get(p);
    if (!existing || e.timestamp > existing.timestamp) filesByPath.set(p, e);
  });

  const deletedPaths = new Set();
  filesByPath.forEach((event, path) => {
    if (event.method === 'DELETE') deletedPaths.add(path);
  });

  // Remove deleted linked content (all entries for this hash)
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

  // Build usage map
  onProgress({ stage: 'processing', message: 'Building usage map for linked content...', percent: 83 });
  const usageMap = await buildUsageMap(pages, org, repo, ref, (p) => onProgress(p));

  const allLinkedPaths = new Set(filesByPath.keys());
  ['pdfs', 'svgs', 'fragments'].forEach((key) => {
    usageMap[key]?.forEach((_, path) => allLinkedPaths.add(path));
  });

  // Add existing linked content paths whose pages were parsed
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
        if (existingIdx !== -1) {
          updatedIndex[existingIdx].timestamp = fileEvent.timestamp;
          updatedIndex[existingIdx].status = status;
          if (!updatedIndex[existingIdx].url || updatedIndex[existingIdx].url === '') {
            let urlPath = filePath;
            if (filePath.startsWith(Paths.FRAGMENTS) && filePath.endsWith(Paths.EXT_HTML)) {
              urlPath = filePath.replace(/\.html$/, '');
            }
            updatedIndex[existingIdx].url = `https://main--${repo}--${org}.aem.page${urlPath}`;
          }
        } else {
          updatedIndex.push(toLinkedContentEntry(filePath, doc, fileEvent, status, org, repo));
          added += 1;
        }
      });
    }
  });

  // External media (from markdown - no lastModified) - one entry per (url, doc)
  const externalUrls = usageMap.externalMedia ? [...usageMap.externalMedia.keys()] : [];
  externalUrls.forEach((url) => {
    const data = usageMap.externalMedia.get(url) || { pages: [], latestTimestamp: 0 };
    const { pages: linkedPages, latestTimestamp } = data;
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
      const entry = toExternalMediaEntry(url, doc, latestTimestamp);
      if (!entry) return;
      if (existingIdx !== -1) {
        updatedIndex[existingIdx].status = 'referenced';
        updatedIndex[existingIdx].timestamp = latestTimestamp;
      } else {
        updatedIndex.push(entry);
        added += 1;
      }
    });
  });

  return { added, removed };
}

export async function buildIncrementalIndex(
  sitePath,
  org,
  repo,
  ref,
  onProgress,
  onLog = noop,
  onProgressiveData = null,
) {
  const log = typeof onLog === 'function' ? onLog : noop;
  const metaPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`;
  const indexPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX}`;
  const meta = await loadIndexMeta(metaPath);
  const lastFetchTime = meta?.lastFetchTime;

  if (!lastFetchTime) {
    throw new Error('Cannot run incremental: meta missing lastFetchTime');
  }

  log(`lastFetchTime: ${lastFetchTime} (${new Date(lastFetchTime).toISOString()})`);
  const t0 = Date.now();
  const perf = {
    mode: 'incremental',
    tag: PERF_TAG,
    org,
    repo,
    ref,
    sitePath,
    loadExistingMs: 0,
    auditLog: { streamed: 0, chunks: 0, previewOnly: 0, pagesForParsing: 0, filesCount: 0, durationMs: 0 },
    medialog: { streamed: 0, chunks: 0, resourcePathCount: 0, matched: 0, standalone: 0, durationMs: 0 },
    markdownParse: { pages: 0, durationMs: 0 },
    saveDurationMs: 0,
    indexEntries: 0,
    totalDurationMs: 0,
  };

  onProgress({
    stage: 'starting',
    message: 'Mode: Incremental re-index (since last build)',
    percent: 5,
  });

  onProgress({ stage: 'loading', message: 'Loading existing index...', percent: 8 });
  const loadStart = Date.now();
  const existingIndex = await loadMultiSheet(indexPath, SheetNames.MEDIA);
  const usageData = await loadMultiSheet(indexPath, SheetNames.USAGE);
  perf.loadExistingMs = Date.now() - loadStart;

  // Build bypage map for O(1) lookups: Map<page, Set<hash>>
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

  if (onProgressiveData && existingIndex?.length > 0) {
    onProgressiveData(existingIndex);
  }

  log(`Fetching auditlog + medialog since ${new Date(lastFetchTime).toISOString()} (parallel)`);
  onProgress({ stage: 'fetching', message: 'Fetching audit log + medialog (parallel)...', percent: 15 });

  const auditLogStart = Date.now();
  const medialogStart = Date.now();
  const auditlogEntries = [];
  const medialogEntries = [];

  await Promise.all([
    streamLog('log', org, repo, ref, lastFetchTime, IndexConfig.API_PAGE_SIZE, (entries) => {
      perf.auditLog.chunks += 1;
      perf.auditLog.streamed += entries.length;
      auditlogEntries.push(...entries);
      onProgress({
        stage: 'fetching',
        message: `Audit: ${auditlogEntries.length}, Medialog: ${medialogEntries.length}...`,
        percent: 25,
      });
    }),
    streamLog('medialog', org, repo, ref, lastFetchTime, IndexConfig.API_PAGE_SIZE, (entries) => {
      perf.medialog.chunks += 1;
      perf.medialog.streamed += entries.length;
      medialogEntries.push(...entries);
      onProgress({
        stage: 'fetching',
        message: `Audit: ${auditlogEntries.length}, Medialog: ${medialogEntries.length}...`,
        percent: 25,
      });
    }),
  ]);

  perf.auditLog.durationMs = Date.now() - auditLogStart;
  perf.medialog.durationMs = Date.now() - medialogStart;

  const validEntries = auditlogEntries.filter((e) => e && e.path && e.route === 'preview');
  const pagesFiltered = validEntries.filter((e) => isPage(e.path));
  const pagesByPath = new Map();
  const deletedPages = new Set();
  pagesFiltered.forEach((e) => {
    const p = normalizePath(e.path);
    if (e.method === 'DELETE') {
      deletedPages.add(p);
      pagesByPath.delete(p);
    } else {
      deletedPages.delete(p); // Clear from deletedPages if page was recreated
      const existing = pagesByPath.get(p);
      if (!existing || e.timestamp > existing[0].timestamp) {
        pagesByPath.set(p, [e]);
      }
    }
  });
  const pages = [];
  pagesByPath.forEach((events) => pages.push(...events));

  perf.auditLog.previewOnly = validEntries.length;
  perf.auditLog.pagesForParsing = pages.length;
  perf.auditLog.filesCount = validEntries.filter((e) => !isPage(e.path)).length;
  perf.medialog.resourcePathCount = medialogEntries.filter((m) => m?.resourcePath).length;
  perf.medialog.standalone = medialogEntries.filter((m) => m?.originalFilename && !m?.resourcePath).length;

  if (pages.length === 0 && medialogEntries.length === 0) {
    perf.indexEntries = existingIndex.length;
    perf.totalDurationMs = Date.now() - t0;
    perf.collectedAt = new Date().toISOString();
    logPerf(perf);
    onProgress({
      stage: 'complete',
      message: 'No new activity since last build - index unchanged',
      percent: 100,
    });
    return existingIndex;
  }

  log(`Auditlog: ${auditlogEntries.length} entries, ${pages.length} pages`);
  log(`Medialog: ${medialogEntries.length} entries (all since lastFetchTime)`);
  onProgress({
    stage: 'processing',
    message: `Processing ${pages.length} pages with ${medialogEntries.length} medialog entries...`,
    percent: 55,
  });

  const updatedIndex = [...existingIndex];

  log('Page-based medialog (resourcePath direct, no time window)');
  log(`Pages to process: ${pagesByPath.size} (${[...pagesByPath.keys()].join(', ')})`);
  log(`Medialog entries since lastFetch: ${medialogEntries.length}`);

  const pageResults = processPageMediaUpdates(updatedIndex, pagesByPath, medialogEntries, usageMap, log);
  let { added, removed } = pageResults;

  // Remove media refs for deleted pages (DELETE preview = page gone)
  deletedPages.forEach((doc) => {
    const toRemove = updatedIndex.filter((e) => e.doc === doc);
    toRemove.forEach((entry) => {
      removed += removeOrOrphanMedia(updatedIndex, entry, doc, medialogEntries);
    });
  });

  const referencedHashes = new Set(
    updatedIndex.filter((e) => e.doc).flatMap((e) => e.hash),
  );

  const standaloneAdded = processStandaloneUploads(updatedIndex, medialogEntries, referencedHashes);
  added += standaloneAdded;

  const files = validEntries.filter((e) => !isPage(e.path));
  const markdownParseStart = Date.now();
  const linkedResults = await processLinkedContent(
    updatedIndex,
    files,
    pages,
    org,
    repo,
    ref,
    onProgress,
    log,
  );
  perf.markdownParse.pages = pages.length;
  perf.markdownParse.durationMs = Date.now() - markdownParseStart;
  added += linkedResults.added;
  removed += linkedResults.removed;

  onProgress({
    stage: 'processing',
    message: `Incremental: +${added} added, -${removed} removed, total: ${updatedIndex.length}`,
    percent: 85,
  });

  onProgress({ stage: 'saving', message: 'Building multi-sheet index (bymedia, bypage)...', percent: 87 });

  const mediaSheet = buildMediaSheet(updatedIndex);
  const usageSheet = buildUsageSheet(updatedIndex);

  onProgress({
    stage: 'saving',
    message: `Saving ${mediaSheet.length} media entries, ${usageSheet.length} page-hash pairs...`,
    percent: 90,
  });

  const saveStart = Date.now();
  const formData = await createMultiSheet({
    [SheetNames.MEDIA]: mediaSheet,
    [SheetNames.USAGE]: usageSheet,
  });
  await daFetch(`${DA_ORIGIN}/source${indexPath}`, {
    method: 'POST',
    body: formData,
  });

  await saveIndexMeta({
    lastFetchTime: Date.now(),
    entriesCount: updatedIndex.length,
    mediaCount: mediaSheet.length,
    usageCount: usageSheet.length,
    lastRefreshBy: 'media-indexer',
    lastBuildMode: 'incremental',
  }, metaPath);
  perf.saveDurationMs = Date.now() - saveStart;

  onProgress({
    stage: 'complete',
    message: `Incremental complete! ${mediaSheet.length} media, ${usageSheet.length} page refs (${added} added, ${removed} removed)`,
    percent: 100,
  });

  perf.indexEntries = updatedIndex.length;
  perf.mediaCount = mediaSheet.length;
  perf.usageCount = usageSheet.length;
  perf.totalDurationMs = Date.now() - t0;
  perf.collectedAt = new Date().toISOString();
  logPerf(perf);

  return updatedIndex;
}

export async function buildFullIndex(sitePath, org, repo, ref, onProgress, onProgressiveData) {
  const index = [];
  const buildMode = 'full';
  const t0 = Date.now();
  const perf = {
    mode: 'full',
    tag: PERF_TAG,
    org,
    repo,
    ref,
    sitePath,
    auditLog: { streamed: 0, chunks: 0, previewOnly: 0, pagesForParsing: 0, filesCount: 0, durationMs: 0 },
    medialog: { streamed: 0, chunks: 0, resourcePathCount: 0, matched: 0, standalone: 0, durationMs: 0 },
    markdownParse: { pages: 0, durationMs: 0 },
    saveDurationMs: 0,
    indexEntries: 0,
    totalDurationMs: 0,
  };

  onProgress({
    stage: 'starting',
    message: 'Mode: Full build (rebuilding from auditlog + medialog)',
    percent: 5,
  });

  onProgress({ stage: 'fetching', message: 'Fetching audit log + medialog (parallel)...', percent: 10 });

  const pagesByPath = new Map();
  const filesByPath = new Map();
  const deletedPaths = new Set();
  const deletedPages = new Set();
  let auditlogCount = 0;
  const auditLogStart = Date.now();
  const medialogStart = Date.now();
  const medialogChunks = [];
  let medialogResourcePathCount = 0;

  const earlyLinkedEntries = [];

  const emitEarlyLinked = () => {
    filesByPath.forEach((event, path) => {
      if (isLinkedContentPath(path) && event.method === 'DELETE') {
        deletedPaths.add(path);
      }
    });
    earlyLinkedEntries.length = 0;
    filesByPath.forEach((fileEvent, filePath) => {
      if (deletedPaths.has(filePath) || !isLinkedContentPath(filePath)) return;
      earlyLinkedEntries.push(toLinkedContentEntry(filePath, '', fileEvent, 'discovering', org, repo));
    });
    if (onProgressiveData && earlyLinkedEntries.length > 0) {
      onProgressiveData(dedupeProgressiveItems(earlyLinkedEntries));
    }
  };

  await Promise.all([
    streamLog('log', org, repo, ref, null, IndexConfig.API_PAGE_SIZE, (chunk) => {
      perf.auditLog.chunks += 1;
      perf.auditLog.streamed += chunk.length;
      chunk.forEach((e) => {
        if (!e?.path || e.route !== 'preview') return;
        auditlogCount += 1;
        if (isPage(e.path)) {
          const p = normalizePath(e.path);
          if (e.method === 'DELETE') {
            deletedPages.add(p);
            pagesByPath.delete(p);
          } else {
            deletedPages.delete(p); // Clear from deletedPages if page was recreated
            const existing = pagesByPath.get(p);
            if (!existing || e.timestamp > existing[0].timestamp) {
              pagesByPath.set(p, [e]);
            }
          }
        } else {
          const fp = toAbsoluteFilePath(e.path);
          const existing = filesByPath.get(fp);
          if (!existing || e.timestamp > existing.timestamp) {
            filesByPath.set(fp, e);
          }
        }
      });
      emitEarlyLinked();
      onProgress({
        stage: 'fetching',
        message: `Audit: ${auditlogCount} preview, Medialog: ${medialogChunks.reduce((s, c) => s + c.length, 0)} entries...`,
        percent: 15,
      });
    }),
    streamLog('medialog', org, repo, ref, null, IndexConfig.API_PAGE_SIZE, (chunk) => {
      perf.medialog.chunks += 1;
      chunk.forEach((m) => {
        if (m.resourcePath) medialogResourcePathCount += 1;
      });
      medialogChunks.push(chunk);
      onProgress({
        stage: 'fetching',
        message: `Audit: ${auditlogCount} preview, Medialog: ${medialogChunks.reduce((s, c) => s + c.length, 0)} entries...`,
        percent: 15,
      });
    }),
  ]);

  perf.auditLog.previewOnly = auditlogCount;
  perf.auditLog.filesCount = filesByPath.size;
  perf.auditLog.durationMs = Date.now() - auditLogStart;
  perf.medialog.streamed = medialogChunks.reduce((s, c) => s + c.length, 0);
  perf.medialog.resourcePathCount = medialogResourcePathCount;
  perf.medialog.durationMs = Date.now() - medialogStart;

  const pages = [];
  pagesByPath.forEach((events) => pages.push(...events));
  perf.auditLog.pagesForParsing = pages.length;

  filesByPath.forEach((event, path) => {
    if (isLinkedContentPath(path) && event.method === 'DELETE') {
      deletedPaths.add(path);
    }
  });

  onProgress({
    stage: 'processing',
    message: `Building index from ${perf.medialog.streamed} medialog (page-based)...`,
    percent: 35,
  });

  const medialogEntries = medialogChunks.flat();
  const { pageMediaMap, standaloneBuffer } = buildPageMediaFromMedialog(medialogEntries);
  const { entryMap, referencedHashes } = pageMediaToEntryMap(pageMediaMap);
  perf.medialog.matched = entryMap.size;
  perf.medialog.standalone = standaloneBuffer.length;

  onProgress({
    stage: 'processing',
    message: `Processed ${perf.medialog.streamed} medialog, ${entryMap.size} page refs`,
    percent: 60,
  });

  // Phase 3: Process standalone uploads
  standaloneBuffer.forEach((media) => {
    const hash = media.mediaHash;
    if (!referencedHashes.has(hash)) {
      const key = `${hash}|`;
      const existing = entryMap.get(key);
      if (!existing || media.timestamp > existing.timestamp) {
        entryMap.set(key, {
          hash,
          url: media.path,
          name: media.originalFilename.split('/').pop(),
          timestamp: media.timestamp,
          user: media.user,
          operation: media.operation,
          type: detectMediaType(media),
          doc: '',
          status: 'unused',
        });
      }
    }
  });

  onProgress({
    stage: 'processing',
    message: `Standalone: ${standaloneBuffer.length}, total: ${entryMap.size}`,
    percent: 70,
  });

  // Convert Map to array
  entryMap.forEach((entry) => {
    index.push(entry);
  });

  // Remove media refs for deleted pages (DELETE preview = page gone, no longer references media)
  deletedPages.forEach((doc) => {
    const toRemove = index.filter((e) => e.doc === doc);
    toRemove.forEach((entry) => {
      removeOrOrphanMedia(index, entry, doc, medialogEntries);
    });
  });

  if (onProgressiveData && (index.length > 0 || earlyLinkedEntries.length > 0)) {
    const combined = [...earlyLinkedEntries, ...index];
    onProgressiveData(dedupeProgressiveItems(combined));
  }

  // Phase 5: Linked content (PDFs, SVGs, fragments) - parse pages for usage
  onProgress({ stage: 'processing', message: 'Building content usage map (parsing pages)...', percent: 78 });
  const markdownParseStart = Date.now();
  const usageMap = await buildUsageMap(pages, org, repo, ref, (p) => onProgress(p));
  perf.markdownParse.pages = pages.length;
  perf.markdownParse.durationMs = Date.now() - markdownParseStart;

  const linkedFilesByPath = new Map();
  filesByPath.forEach((e, p) => {
    if (!isPdfOrSvg(p) && !isFragmentDoc(p)) return;
    linkedFilesByPath.set(p, e);
  });

  const usageKey = (path) => {
    if (isPdf(path)) return 'pdfs';
    if (isSvg(path)) return 'svgs';
    return 'fragments';
  };

  const allLinkedPaths = new Set(linkedFilesByPath.keys());
  ['pdfs', 'svgs', 'fragments'].forEach((key) => {
    usageMap[key]?.forEach((_, path) => allLinkedPaths.add(path));
  });

  allLinkedPaths.forEach((filePath) => {
    if (deletedPaths.has(filePath)) return;
    const key = usageKey(filePath);
    const linkedPages = usageMap[key]?.get(filePath) || [];
    const status = linkedPages.length > 0 ? 'referenced' : 'unused';
    const fileEvent = linkedFilesByPath.get(filePath) || { timestamp: 0, user: '' };
    if (linkedPages.length === 0) {
      index.push(toLinkedContentEntry(filePath, '', fileEvent, status, org, repo));
    } else {
      linkedPages.forEach((doc) => {
        index.push(toLinkedContentEntry(filePath, doc, fileEvent, status, org, repo));
      });
    }
  });

  // External media: one entry per (url, doc), only when referenced
  const externalUrls = usageMap.externalMedia ? [...usageMap.externalMedia.keys()] : [];
  externalUrls.forEach((url) => {
    const data = usageMap.externalMedia.get(url) || { pages: [], latestTimestamp: 0 };
    const { pages: linkedPages, latestTimestamp } = data;
    if (linkedPages.length > 0) {
      linkedPages.forEach((doc) => {
        const entry = toExternalMediaEntry(url, doc, latestTimestamp);
        if (entry) index.push(entry);
      });
    }
  });

  if (onProgressiveData && index.length > 0) {
    onProgressiveData(dedupeProgressiveItems([...index]));
  }

  onProgress({
    stage: 'processing',
    message: `Added ${allLinkedPaths.size} linked content entries (PDFs, SVGs, fragments)`,
    percent: 82,
  });

  onProgress({ stage: 'saving', message: 'Building multi-sheet index (bymedia, bypage)...', percent: 85 });

  const mediaSheet = buildMediaSheet(index);
  const usageSheet = buildUsageSheet(index);

  onProgress({
    stage: 'saving',
    message: `Saving ${mediaSheet.length} media entries, ${usageSheet.length} page-hash pairs...`,
    percent: 90,
  });

  const saveStart = Date.now();
  const indexPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX}`;
  const formData = await createMultiSheet({
    [SheetNames.MEDIA]: mediaSheet,
    [SheetNames.USAGE]: usageSheet,
  });
  await daFetch(`${DA_ORIGIN}/source${indexPath}`, {
    method: 'POST',
    body: formData,
  });

  await saveIndexMeta({
    lastFetchTime: Date.now(),
    entriesCount: index.length,
    mediaCount: mediaSheet.length,
    usageCount: usageSheet.length,
    lastRefreshBy: 'media-indexer',
    lastBuildMode: buildMode,
  }, `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`);
  perf.saveDurationMs = Date.now() - saveStart;

  onProgress({
    stage: 'complete',
    message: `Complete! ${mediaSheet.length} media, ${usageSheet.length} page refs`,
    percent: 100,
  });

  perf.indexEntries = index.length;
  perf.mediaCount = mediaSheet.length;
  perf.usageCount = usageSheet.length;
  perf.totalDurationMs = Date.now() - t0;
  perf.collectedAt = new Date().toISOString();
  logPerf(perf);

  return index;
}
