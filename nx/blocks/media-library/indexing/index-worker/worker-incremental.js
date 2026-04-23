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
  createMedialogEntry,
} from '../parse.js';
import { buildUsageMap } from './worker-parse.js';
import { canonicalizeMediaUrl } from '../../core/urls.js';
import { buildMediaSheet } from '../sheets.js';
import {
  IndexConfig,
  IndexFiles,
  SheetNames,
} from '../../core/constants.js';
import { sortMediaData, getContentPathFromSitePath } from './worker-utils.js';

const INDEX_SCHEMA_VERSION = 2;

// Helper function from build.js:95-104
function dedupeProgressiveItems(items) {
  const byKey = new Map();
  items.forEach((item) => {
    const key = `${item.hash}|${item.doc || ''}`;
    const existing = byKey.get(key);
    if (!existing || item.modified > existing.modified) {
      byKey.set(key, item);
    }
  });
  return Array.from(byKey.values());
}

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
 * Processes images parsed from markdown and merges with index.
 * For each image found in markdown:
 * - Match with medialog for metadata (timestamp, user, operation)
 * - If not in medialog, use page timestamp as fallback
 * - Add/remove entries based on diff with old usageMap
 *
 * @param {Array} updatedIndex - Index array to update
 * @param {Map} parsedImagesMap - usageMap.images from buildUsageMap (imagePath -> [pagePaths])
 * @param {Map} oldUsageMap - Old usageMap (page -> Set(hashes))
 * @param {Array} pageEvents - Page events (for timestamps)
 * @param {Array} medialogEntries - Medialog entries (for metadata)
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {Function} onLog - Log callback
 * @param {Map} existingIndexMap - Existing index map (for canonical metadata)
 * @param {Map} canonicalTimestamps - Canonical timestamp map
 * @returns {{added: number, removed: number}}
 */
