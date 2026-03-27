import {
  streamLog,
  loadIndexMeta,
  saveIndexMeta,
  checkIndex,
  loadMultiSheet,
  loadIndexChunks,
  saveIndexChunks,
  resetAemPageMarkdownRateLimiter,
} from './admin-api.js';
import runBulkStatus from './bulk-status.js';
import {
  processLinkedContent,
} from './linked-content.js';
import {
  buildCanonicalTimestampMap,
  buildPageMediaFromMedialog,
  mergeMedialogChunkIntoMap,
  pageMediaToEntryMap,
  removeOrOrphanMedia,
  processPageMediaUpdates,
  processStandaloneUploads,
} from './medialog.js';
import {
  normalizePath, isPage, isFragment,
  isFragmentDoc, isPdfOrSvg,
  isLinkedContentPath, toAbsoluteFilePath,
  buildUsageMap,
  createLinkedContentEntries,
  toLinkedContentEntry, checkMemory,
  getDedupeKey, extractName, detectMediaType, computeCanonicalMetadata,
} from './parse.js';
import { buildMediaSheet, buildUsageSheet } from './sheets.js';
import { canonicalizeMediaUrl } from '../core/urls.js';
import {
  IndexConfig,
  IndexFiles,
  SheetNames,
} from '../core/constants.js';
import { isPerfEnabled } from '../core/params.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { t } from '../core/messages.js';
import { getContentPathFromSitePath, normalizeSitePath } from '../core/paths.js';
import { getCanonicalMediaTimestamp, sortMediaData } from '../core/utils.js';

const PERF_TAG = 'phase3-split-sheets';
const INDEX_SCHEMA_VERSION = 2;

function getIndexFolderPath(sitePath) {
  const normalized = normalizeSitePath(sitePath);
  const parts = normalized.split('/').filter(Boolean);

  // For /org/repo -> /org/repo/.da/media-insights
  // For /org/repo/subfolder -> /org/repo/subfolder/.da/media-insights
  if (parts.length < 2) return `/${IndexFiles.FOLDER}`;

  return `/${parts.join('/')}/${IndexFiles.FOLDER}`;
}

function logPerf(perf) {
  if (!isPerfEnabled()) return;

  const mem = checkMemory();
  if (mem.usedMB != null) {
    perf.memoryUsedMB = Math.round(mem.usedMB * 10) / 10;
  }
  if (perf.auditLog?.streamed != null && perf.auditLog?.previewOnly != null) {
    perf.auditLog.dropped = perf.auditLog.streamed - perf.auditLog.previewOnly;
  }
  if (perf.statusAPI?.totalDurationMs > 0 && perf.statusAPI?.pagesDiscovered != null) {
    const { pagesDiscovered, totalDurationMs } = perf.statusAPI;
    perf.statusAPI.pagesPerSec = Math.round((pagesDiscovered / totalDurationMs) * 1000 * 10) / 10;
  }
  if (perf.medialog?.resourcePathCount != null && perf.medialog?.matched != null) {
    const { resourcePathCount, matched } = perf.medialog;
    perf.medialog.unmatched = Math.max(0, resourcePathCount - matched);
  }
  if (perf.auditLog?.durationMs > 0 && perf.auditLog?.streamed != null) {
    const { streamed, durationMs } = perf.auditLog;
    perf.auditLog.entriesPerSec = Math.round((streamed / durationMs) * 1000);
  }
  if (perf.medialog?.durationMs > 0 && perf.medialog?.streamed != null) {
    const { streamed, durationMs } = perf.medialog;
    perf.medialog.entriesPerSec = Math.round((streamed / durationMs) * 1000);
  }
  if (perf.markdownParse?.durationMs > 0 && perf.markdownParse?.pages != null) {
    const { pages, durationMs } = perf.markdownParse;
    perf.markdownParse.pagesPerSec = Math.round((pages / durationMs) * 1000 * 10) / 10;
  }
  // eslint-disable-next-line no-console
  console.log('[MediaIndexer:perf]', JSON.stringify(perf, null, 2));
}

