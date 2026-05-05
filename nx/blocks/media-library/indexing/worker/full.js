/**
 * Worker-safe version of buildFullIndex from build.js:529-978
 * Extracted verbatim from main branch, modified only to:
 * - Use worker-fetch.js and worker-bulk-status.js instead of admin-api.js/bulk-status.js
 * - Accept runtime context (imsToken, daOrigin, etc.) as parameters
 * - No window/localStorage dependencies
 */

import {
  streamLog,
  saveIndexChunks,
  saveIndexMeta,
  getAdaptiveChunkSize,
} from './fetch.js';
import runBulkStatus from './bulk-status.js';
import {
  processLinkedContent,
} from './linked-content.js';
import { buildUsageMap } from './parse.js';
import {
  buildCanonicalTimestampMap,
  buildPageMediaFromMedialog,
  mergeMedialogChunkIntoMap,
  pageMediaToEntryMap,
  removeOrOrphanMedia,
} from '../medialog.js';
import {
  isPage, isFragment,
  isFragmentDoc, isPdfOrSvg,
  isLinkedContentPath, toAbsoluteFilePath,
  toLinkedContentEntry,
  getDedupeKey, createMedialogEntry,
  createLinkedContentEntries,
} from '../parse.js';
import {
  normalizePath,
  sortMediaData,
  getContentPathFromSitePath,
} from '../parse-utils.js';
import { buildMediaSheet } from '../sheets.js';
import { canonicalizeMediaUrl } from '../../core/urls.js';
import { IndexFiles } from '../../core/constants.js';

const PERF_TAG = 'phase3-split-sheets';
const INDEX_SCHEMA_VERSION = 2;

const noop = () => {};

function logPerf(perf, isPerfEnabled) {
  if (!isPerfEnabled) return;
  // eslint-disable-next-line no-console
  console.log('[perf]', JSON.stringify(perf));
}

// Progressive data is now emitted as raw batches
// Bridge layer handles deduplication for display

/**
 * Worker-safe version of buildFullIndex
 * Full rebuild: status API for pages, medialog, linked content, external media.
 *
 * @param {string} sitePath - Site path (e.g., /org/repo)
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} ref - Reference (branch)
 * @param {Function} onProgress - Progress callback
 * @param {Function} onProgressiveData - Progressive data callback
 * @param {object} context - Worker runtime context
 * @param {string} context.imsToken - IMS access token (REQUIRED)
 * @param {string} context.daOrigin - DA origin (e.g., https://admin.da.live) (REQUIRED)
 * @param {string} context.daEtcOrigin - DA ETC origin for CORS proxy (REQUIRED)
 * @param {string} context.siteToken - Site token for protected .aem.page sites (optional)
 * @param {boolean} context.isPerfEnabled - Enable perf logging
 * @param {object} context.IndexConfig - Index configuration constants (REQUIRED)
 */