function processMarkdownParsedImages(
  updatedIndex,
  parsedImagesMap,
  oldUsageMap,
  pageEvents,
  medialogEntries,
  org,
  repo,
  onLog,
  existingIndexMap,
  canonicalTimestamps,
) {
  let added = 0;
  let removed = 0;

  // Build medialog lookup map (O(1) by filename)
  const medialogByFilename = new Map();
  medialogEntries.forEach((m) => {
    if (!m.path) return;
    const cleanPath = m.path.split('?')[0].split('#')[0];
    const filename = cleanPath.split('/').pop();

    if (!medialogByFilename.has(filename)) {
      medialogByFilename.set(filename, []);
    }
    medialogByFilename.get(filename).push(m);
  });

  // Build page events lookup for timestamps
  const pageEventsByPath = new Map();
  pageEvents.forEach((e) => {
    const p = normalizePath(e.path);
    if (!pageEventsByPath.has(p)) {
      pageEventsByPath.set(p, []);
    }
    pageEventsByPath.get(p).push(e);
  });

  // Build set of all pages that were parsed
  const parsedPages = new Set();
  parsedImagesMap.forEach((pagePaths) => {
    pagePaths.forEach((pageDoc) => parsedPages.add(pageDoc));
  });

  // Build new state: page → Set(image hashes) from parsed markdown
  const newImagesByPage = new Map();
  parsedImagesMap.forEach((pagePaths, imagePath) => {
    const url = canonicalizeMediaUrl(imagePath, org, repo);
    const dedupeKey = getDedupeKey(url);
    const cleanImagePath = imagePath.split('?')[0].split('#')[0];
    const filename = cleanImagePath.split('/').pop();
    const medialogMatches = medialogByFilename.get(filename) || [];
    const existingEntry = existingIndexMap.get(dedupeKey);

    // Normalize hash: medialog uses bare hash, but existingEntry might have full filename
    // Extract hash from existingEntry if it looks like "media_<hash>.ext"
    let existingHash = existingEntry?.hash;
    if (existingHash && existingHash.startsWith('media_') && existingHash.includes('.')) {
      // Extract hash from "media_<hash>.ext" → "<hash>"
      existingHash = existingHash.substring(6, existingHash.lastIndexOf('.'));
    }

    const hash = medialogMatches[0]?.mediaHash || existingHash || dedupeKey;

    pagePaths.forEach((pageDoc) => {
      if (!newImagesByPage.has(pageDoc)) {
        newImagesByPage.set(pageDoc, new Set());
      }
      newImagesByPage.get(pageDoc).add(hash);
    });
  });

  // For each parsed page, remove page references for images no longer in markdown
  // BUT preserve the image as standalone if this is its only reference
  parsedPages.forEach((pageDoc) => {
    const oldHashes = oldUsageMap.get(pageDoc) || new Set();
    const newHashes = newImagesByPage.get(pageDoc) || new Set();
    const toRemove = [...oldHashes].filter((h) => !newHashes.has(h));

    toRemove.forEach((hash) => {
      if (hash.startsWith('http://') || hash.startsWith('https://')) {
        return;
      }

      const idx = updatedIndex.findIndex((e) => e.hash === hash && e.doc === pageDoc);
      if (idx !== -1) {
        const entry = updatedIndex[idx];

        // Check if this image has other page references
        const otherRefs = updatedIndex.filter((e) => e.hash === hash && e.doc !== pageDoc);

        if (otherRefs.length > 0) {
          // Image has other page references - safe to remove this one
          updatedIndex.splice(idx, 1);
          removed += 1;
          onLog(`  [markdown-parsed] Removed page reference ${hash} from ${pageDoc} (not in markdown)`);
        } else {
          // This is the only reference - convert to standalone instead of removing
          entry.doc = '';
          onLog(`  [markdown-parsed] Converted ${hash} to standalone (removed from ${pageDoc}, no other refs)`);
        }
      }
    });
  });

  // Process each image found in markdown
  parsedImagesMap.forEach((pagePaths, imagePath) => {
    pagePaths.forEach((pageDoc) => {
      // Get metadata from medialog or page event
      let metadata = null;
      const url = canonicalizeMediaUrl(imagePath, org, repo);
      const cleanImagePath = imagePath.split('?')[0].split('#')[0];
      const filename = cleanImagePath.split('/').pop();
      const medialogMatches = medialogByFilename.get(filename) || [];
      const medialogForPage = medialogMatches.find((m) => {
        const resourcePath = m.resourcePath ? normalizePath(m.resourcePath) : '';
        return resourcePath === pageDoc;
      });

      // Create or update entry
      const dedupeKey = getDedupeKey(url);

      // Get existing standalone entry to preserve type and other metadata
      const existingMeta = existingIndexMap.get(dedupeKey);

      if (medialogForPage) {
        metadata = medialogForPage;
      } else {
        const pageEvs = pageEventsByPath.get(pageDoc) || [];
        const latestPageEvent = pageEvs[0];
        metadata = {
          path: imagePath,
          timestamp: latestPageEvent?.timestamp || 0,
          user: latestPageEvent?.user || '',
          operation: 'markdown-parsed',
          mediaHash: null,
          // Preserve type from existing standalone entry
          type: existingMeta?.type,
        };
      }

      const hash = metadata.mediaHash || existingMeta?.hash || dedupeKey;

      // Check if entry already exists
      const existingIdx = updatedIndex.findIndex((e) => (
        e.hash === hash && e.doc === pageDoc
      ));

      if (existingIdx === -1) {
        // Entry doesn't exist - create it
        const canonicalModifiedTimestamp = canonicalTimestamps.get(hash);

        const entry = createMedialogEntry(metadata, {
          doc: pageDoc,
          existingMeta,
          org,
          repo,
          canonicalModifiedTimestamp,
        });

        updatedIndex.push(entry);
        added += 1;
        onLog(`  [markdown-parsed] Added ${imagePath} -> ${pageDoc}`);
      } else {
        // Entry exists - update timestamp if newer
        const existing = updatedIndex[existingIdx];
        if (metadata.timestamp > existing.timestamp) {
          existing.timestamp = metadata.timestamp;
          existing.user = metadata.user;
          existing.operation = metadata.operation || existing.operation;
        }
      }
    });
  });

  onLog(`[processMarkdownParsedImages] Added ${added}, removed ${removed}`);
  return { added, removed };
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
        onProgressiveData(dedupeProgressiveItems(combined));
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

  perf.auditLog.previewOnly = validEntries.length;
  perf.auditLog.pagesForParsing = pages.length;
  perf.auditLog.filesCount = validEntries.filter((e) => !isPage(e.path)).length;
  perf.medialog.resourcePathCount = medialogScoped.filter((m) => m?.resourcePath).length;
  perf.medialog.standalone = medialogScoped.filter(
    (m) => m?.originalFilename && !m?.resourcePath,
  ).length;

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