// Keeps one entry per URL (newest timestamp wins) for correct display order.
function dedupeProgressiveItems(items) {
  const byKey = new Map();
  items.forEach((item) => {
    const key = item.url ? getDedupeKey(item.url) : (item.hash || '');
    const existing = byKey.get(key);
    if (!existing || getCanonicalMediaTimestamp(item) > getCanonicalMediaTimestamp(existing)) {
      const merged = { ...item };

      if (existing) {
        merged.displayName = item.displayName || existing.displayName || item.name;
        const hasModified = item.modifiedTimestamp !== undefined
          && item.modifiedTimestamp !== null;
        merged.modifiedTimestamp = hasModified
          ? Math.max(item.modifiedTimestamp, existing.modifiedTimestamp ?? 0)
          : existing.modifiedTimestamp;
        merged.latestUsageTimestamp = Math.max(
          item.latestUsageTimestamp ?? item.timestamp ?? 0,
          existing.latestUsageTimestamp ?? existing.timestamp ?? 0,
        );
        merged.nameSource = item.nameSource || existing.nameSource;
        merged.timestampSource = item.timestampSource || existing.timestampSource;
      }

      byKey.set(key, merged);
    }
  });
  return Array.from(byKey.values());
}

// Returns index status (lastRefresh, entriesCount, indexExists, etc.) for the site.
export async function getIndexStatus(sitePath, org, repo) {
  const metaPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`;
  const meta = await loadIndexMeta(metaPath);
  const folderPath = getIndexFolderPath(sitePath);
  const checkResult = await checkIndex(folderPath, org, repo);
  const { exists: indexExists, lastModified: indexLastModified } = checkResult;

  return {
    lastRefresh: meta?.lastFetchTime || null,
    entriesCount: meta?.entriesCount || 0,
    lastBuildMode: meta?.lastBuildMode || null,
    indexExists,
    indexLastModified,
  };
}

// Returns whether reindex is needed based on meta vs index alignment.
export async function checkReindexEligibility(sitePath, org, repo) {
  const metaPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`;
  const meta = await loadIndexMeta(metaPath);
  const folderPath = getIndexFolderPath(sitePath);
  const checkResult = await checkIndex(folderPath, org, repo);
  const { exists: indexExists, lastModified: indexLastModified } = checkResult;

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

// Rebuilds index from audit log + medialog since last fetch.
export async function buildIncrementalIndex(
  sitePath,
  org,
  repo,
  ref,
  onProgress,
  onLog = noop,
  onProgressiveData = null,
) {
  resetAemPageMarkdownRateLimiter();
  const log = typeof onLog === 'function' ? onLog : noop;
  const metaPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`;
  const indexPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX}`;
  const meta = await loadIndexMeta(metaPath);
  const lastFetchTime = meta?.lastFetchTime;

  if (!lastFetchTime) {
    throw new Error('Cannot run incremental: meta missing lastFetchTime');
  }

  if (meta.schemaVersion && meta.schemaVersion !== INDEX_SCHEMA_VERSION) {
    throw new Error(`Index schema version mismatch: expected ${INDEX_SCHEMA_VERSION}, found ${meta.schemaVersion}. Full rebuild required.`);
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
      existingIndex = await loadIndexChunks(basePath, chunkCount, SheetNames.MEDIA);
      // Load usage only from chunk 0 (it's only stored there)
      const chunk0Path = `${basePath}/${IndexFiles.MEDIA_INDEX_CHUNK_PREFIX}000.json`;
      usageData = await loadMultiSheet(chunk0Path, SheetNames.USAGE);
    }
  } else {
    // Load from single file (backward compatibility)
    existingIndex = await loadMultiSheet(indexPath, SheetNames.MEDIA);
    usageData = await loadMultiSheet(indexPath, SheetNames.USAGE);
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

  await Promise.all([
    streamLog('log', org, repo, ref, bufferedSince, IndexConfig.API_PAGE_SIZE, (entries) => {
      perf.auditLog.chunks += 1;
      perf.auditLog.streamed += entries.length;
      auditlogEntries.push(...entries);
      onProgress({
        stage: 'fetching',
        message: `Audit: ${auditlogEntries.length}, Medialog: ${medialogEntries.length}...`,
      });
    }),
    streamLog('medialog', org, repo, ref, lastFetchTime, IndexConfig.API_PAGE_SIZE, (entries) => {
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
    }),
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
    logPerf(perf);
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

  log('Page-based medialog (resourcePath direct, no time window)');
  log(`Pages to process: ${pagesByPath.size} (${[...pagesByPath.keys()].join(', ')})`);
  log(`Medialog entries since lastFetch: ${medialogScoped.length}`);

  const canonicalTimestamps = buildCanonicalTimestampMap(medialogScoped);

  const idx = updatedIndex;
  const byPath = pagesByPath;
  const medialog = medialogScoped;
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
      removed += removeOrOrphanMedia(updatedIndex, entry, doc, medialogScoped);
    });
  });

  const referencedHashes = new Set(
    updatedIndex.filter((e) => e.doc).flatMap((e) => e.hash),
  );

  const standaloneAdded = processStandaloneUploads(updatedIndex, medialogScoped, referencedHashes);
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
  });

  onProgress({ stage: 'saving', message: 'Sorting index by modified timestamp...' });

  const sortedIndex = sortMediaData(updatedIndex);

  onProgress({ stage: 'saving', message: 'Building multi-sheet index (bymedia, bypage)...' });

  const mediaSheet = buildMediaSheet(sortedIndex);
  const usageSheet = buildUsageSheet(updatedIndex);

  onProgress({
    stage: 'saving',
    message: `Saving ${mediaSheet.length} media entries, ${usageSheet.length} page-hash pairs...`,
  });

  const saveStart = Date.now();
  const chunkSize = IndexConfig.MEDIA_INDEX_CHUNK_SIZE;

  // Save as chunks (basePath already defined at line 644)
  const chunkCount = await saveIndexChunks(basePath, mediaSheet, usageSheet, chunkSize);

  // Save updated meta with chunk info
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
  }, metaPath);
  if (!metaResp.ok) {
    const partialMsg = t('PARTIAL_SAVE');
    logMediaLibraryError(ErrorCodes.PARTIAL_SAVE, {
      indexSaved: true,
      metaSaved: false,
      endpoint: metaPath,
    });
    throw new MediaLibraryError(ErrorCodes.PARTIAL_SAVE, partialMsg, {
      indexSaved: true,
      metaSaved: false,
    });
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
  logPerf(perf);

  return updatedIndex;
}