export async function buildFullIndex(
  sitePath,
  org,
  repo,
  ref,
  onProgress,
  onProgressiveData,
  context,
) {
  const {
    imsToken,
    daOrigin,
    daEtcOrigin,
    isPerfEnabled = false,
    IndexConfig,
  } = context;

  if (!imsToken) {
    throw new Error('[full-indexer] imsToken is required in context');
  }
  if (!daOrigin) {
    throw new Error('[full-indexer] daOrigin is required in context');
  }
  if (!daEtcOrigin) {
    throw new Error('[full-indexer] daEtcOrigin is required in context');
  }
  if (!IndexConfig) {
    throw new Error('[full-indexer] IndexConfig is required in context');
  }

  // Note: Rate limiting not needed in worker - using worker-fetch.js directly
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
      streamed: 0,
      chunks: 0,
      resourcePathCount: 0,
      matched: 0,
      standalone: 0,
      durationMs: 0,
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
      earlyLinkedEntries.push(toLinkedContentEntry(filePath, '', fileEvent, org, repo));
    });
    if (onProgressiveData && earlyLinkedEntries.length > 0) {
      onProgressiveData(earlyLinkedEntries);
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
      onProgressiveData(entries);
    }

    onProgress({
      stage: 'fetching',
      message: `Status job polling, Medialog: ${medialogChunks.reduce((s, c) => s + c.length, 0)} entries...`,
    });
  }, imsToken, { fullHistory: true });

  // Fetch auditlog for fragment/PDF/SVG file discovery (like helix-tools does)
  const auditlogPromise = streamLog('log', org, repo, ref, null, IndexConfig.API_PAGE_SIZE, (chunk) => {
    auditlogChunks.push(chunk);
  }, imsToken, {});

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
      imsToken,
      isPerfEnabled,
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

      const resourceTimestamp = resource.sourceLastModified
        || resource.previewLastModified
        || currentTimestamp;

      const syntheticEvent = {
        path: resource.path,
        timestamp: resourceTimestamp,
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
        const canonicalModifiedTimestamp = canonicalTimestamps.get(hash);

        const entry = createMedialogEntry(media, {
          doc: '',
          existingMeta: existing,
          org,
          repo,
          canonicalModifiedTimestamp,
        });

        entryMap.set(key, entry);
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

  // Build oldUsageMap from medialog-based index (before markdown validation)
  // This represents what medialog says is on each page
  const oldUsageMap = new Map();
  index.forEach((entry) => {
    if (entry.doc && entry.hash) {
      if (!oldUsageMap.has(entry.doc)) {
        oldUsageMap.set(entry.doc, new Set());
      }
      oldUsageMap.get(entry.doc).add(entry.hash);
    }
  });

  // Normalize hash format in index entries built from medialog
  // Hash should always be bare (e.g. "abc123"), never with prefix (e.g. "media_abc123.jpg")
  index.forEach((entry) => {
    if (entry.hash && entry.hash.startsWith('media_') && entry.hash.includes('.')) {
      entry.hash = entry.hash.substring(6, entry.hash.lastIndexOf('.'));
    }
  });

  // Build existingIndexMap for markdown parsing (metadata lookup)
  const existingIndexMap = new Map();
  index.forEach((entry) => {
    const dedupeKey = getDedupeKey(entry.url);
    if (!existingIndexMap.has(dedupeKey)) {
      existingIndexMap.set(dedupeKey, entry);
    }
  });

  deletedPages.forEach((doc) => {
    const toRemove = index.filter((e) => e.doc === doc);
    toRemove.forEach((entry) => {
      removeOrOrphanMedia(index, entry, doc, medialogEntries);
    });
  });

  if (onProgressiveData && (index.length > 0 || earlyLinkedEntries.length > 0)) {
    const combined = [...earlyLinkedEntries, ...index];
    onProgressiveData(combined);
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
      onProgressiveData(combined);
    }
    : null;

  const onProg = (p) => onProgress(p);
  const usageMapContext = {
    daEtcOrigin,
    siteToken: context.siteToken || null,
    isPerfEnabled,
  };
  const usageMap = await buildUsageMap(
    pages,
    org,
    repo,
    ref,
    onProg,
    onBatchComplete,
    usageMapContext,
  );

  perf.markdownParse.pages = pages.length;
  perf.markdownParse.uniquePages = uniquePagePaths.size;
  if (duplicateCount > 0) {
    perf.markdownParse.duplicatePageEvents = duplicateCount;
  }
  perf.markdownParse.durationMs = Date.now() - markdownParseStart;

  // Image/Video truthing: fix stale doc references by orphaning images/videos
  // not in current markdown
  // Build map of image/video paths to pages that reference them (from markdown parsing)
  const truthStart = Date.now();
  const imageToPages = new Map(); // imagePath -> Set(pagePaths)
  usageMap.images?.forEach((linkedPages, imagePath) => {
    const normalized = normalizePath(imagePath);
    if (!imageToPages.has(normalized)) {
      imageToPages.set(normalized, new Set());
    }
    linkedPages.forEach((page) => imageToPages.get(normalized).add(page));
  });
  // Videos are now tracked separately but still need truthing
  usageMap.videos?.forEach((linkedPages, videoPath) => {
    const normalized = normalizePath(videoPath);
    if (!imageToPages.has(normalized)) {
      imageToPages.set(normalized, new Set());
    }
    linkedPages.forEach((page) => imageToPages.get(normalized).add(page));
  });

  let orphanedCount = 0;
  let truthedCount = 0;

  index.forEach((entry) => {
    const isImage = entry.type === 'image' || entry.type === 'video';
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

  if (isPerfEnabled && orphanedCount > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[full-indexer] Image truthing: ${truthedCount} valid refs, ${orphanedCount} stale refs orphaned in ${truthDurationMs}ms`,
    );
  }

  perf.imageTruthing = {
    durationMs: truthDurationMs,
    totalImageEntries: index.filter((e) => e.type === 'image' || e.type === 'video').length,
    validReferences: truthedCount,
    orphanedReferences: orphanedCount,
    imagePathsInMarkdown: imageToPages.size,
  };

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
    usageMapContext,
  );
  const linkedDurationMs = Date.now() - linkedStart;

  if (onProgressiveData && (index.length > 0 || earlyLinkedEntries.length > 0)) {
    const combined = [...earlyLinkedEntries, ...index];
    onProgressiveData(combined);
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
  const sheetBuildMs = Date.now() - sheetBuildStart;

  onProgress({
    stage: 'saving',
    message: `Saving ${mediaSheet.length} media entries...`,
  });

  const basePath = `${sitePath}/${IndexFiles.FOLDER}`;
  const chunkSize = getAdaptiveChunkSize(mediaSheet.length);
  const multiSheetStart = Date.now();

  const uploadStart = Date.now();
  const chunkCount = await saveIndexChunks(
    basePath,
    mediaSheet,
    chunkSize,
    daOrigin,
    imsToken,
    IndexFiles.MEDIA_INDEX_CHUNK_PREFIX,
  );
  const uploadMs = Date.now() - uploadStart;
  const multiSheetMs = Date.now() - multiSheetStart;

  const payloadSizeBytes = mediaSheet.length * 200;
  const payloadSizeKB = Math.round((payloadSizeBytes / 1024) * 10) / 10;
  const payloadSizeMB = Math.round((payloadSizeBytes / (1024 * 1024)) * 100) / 100;

  const metaSaveStart = Date.now();
  const metaResp = await saveIndexMeta({
    lastFetchTime: Date.now(),
    entriesCount: index.length,
    mediaCount: mediaSheet.length,
    lastRefreshBy: 'media-indexer',
    lastBuildMode: buildMode,
    chunked: true,
    chunkCount,
    chunkSize,
    schemaVersion: INDEX_SCHEMA_VERSION,
  }, `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`, daOrigin, imsToken);
  const metaSaveMs = Date.now() - metaSaveStart;

  if (!metaResp.ok) {
    throw new Error(`Failed to save index metadata: HTTP ${metaResp.status}`);
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
    message: `Complete! ${mediaSheet.length} media`,
  });

  perf.indexEntries = index.length;
  perf.mediaCount = mediaSheet.length;
  perf.totalDurationMs = Date.now() - t0;
  perf.collectedAt = new Date().toISOString();

  logPerf(perf, isPerfEnabled);

  return sortedIndex;
}
