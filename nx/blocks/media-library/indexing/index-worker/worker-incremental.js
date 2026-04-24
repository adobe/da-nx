/**
 * Worker-safe version of buildIncrementalIndex from build.js:168-527
 * Extracted verbatim from build.js, modified ONLY to:
 * - Use worker-safe imports (worker-fetch.js instead of admin-api.js)
 * - Accept runtime context for tokens and config
 * - Remove resetAemPageMarkdownRateLimiter (not needed in worker)
 */

// MODIFIED: Use worker-safe imports
import {
  streamLog,
  loadSheetMeta,
  saveIndexMeta,
  saveIndexChunks,
  loadMultiSheet,
  loadIndexChunks,
} from './worker-fetch.js';
// Use worker-safe stub for processLinkedContent
// (avoids admin-api.js → daFetch.js → public/utils/constants.js)
import {
  processLinkedContent,
} from './worker-linked-content.js';
import {
  buildCanonicalTimestampMap,
  mergeMedialogChunkIntoMap,
  removeOrOrphanMedia,
  processPageMediaUpdates,
  processStandaloneUploads,
} from '../medialog.js';
import {
  normalizePath, isPage,
  getDedupeKey,
} from '../parse.js';
import { buildMediaSheet } from '../sheets.js';
import {
  IndexConfig,
  IndexFiles,
  SheetNames,
} from '../../core/constants.js';
import { sortMediaData, getContentPathFromSitePath } from './worker-utils.js';

const INDEX_SCHEMA_VERSION = 2;

// Progressive data is now emitted as raw batches
// Bridge layer handles deduplication for display

// eslint-disable-next-line no-empty-function
function noop() {}

// Worker-safe version of loadIndexMeta
async function loadIndexMeta(path, daOrigin, imsToken) {
  return loadSheetMeta(path, daOrigin, imsToken);
}

function logPerf(perf, isPerfEnabled) {
  if (!isPerfEnabled) return;
  // eslint-disable-next-line no-console
  console.log('[perf]', JSON.stringify(perf));
}

/**
 * Worker-safe version of buildIncrementalIndex from build.js:168-527
 * Extracted verbatim, modified ONLY to:
 * - Use worker-safe API functions (streamLog, loadIndexMeta, etc.)
 * - Accept runtime context parameter (imsToken, daOrigin, etc.)
 * - Remove resetAemPageMarkdownRateLimiter (not needed in worker)
 *
 * @param {string} sitePath - Site path
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} ref - Reference (branch)
 * @param {Function} onProgress - Progress callback
 * @param {Function} onLog - Log callback
 * @param {Function} onProgressiveData - Progressive data callback
 * @param {object} context - Worker runtime context
 * @param {string} context.imsToken - IMS access token (REQUIRED)
 * @param {string} context.daOrigin - DA origin (REQUIRED)
 * @param {string} context.daEtcOrigin - DA ETC origin for CORS proxy (REQUIRED)
 * @param {boolean} context.isPerfEnabled - Enable perf logging
 * @param {object} context.IndexConfig - Index configuration (REQUIRED)
 */