// Full rebuild: status API for pages, medialog, linked content, external media.
export async function buildFullIndex(sitePath, org, repo, ref, onProgress, onProgressiveData) {
  resetAemPageMarkdownRateLimiter();
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
    dataSource: 'statusAPI',
    medialog: {
      streamed: 0, chunks: 0, resourcePathCount: 0, matched: 0, standalone: 0, durationMs: 0,
    },
    markdownParse: { pages: 0, durationMs: 0 },
    saveDurationMs: 0,
    indexEntries: 0,
    totalDurationMs: 0,
    statusAPI: {
      jobCreationMs: 0,
      pollingMs: 0,
      pollCount: 0,
      pollIntervalMs: IndexConfig.STATUS_POLL_INTERVAL_MS,
      resourcesDiscovered: 0,
      pagesDiscovered: 0,
      fragmentsDiscovered: 0,
      filesDiscovered: 0,
      payloadSizeKB: 0,
      payloadSizeMB: 0,
      totalDurationMs: 0,
      discoveryMs: 0,
      decision: null,
    },
  };

  onProgress({
    stage: 'starting',
    message: 'Mode: Full build (rebuilding from status API + medialog)',
  });

  onProgress({ stage: 'fetching', message: 'Creating bulk status job + fetching auditlog + medialog...' });

  const pagesByPath = new Map();
  const filesByPath = new Map();
  const deletedPaths = new Set();
  const deletedPages = new Set();
  const medialogStart = Date.now();
  const medialogChunks = [];
  const auditlogChunks = [];
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

  const contentPath = getContentPathFromSitePath(sitePath);
  const progressiveMediaMap = new Map();
  const medialogPromise = streamLog('medialog', org, repo, ref, null, IndexConfig.API_PAGE_SIZE, (chunk) => {
    perf.medialog.chunks += 1;
    chunk.forEach((m) => {
      if (m.resourcePath) medialogResourcePathCount += 1;
    });
    medialogChunks.push(chunk);

    const pathScope = contentPath || '';
    mergeMedialogChunkIntoMap(chunk, progressiveMediaMap, org, repo, pathScope);
    if (onProgressiveData && progressiveMediaMap.size > 0) {
      const entries = Array.from(progressiveMediaMap.values());
      onProgressiveData(dedupeProgressiveItems(entries));
    }

    onProgress({
      stage: 'fetching',
      message: `Status job polling, Medialog: ${medialogChunks.reduce((s, c) => s + c.length, 0)} entries...`,
    });
  });

  // Fetch auditlog for fragment/PDF/SVG file discovery (like helix-tools does)
  const auditlogPromise = streamLog('log', org, repo, ref, null, IndexConfig.API_PAGE_SIZE, (chunk) => {
    auditlogChunks.push(chunk);
  });

  try {
    const progressCallback = (p) => {
      let msg = 'Polling status job...';
      if (p.progress) {
        const idx = p.jobIndex != null && p.totalJobs > 0 ? ` ${p.jobIndex + 1}/${p.totalJobs}:` : '';
        msg = `Status job${idx} ${p.progress.processed || 0}/${p.progress.total || 0} processed...`;
      } else if (p.message) msg = p.message;
      onProgress({ stage: 'fetching', message: msg });
    };
    const statusPromise = runBulkStatus(org, repo, ref, contentPath || null, {
      onProgress: progressCallback,
      pollInterval: IndexConfig.STATUS_POLL_INTERVAL_MS,
      maxDurationMs: IndexConfig.STATUS_POLL_MAX_DURATION_MS,
    });

    // Run status API, auditlog, and medialog in parallel
    const bulkStatusResult = (await Promise.all([
      statusPromise,
      auditlogPromise,
      medialogPromise,
    ]))[0];

    const { resources, perf: bulkPerf } = bulkStatusResult;

    perf.statusAPI.jobCreationMs = bulkPerf.jobCreationMs;
    perf.statusAPI.pollingMs = bulkPerf.pollingMs;
    perf.statusAPI.pollCount = bulkPerf.jobCount;
    perf.statusAPI.pollIntervalMs = IndexConfig.STATUS_POLL_INTERVAL_MS;
    perf.statusAPI.totalDurationMs = bulkPerf.totalDurationMs;
    perf.statusAPI.resourcesDiscovered = resources.length;
    perf.statusAPI.discoveryMs = bulkPerf.discoveryMs ?? bulkPerf.discoveryCreateMs ?? 0;
    perf.statusAPI.decision = bulkPerf.decision ?? 'single';
    if (bulkPerf.partitionCount != null) {
      perf.statusAPI.partitionCount = bulkPerf.partitionCount;
      perf.statusAPI.partitionJobMaxMs = bulkPerf.partitionJobMaxMs;
      perf.statusAPI.partitionDetailsMs = bulkPerf.partitionDetailsMs;
    }

    const payloadJson = JSON.stringify(resources);
    const payloadSizeKB = Math.round((payloadJson.length / 1024) * 10) / 10;
    const payloadSizeMB = Math.round((payloadJson.length / (1024 * 1024)) * 100) / 100;
    perf.statusAPI.payloadSizeKB = payloadSizeKB;
    if (payloadSizeMB >= 1) {
      perf.statusAPI.payloadSizeMB = payloadSizeMB;
    }

    const currentTimestamp = Date.now();
    let pageCount = 0;
    let fragmentCount = 0;
    let fileCount = 0;

    resources.forEach((resource) => {
      if (!resource.path) return;

      const syntheticEvent = {
        path: resource.path,
        timestamp: currentTimestamp,
        method: 'UPDATE',
        route: 'preview',
        user: '',
      };

      if (isPage(resource.path)) {
        const p = normalizePath(resource.path);
        pagesByPath.set(p, [syntheticEvent]);
        pageCount += 1;
        if (isFragment(resource.path)) {
          fragmentCount += 1;
        }
      } else {
        const fp = toAbsoluteFilePath(resource.path);
        const existing = filesByPath.get(fp);
        if (!existing || syntheticEvent.timestamp < existing.timestamp) {
          filesByPath.set(fp, syntheticEvent);
          fileCount += 1;
        }
      }
    });

    perf.statusAPI.pagesDiscovered = pageCount;
    perf.statusAPI.fragmentsDiscovered = fragmentCount;
    perf.statusAPI.filesDiscovered = fileCount;

    // Process auditlog entries for fragment/PDF/SVG files (like helix-tools)
    const auditlogEntries = auditlogChunks.flat();
    const auditlogFiles = auditlogEntries.filter(
      (e) => e.route === 'preview' && !isPage(e.path) && (isPdfOrSvg(e.path) || isFragmentDoc(e.path)),
    );

    auditlogFiles.forEach((e) => {
      const fp = toAbsoluteFilePath(e.path);
      const syntheticEvent = {
        path: e.path,
        timestamp: e.timestamp || currentTimestamp,
        user: e.user || '',
        method: e.method || 'UPDATE',
        route: 'preview',
      };
      const existing = filesByPath.get(fp);
      if (!existing || syntheticEvent.timestamp < existing.timestamp) {
        filesByPath.set(fp, syntheticEvent);
      }
    });

    emitEarlyLinked();
  } finally {
    await medialogPromise?.catch(() => {});
    await auditlogPromise?.catch(() => {});
  }

  perf.medialog.streamed = medialogChunks.reduce((s, c) => s + c.length, 0);
  perf.medialog.resourcePathCount = medialogResourcePathCount;
  perf.medialog.durationMs = Date.now() - medialogStart;

  const pages = [];
  pagesByPath.forEach((events) => pages.push(...events));

  perf.statusAPI.pagesForParsing = pages.length;

  filesByPath.forEach((event, path) => {
    if (isLinkedContentPath(path) && event.method === 'DELETE') {
      deletedPaths.add(path);
    }
  });

  onProgress({
    stage: 'processing',
    message: `Building index from ${perf.medialog.streamed} medialog (page-based)...`,
  });

  let medialogEntries = medialogChunks.flat();
  if (contentPath) {
    const pathPrefix = contentPath.endsWith('/') ? contentPath : `${contentPath}/`;
    const isUnderPath = (path) => path === contentPath || (path && path.startsWith(pathPrefix));
    medialogEntries = medialogEntries.filter(
      (m) => m.resourcePath && isUnderPath(normalizePath(m.resourcePath)),
    );
  }

  const canonicalTimestamps = buildCanonicalTimestampMap(medialogEntries);

  const { pageMediaMap, standaloneBuffer } = buildPageMediaFromMedialog(
    medialogEntries,
    org,
    repo,
    new Map(),
    canonicalTimestamps,
  );
  const { entryMap, referencedHashes } = pageMediaToEntryMap(pageMediaMap);
  perf.medialog.matched = entryMap.size;
  perf.medialog.standalone = standaloneBuffer.length;

  onProgress({
    stage: 'processing',
    message: `Processed ${perf.medialog.streamed} medialog, ${entryMap.size} page refs`,
  });

  standaloneBuffer.forEach((media) => {
    const url = canonicalizeMediaUrl(media.path, org, repo);
    const dedupeKey = getDedupeKey(url);
    // Use mediaHash if provided, else derive from dedupeKey
    const hash = media.mediaHash || dedupeKey;

    if (!referencedHashes.has(hash)) {
      const key = `${hash}|`;
      const existing = entryMap.get(key);
      if (!existing || media.timestamp > existing.timestamp) {
        const existingMetadata = new Map();
        if (existing) {
          existingMetadata.set(dedupeKey, existing);
        }

        const canonical = computeCanonicalMetadata(media, existingMetadata.get(dedupeKey));

        // Use canonical timestamp from hash grouping
        // (aggregated from all entries for this hash)
        const canonicalModifiedTimestamp = canonicalTimestamps.get(hash)
          || canonical.modifiedTimestamp;

        entryMap.set(key, {
          hash,
          url,
          name: extractName(media),
          timestamp: media.timestamp, // Can be 0 (unknown time → sorts to end)
          user: media.user,
          operation: media.operation,
          type: detectMediaType(media),
          doc: '',
          status: 'unused',
          displayName: canonical.displayName,
          modifiedTimestamp: canonicalModifiedTimestamp,
          latestUsageTimestamp: canonical.latestUsageTimestamp,
          nameSource: canonical.nameSource,
          timestampSource: canonical.timestampSource,
        });
      }
    }
  });

  onProgress({
    stage: 'processing',
    message: `Standalone: ${standaloneBuffer.length}, total: ${entryMap.size}`,
  });

  entryMap.forEach((entry) => {
    index.push(entry);
  });

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

  onProgress({ stage: 'processing', message: 'Building content usage map (parsing pages)...' });
  const markdownParseStart = Date.now();

  const uniquePagePaths = new Set();
  let duplicateCount = 0;
  pages.forEach((e) => {
    const p = normalizePath(e.path);
    if (uniquePagePaths.has(p)) {
      duplicateCount += 1;
    } else {
      uniquePagePaths.add(p);
    }
  });

  const linkedFilesByPath = new Map();
  filesByPath.forEach((e, p) => {
    if (!isPdfOrSvg(p) && !isFragmentDoc(p)) return;
    linkedFilesByPath.set(p, e);
  });

  const onBatchComplete = onProgressiveData
    ? (um) => {
      const linked = createLinkedContentEntries(um, linkedFilesByPath, deletedPaths, org, repo);
      const combined = earlyLinkedEntries.concat(index, linked);
      const deduped = dedupeProgressiveItems(combined);
      onProgressiveData(deduped);
    }
    : null;

  const onProg = (p) => onProgress(p);
  const usageMap = await buildUsageMap(pages, org, repo, ref, onProg, onBatchComplete);
  perf.markdownParse.pages = pages.length;
  perf.markdownParse.uniquePages = uniquePagePaths.size;
  if (duplicateCount > 0) {
    perf.markdownParse.duplicatePageEvents = duplicateCount;
  }
  perf.markdownParse.durationMs = Date.now() - markdownParseStart;

  // Process linked content (PDFs, SVGs, fragments, external media)
  const files = Array.from(filesByPath.values());
  const linkedStart = Date.now();
  const linkedResults = await processLinkedContent(
    index,
    files,
    pages,
    org,
    repo,
    ref,
    onProgress,
    noop,
    usageMap,
  );
  const linkedDurationMs = Date.now() - linkedStart;

  if (onProgressiveData && (index.length > 0 || earlyLinkedEntries.length > 0)) {
    const combined = [...earlyLinkedEntries, ...index];
    onProgressiveData(dedupeProgressiveItems(combined));
  }

  onProgress({
    stage: 'processing',
    message: `Added ${linkedResults.added} linked content entries (PDFs, SVGs, fragments, external media) in ${linkedDurationMs}ms`,
  });

  onProgress({ stage: 'saving', message: 'Sorting index by modified timestamp...' });

  const sortedIndex = sortMediaData(index);

  onProgress({ stage: 'saving', message: 'Building multi-sheet index (bymedia, bypage)...' });

  const saveStart = Date.now();
  const sheetBuildStart = Date.now();
  const mediaSheet = buildMediaSheet(sortedIndex);
  const usageSheet = buildUsageSheet(index);
  const sheetBuildMs = Date.now() - sheetBuildStart;

  onProgress({
    stage: 'saving',
    message: `Saving ${mediaSheet.length} media entries, ${usageSheet.length} page-hash pairs...`,
  });

  const basePath = `${sitePath}/${IndexFiles.FOLDER}`;
  const chunkSize = IndexConfig.MEDIA_INDEX_CHUNK_SIZE;
  const multiSheetStart = Date.now();

  // Save as chunks
  const uploadStart = Date.now();
  const chunkCount = await saveIndexChunks(basePath, mediaSheet, usageSheet, chunkSize);
  const uploadMs = Date.now() - uploadStart;
  const multiSheetMs = Date.now() - multiSheetStart;

  // Calculate approximate payload size (for perf tracking)
  const payloadSizeBytes = mediaSheet.length * 200; // Rough estimate
  const payloadSizeKB = Math.round((payloadSizeBytes / 1024) * 10) / 10;
  const payloadSizeMB = Math.round((payloadSizeBytes / (1024 * 1024)) * 100) / 100;

  const metaSaveStart = Date.now();
  const metaResp = await saveIndexMeta({
    lastFetchTime: Date.now(),
    entriesCount: index.length,
    mediaCount: mediaSheet.length,
    usageCount: usageSheet.length,
    lastRefreshBy: 'media-indexer',
    lastBuildMode: buildMode,
    chunked: true,
    chunkCount,
    chunkSize,
    schemaVersion: INDEX_SCHEMA_VERSION,
  }, `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`);
  const metaSaveMs = Date.now() - metaSaveStart;
  if (!metaResp.ok) {
    const partialMsg = t('PARTIAL_SAVE');
    const metaPathFull = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`;
    logMediaLibraryError(ErrorCodes.PARTIAL_SAVE, {
      indexSaved: true,
      metaSaved: false,
      endpoint: metaPathFull,
    });
    throw new MediaLibraryError(ErrorCodes.PARTIAL_SAVE, partialMsg, {
      indexSaved: true,
      metaSaved: false,
    });
  }

  perf.saveDurationMs = Date.now() - saveStart;
  perf.saveBreakdown = {
    sheetBuildMs,
    multiSheetMs,
    payloadSizeKB,
    uploadMs,
    metaSaveMs,
  };
  if (payloadSizeMB >= 1) {
    perf.saveBreakdown.payloadSizeMB = payloadSizeMB;
  }

  onProgress({
    stage: 'complete',
    message: `Complete! ${mediaSheet.length} media, ${usageSheet.length} page refs`,
  });

  perf.indexEntries = index.length;
  perf.mediaCount = mediaSheet.length;
  perf.usageCount = usageSheet.length;
  perf.totalDurationMs = Date.now() - t0;
  perf.collectedAt = new Date().toISOString();
  logPerf(perf);

  return index;
}