export async function buildIncrementalIndex(
  sitePath,
  org,
  repo,
  ref,
  onProgress,
  onLog = noop,
  onProgressiveData = null,
  context = {},
) {
  const {
    imsToken,
    daOrigin,
    daEtcOrigin,
    isPerfEnabled = false,
  } = context;

  if (!imsToken) throw new Error('[worker-incremental] imsToken is required in context');
  if (!daOrigin) throw new Error('[worker-incremental] daOrigin is required in context');
  if (!daEtcOrigin) throw new Error('[worker-incremental] daEtcOrigin is required in context');

  // REMOVED: resetAemPageMarkdownRateLimiter() - not needed in worker
  const log = typeof onLog === 'function' ? onLog : noop;
  const metaPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`;
  const indexPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX}`;

  const meta = await loadIndexMeta(metaPath, daOrigin, imsToken);
  const lastFetchTime = meta?.lastFetchTime;

  if (!lastFetchTime) {
    // eslint-disable-next-line no-console
    console.error('[buildIncrementalIndex] No lastFetchTime in metadata, cannot run incremental build');
    throw new Error('Cannot run incremental: meta missing lastFetchTime');
  }

  if (meta.schemaVersion && meta.schemaVersion !== INDEX_SCHEMA_VERSION) {
    throw new Error(`Index schema version mismatch: expected ${INDEX_SCHEMA_VERSION}, found ${meta.schemaVersion}. Full rebuild required.`);
  }

  log(`lastFetchTime: ${lastFetchTime} (${new Date(lastFetchTime).toISOString()})`);
  const t0 = Date.now();
  const perf = {
    mode: 'incremental',
    tag: 'worker-incremental',
    org,
    repo,
    ref,
    sitePath,
    loadExistingMs: 0,
    auditLog: {
      streamed: 0, chunks: 0, previewOnly: 0, pagesForParsing: 0, filesCount: 0, durationMs: 0,
    },
    medialog: {
      streamed: 0, chunks: 0, resourcePathCount: 0, matched: 0, standalone: 0, durationMs: 0,
    },
    markdownParse: { pages: 0, durationMs: 0 },
    saveDurationMs: 0,
    indexEntries: 0,
    totalDurationMs: 0,
  };

  onProgress({
    stage: 'starting',
    message: 'Mode: Incremental re-index (since last build)',
  });

  onProgress({ stage: 'loading', message: 'Loading existing index...' });
  const loadStart = Date.now();
  const basePath = `${sitePath}/${IndexFiles.FOLDER}`;

  let existingIndex;
  let usageData;

  // Check if index is chunked
  if (meta?.chunked === true) {
    const chunkCount = meta.chunkCount || 0;
    if (chunkCount === 0) {
      // Old empty index - treat as empty
      existingIndex = [];
      usageData = [];
    } else {
      // Load all media chunks
      existingIndex = await loadIndexChunks(
        basePath,
        chunkCount,
        SheetNames.MEDIA,
        daOrigin,
        imsToken,
      );
      // Load usage only from chunk 0 (it's only stored there)
      const chunk0Path = `${basePath}/${IndexFiles.MEDIA_INDEX_CHUNK_PREFIX}000.json`;
      usageData = await loadMultiSheet(chunk0Path, SheetNames.USAGE, daOrigin, imsToken);
    }
  } else {
    // Load from single file (backward compatibility)
    existingIndex = await loadMultiSheet(indexPath, SheetNames.MEDIA, daOrigin, imsToken);
    usageData = await loadMultiSheet(indexPath, SheetNames.USAGE, daOrigin, imsToken);
  }

  perf.loadExistingMs = Date.now() - loadStart;

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

  // Normalize hash format in existing index entries
  // Hash should always be bare (e.g. "abc123"), never with prefix (e.g. "media_abc123.jpg")
  existingIndex.forEach((entry) => {
    if (entry.hash && entry.hash.startsWith('media_') && entry.hash.includes('.')) {
      entry.hash = entry.hash.substring(6, entry.hash.lastIndexOf('.'));
    }
  });

  // Convert existingIndex array to Map keyed by dedupe key for canonical metadata lookup
  const existingIndexMap = new Map();
  existingIndex.forEach((entry) => {
    if (entry.url) {
      const key = getDedupeKey(entry.url);
      existingIndexMap.set(key, entry);
    }
  });

  if (onProgressiveData && existingIndex?.length > 0) {
    onProgressiveData(existingIndex);
  }

  const bufferedSince = Math.max(0, lastFetchTime - IndexConfig.AUDITLOG_BUFFER_MS);

  log(`Fetching auditlog + medialog since ${new Date(lastFetchTime).toISOString()} (parallel)`);
  onProgress({ stage: 'fetching', message: 'Fetching audit log + medialog (parallel)...' });

  const incrContentPath = getContentPathFromSitePath(sitePath) || '';
  const progressiveMediaMap = new Map();
  const auditLogStart = Date.now();
  const medialogStart = Date.now();
  const auditlogEntries = [];
  const medialogEntries = [];

  // MODIFIED: Use worker-safe streamLog with imsToken parameter
  // Use bufferedSince for BOTH auditlog and medialog to avoid missing entries due to timing
  await Promise.all([
    streamLog('log', org, repo, ref, bufferedSince, IndexConfig.API_PAGE_SIZE, (entries) => {
      perf.auditLog.chunks += 1;
      perf.auditLog.streamed += entries.length;
      auditlogEntries.push(...entries);
      onProgress({
        stage: 'fetching',
        message: `Audit: ${auditlogEntries.length}, Medialog: ${medialogEntries.length}...`,
      });
    }, imsToken),
    streamLog('medialog', org, repo, ref, bufferedSince, IndexConfig.API_PAGE_SIZE, (entries) => {
      perf.medialog.chunks += 1;
      perf.medialog.streamed += entries.length;
      medialogEntries.push(...entries);

      mergeMedialogChunkIntoMap(
        entries,
        progressiveMediaMap,
        org,
        repo,
        incrContentPath,
        existingIndexMap,
      );
      if (onProgressiveData && progressiveMediaMap.size > 0) {
        const combined = [...existingIndex, ...Array.from(progressiveMediaMap.values())];
        onProgressiveData(combined);
      }

      onProgress({
        stage: 'fetching',
        message: `Audit: ${auditlogEntries.length}, Medialog: ${medialogEntries.length}...`,
      });
    }, imsToken),
  ]);

  perf.auditLog.durationMs = Date.now() - auditLogStart;
  perf.medialog.durationMs = Date.now() - medialogStart;

  const auditlogDeduped = [];
  const seenKeys = new Set();
  auditlogEntries.forEach((entry) => {
    const key = `${entry.path}|${entry.timestamp}|${entry.method}|${entry.route}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      auditlogDeduped.push(entry);
    }
  });

  const contentPath = getContentPathFromSitePath(sitePath);
  let pathPrefix = null;
  if (contentPath) {
    pathPrefix = contentPath.endsWith('/') ? contentPath : `${contentPath}/`;
  }
  const startsWithPrefix = (p) => p && p.startsWith(pathPrefix);
  const isUnderPath = (path) => !pathPrefix || path === contentPath || startsWithPrefix(path);

  let validEntries = auditlogDeduped.filter((e) => e && e.path && e.route === 'preview');
  if (pathPrefix) {
    validEntries = validEntries.filter((e) => isUnderPath(e.path));
  }
  let medialogScoped = medialogEntries;
  if (pathPrefix) {
    medialogScoped = medialogEntries.filter(
      (m) => m.resourcePath && isUnderPath(normalizePath(m.resourcePath)),
    );
  }

  const pagesFiltered = validEntries.filter((e) => isPage(e.path));
  const pagesByPath = new Map();
  const deletedPages = new Set();
  pagesFiltered.forEach((e) => {
    const p = normalizePath(e.path);
    if (e.method === 'DELETE') {
      deletedPages.add(p);
      pagesByPath.delete(p);
    } else {
      deletedPages.delete(p);
      const existing = pagesByPath.get(p);
      if (!existing || e.timestamp > existing[0].timestamp) {
        pagesByPath.set(p, [e]);
      }
    }
  });

  const pages = [];
  pagesByPath.forEach((events) => pages.push(...events));

  // Compute medialog metrics in single pass
  let medialogResourcePathCount = 0;
  let medialogStandaloneCount = 0;
  medialogScoped.forEach((m) => {
    if (m?.resourcePath) {
      medialogResourcePathCount += 1;
    } else if (m?.originalFilename && !m?.resourcePath) {
      medialogStandaloneCount += 1;
    }
  });

  perf.auditLog.previewOnly = validEntries.length;
  perf.auditLog.pagesForParsing = pages.length;
  perf.auditLog.filesCount = validEntries.length - pagesFiltered.length;
  perf.medialog.resourcePathCount = medialogResourcePathCount;
  perf.medialog.standalone = medialogStandaloneCount;

  if (pages.length === 0 && medialogScoped.length === 0) {
    perf.indexEntries = existingIndex.length;
    perf.totalDurationMs = Date.now() - t0;
    perf.collectedAt = new Date().toISOString();
    logPerf(perf, isPerfEnabled);
    onProgress({
      stage: 'complete',
      message: 'No new activity since last build - index unchanged',
    });
    return existingIndex;
  }

  log(`Auditlog: ${auditlogEntries.length} entries, ${pages.length} pages (path-scoped: ${!!pathPrefix})`);
  log(`Medialog: ${medialogScoped.length} entries (all since lastFetchTime)`);
  const pg = pages.length;
  const mg = medialogScoped.length;
  const procMsg = `Processing ${pg} pages with ${mg} medialog entries...`;
  onProgress({
    stage: 'processing',
    message: procMsg,
  });

  const updatedIndex = [...existingIndex];

  const canonicalTimestamps = buildCanonicalTimestampMap(medialogScoped);

  let cleanedMedialog = medialogScoped;
  if (pages.length > 0 && medialogScoped.length > 0) {
    const latestTimestampByPage = new Map();
    medialogScoped.forEach((entry) => {
      if (!entry.resourcePath) return;
      const page = normalizePath(entry.resourcePath);
      const current = latestTimestampByPage.get(page) || 0;
      latestTimestampByPage.set(page, Math.max(current, entry.timestamp));
    });

    cleanedMedialog = medialogScoped.filter((entry) => {
      if (!entry.resourcePath) return true;
      const page = normalizePath(entry.resourcePath);
      const latestTimestamp = latestTimestampByPage.get(page);
      return entry.timestamp === latestTimestamp;
    });
  }

  const idx = updatedIndex;
  const byPath = pagesByPath;
  const medialog = cleanedMedialog;
  const pageResults = processPageMediaUpdates(
    idx,
    byPath,
    medialog,
    usageMap,
    log,
    org,
    repo,
    existingIndexMap,
    canonicalTimestamps,
  );
  let { added, removed } = pageResults;

  deletedPages.forEach((doc) => {
    const toRemove = updatedIndex.filter((e) => e.doc === doc);
    toRemove.forEach((entry) => {
      removed += removeOrOrphanMedia(updatedIndex, entry, doc, cleanedMedialog);
    });
  });

  const referencedHashes = new Set(
    updatedIndex.filter((e) => e.doc).flatMap((e) => e.hash),
  );

  const standaloneAdded = processStandaloneUploads(
    updatedIndex,
    cleanedMedialog,
    referencedHashes,
    org,
    repo,
  );
  added += standaloneAdded;

  const processedPages = new Set(pagesByPath.keys());
  processedPages.forEach((page) => {
    usageMap.delete(page);
  });

  updatedIndex.forEach((entry) => {
    if (entry.doc && entry.hash && processedPages.has(entry.doc)) {
      if (!usageMap.has(entry.doc)) {
        usageMap.set(entry.doc, new Set());
      }
      usageMap.get(entry.doc).add(entry.hash);
    }
  });

  deletedPages.forEach((doc) => {
    usageMap.delete(doc);
  });

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
    null, // prebuiltUsageMap - not used in incremental
    context, // context for worker-safe buildUsageMap
  );
  perf.markdownParse.pages = pages.length;
  perf.markdownParse.durationMs = Date.now() - markdownParseStart;
  added += linkedResults.added;
  removed += linkedResults.removed;

  // Image truthing: orphan stale image references using usageMap from processLinkedContent
  if (linkedResults.usageMap?.images) {
    const truthStart = Date.now();
    const imageToPages = new Map(); // imagePath -> Set(pagePaths)
    linkedResults.usageMap.images.forEach((linkedPages, imagePath) => {
      const normalized = normalizePath(imagePath);
      if (!imageToPages.has(normalized)) {
        imageToPages.set(normalized, new Set());
      }
      linkedPages.forEach((page) => imageToPages.get(normalized).add(page));
    });

    let orphanedCount = 0;
    let truthedCount = 0;
    let totalImageEntries = 0;

    updatedIndex.forEach((entry) => {
      const isImage = entry.type === 'image' || entry.type === 'video';
      if (isImage) totalImageEntries += 1;

      const hasDoc = entry.doc && entry.doc !== '';

      if (isImage && hasDoc) {
        // Image with a doc reference - verify it's actually in the markdown for that page
        let entryPath;
        try {
          entryPath = new URL(entry.url).pathname;
        } catch {
          entryPath = entry.url;
        }
        const normalizedPath = normalizePath(entryPath);
        const pagesWithImage = imageToPages.get(normalizedPath);

        // Check if this specific doc reference is valid
        if (!pagesWithImage || !pagesWithImage.has(entry.doc)) {
          // Stale reference - image exists but not on this page anymore
          // Orphan it by setting doc='' (don't remove from index)
          entry.doc = '';
          orphanedCount += 1;
        } else {
          truthedCount += 1;
        }
      }
    });

    const truthDurationMs = Date.now() - truthStart;

    if (context?.isPerfEnabled && orphanedCount > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[worker-incremental] Image truthing: ${truthedCount} valid refs, ${orphanedCount} stale refs orphaned in ${truthDurationMs}ms`,
      );
    }

    perf.imageTruthing = {
      durationMs: truthDurationMs,
      totalImageEntries,
      validReferences: truthedCount,
      orphanedReferences: orphanedCount,
      imagePathsInMarkdown: imageToPages.size,
    };
  }

  onProgress({
    stage: 'processing',
    message: `Incremental: +${added} added, -${removed} removed, total: ${updatedIndex.length}`,
  });

  onProgress({ stage: 'saving', message: 'Sorting index by modified timestamp...' });

  const sortedIndex = sortMediaData(updatedIndex);

  onProgress({ stage: 'saving', message: 'Building multi-sheet index (bymedia, bypage)...' });

  const mediaSheet = buildMediaSheet(sortedIndex);

  // Build usage sheet from usageMap to preserve all page references (changed AND unchanged)
  // buildUsageSheet(updatedIndex) would only include changed pages since existingIndex
  // is loaded from deduplicated media sheet without doc fields
  const usageSheet = Array.from(usageMap.entries()).map(([page, hashSet]) => ({
    page,
    hashes: JSON.stringify(Array.from(hashSet)),
  }));

  onProgress({
    stage: 'saving',
    message: `Saving ${mediaSheet.length} media entries, ${usageSheet.length} page-hash pairs...`,
  });

  const saveStart = Date.now();
  const chunkSize = IndexConfig.MEDIA_INDEX_CHUNK_SIZE;

  // MODIFIED: Use worker-safe saveIndexChunks with imsToken
  const chunkCount = await saveIndexChunks(
    basePath,
    mediaSheet,
    usageSheet,
    chunkSize,
    daOrigin,
    imsToken,
    IndexFiles.MEDIA_INDEX_CHUNK_PREFIX,
  );

  // MODIFIED: Use worker-safe saveIndexMeta with imsToken
  const metaResp = await saveIndexMeta({
    lastFetchTime: Date.now(),
    entriesCount: updatedIndex.length,
    mediaCount: mediaSheet.length,
    usageCount: usageSheet.length,
    lastRefreshBy: 'media-indexer',
    lastBuildMode: 'incremental',
    chunked: true,
    chunkCount,
    chunkSize,
    schemaVersion: INDEX_SCHEMA_VERSION,
  }, metaPath, daOrigin, imsToken);

  if (!metaResp.ok) {
    throw new Error('Failed to save index metadata');
  }
  perf.saveDurationMs = Date.now() - saveStart;

  onProgress({
    stage: 'complete',
    message: `Incremental complete! ${mediaSheet.length} media, ${usageSheet.length} page refs (${added} added, ${removed} removed)`,
  });

  perf.indexEntries = updatedIndex.length;
  perf.mediaCount = mediaSheet.length;
  perf.usageCount = usageSheet.length;
  perf.totalDurationMs = Date.now() - t0;
  perf.collectedAt = new Date().toISOString();
  logPerf(perf, isPerfEnabled);

  return updatedIndex;
}
