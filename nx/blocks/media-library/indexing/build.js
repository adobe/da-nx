import {
  streamLog, loadIndexMeta, saveIndexMeta, checkIndex, createMultiSheet, loadMultiSheet,
  createBulkStatusJob, pollStatusJob, getStatusJobDetails,
} from './admin-api.js';
import {
  normalizePath, isPage, extractName, detectMediaType,
  isPdf, isSvg, isFragmentDoc, isPdfOrSvg,
  isLinkedContentPath, toAbsoluteFilePath,
  buildUsageMap,
  toLinkedContentEntry, toExternalMediaEntry, checkMemory,
  getDedupeKey,
} from './parse.js';
import { buildMediaSheet, buildUsageSheet } from './sheets.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { daFetch } from '../../../utils/daFetch.js';
import {
  IndexConfig,
  Operation,
  IndexFiles,
  Paths,
  SheetNames,
} from '../core/constants.js';
import { isPerfEnabled } from '../core/params.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { t } from '../core/messages.js';

const PERF_TAG = 'phase3-split-sheets';

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
    if (!existing || (item.timestamp ?? 0) > (existing.timestamp ?? 0)) {
      byKey.set(key, item);
    }
  });
  return Array.from(byKey.values());
}

// Returns index status (lastRefresh, entriesCount, indexExists, etc.) for the site.
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

// Returns whether reindex is needed based on meta vs index alignment.
export async function checkReindexEligibility(sitePath, org, repo) {
  const metaPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`;
  const meta = await loadIndexMeta(metaPath);
  const checkResult = await checkIndex(IndexFiles.FOLDER, org, repo);
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

// Groups medialog by page path; standalone uploads go to a separate buffer.
function buildPageMediaFromMedialog(medialogEntries) {
  const pageMediaMap = new Map();
  const standaloneBuffer = [];

  medialogEntries.forEach((media) => {
    if (media.originalFilename && !media.resourcePath) {
      standaloneBuffer.push(media);
      return;
    }
    if (!media.resourcePath) return;

    const normPath = normalizePath(media.resourcePath);

    let mediaFilePath;
    try {
      const url = new URL(media.path);
      mediaFilePath = normalizePath(url.pathname);
    } catch {
      mediaFilePath = normalizePath(media.path);
    }

    if (mediaFilePath === normPath) {
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

// Converts page-media map to hash|doc -> entry map for index updates.
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

// Removes page-media entry; orphaning to unused if no other refs exist.
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

// Merges page-based medialog into index; add/remove entries per page.
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

  onProgress({ stage: 'processing', message: 'Building usage map for linked content...', percent: 83 });
  const usageMap = await buildUsageMap(pages, org, repo, ref, (p) => onProgress(p));

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
    percent: 5,
  });

  onProgress({ stage: 'loading', message: 'Loading existing index...', percent: 8 });
  const loadStart = Date.now();
  const existingIndex = await loadMultiSheet(indexPath, SheetNames.MEDIA);
  const usageData = await loadMultiSheet(indexPath, SheetNames.USAGE);
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
  perf.medialog.resourcePathCount = medialogEntries.filter((m) => m?.resourcePath).length;
  perf.medialog.standalone = medialogEntries.filter(
    (m) => m?.originalFilename && !m?.resourcePath,
  ).length;

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
  const pg = pages.length;
  const mg = medialogEntries.length;
  const procMsg = `Processing ${pg} pages with ${mg} medialog entries...`;
  onProgress({
    stage: 'processing',
    message: procMsg,
    percent: 55,
  });

  const updatedIndex = [...existingIndex];

  log('Page-based medialog (resourcePath direct, no time window)');
  log(`Pages to process: ${pagesByPath.size} (${[...pagesByPath.keys()].join(', ')})`);
  log(`Medialog entries since lastFetch: ${medialogEntries.length}`);

  const idx = updatedIndex;
  const byPath = pagesByPath;
  const medialog = medialogEntries;
  const pageResults = processPageMediaUpdates(idx, byPath, medialog, usageMap, log);
  let { added, removed } = pageResults;

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
  const indexResp = await daFetch(`${DA_ORIGIN}/source${indexPath}`, {
    method: 'POST',
    body: formData,
  });
  if (!indexResp.ok) {
    const isDenied = indexResp.status === 401 || indexResp.status === 403;
    const code = isDenied ? ErrorCodes.DA_WRITE_DENIED : ErrorCodes.DA_SAVE_FAILED;
    const msg = isDenied ? t('DA_WRITE_DENIED') : t('DA_SAVE_FAILED');
    logMediaLibraryError(code, { status: indexResp.status, endpoint: indexPath });
    throw new MediaLibraryError(code, msg, { status: indexResp.status, endpoint: indexPath });
  }

  const metaResp = await saveIndexMeta({
    lastFetchTime: Date.now(),
    entriesCount: updatedIndex.length,
    mediaCount: mediaSheet.length,
    usageCount: usageSheet.length,
    lastRefreshBy: 'media-indexer',
    lastBuildMode: 'incremental',
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

// Full rebuild: status API for pages, medialog, linked content, external media.
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
      filesDiscovered: 0,
      payloadSizeKB: 0,
      totalDurationMs: 0,
    },
  };

  onProgress({
    stage: 'starting',
    message: 'Mode: Full build (rebuilding from status API + medialog)',
    percent: 5,
  });

  onProgress({ stage: 'fetching', message: 'Creating bulk status job + fetching medialog...', percent: 10 });

  const pagesByPath = new Map();
  const filesByPath = new Map();
  const deletedPaths = new Set();
  const deletedPages = new Set();
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

  const statusStart = Date.now();

  const medialogPromise = streamLog('medialog', org, repo, ref, null, IndexConfig.API_PAGE_SIZE, (chunk) => {
    perf.medialog.chunks += 1;
    chunk.forEach((m) => {
      if (m.resourcePath) medialogResourcePathCount += 1;
    });
    medialogChunks.push(chunk);
    onProgress({
      stage: 'fetching',
      message: `Status job polling, Medialog: ${medialogChunks.reduce((s, c) => s + c.length, 0)} entries...`,
      percent: 15,
    });
  });

  try {
    const jobStart = Date.now();
    const { jobUrl } = await createBulkStatusJob(org, repo, ref);
    perf.statusAPI.jobCreationMs = Date.now() - jobStart;

    onProgress({
      stage: 'fetching',
      message: 'Polling status job for completion...',
      percent: 12,
    });

    const pollStart = Date.now();
    let pollCount = 0;
    await pollStatusJob(
      jobUrl,
      IndexConfig.STATUS_POLL_INTERVAL_MS,
      (progress) => {
        pollCount += 1;
        onProgress({
          stage: 'fetching',
          message: `Status job: ${progress.processed || 0}/${progress.total || 0} processed...`,
          percent: 15,
        });
      },
      IndexConfig.STATUS_POLL_MAX_DURATION_MS,
    );
    perf.statusAPI.pollingMs = Date.now() - pollStart;
    perf.statusAPI.pollCount = pollCount;
    perf.statusAPI.pollIntervalMs = IndexConfig.STATUS_POLL_INTERVAL_MS;

    const resources = await getStatusJobDetails(jobUrl);
    perf.statusAPI.totalDurationMs = Date.now() - statusStart;
    perf.statusAPI.resourcesDiscovered = resources.length;

    const payloadJson = JSON.stringify(resources);
    const payloadSizeKB = Math.round((payloadJson.length / 1024) * 10) / 10;
    const payloadSizeMB = Math.round((payloadJson.length / (1024 * 1024)) * 100) / 100;
    perf.statusAPI.payloadSizeKB = payloadSizeKB;
    if (payloadSizeMB >= 1) {
      perf.statusAPI.payloadSizeMB = payloadSizeMB;
    }

    const currentTimestamp = Date.now();
    let pageCount = 0;
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
      } else {
        const fp = toAbsoluteFilePath(resource.path);
        const existing = filesByPath.get(fp);
        if (!existing || syntheticEvent.timestamp > existing.timestamp) {
          filesByPath.set(fp, syntheticEvent);
          fileCount += 1;
        }
      }
    });

    perf.statusAPI.pagesDiscovered = pageCount;
    perf.statusAPI.filesDiscovered = fileCount;

    emitEarlyLinked();

    await medialogPromise;
  } finally {
    await medialogPromise?.catch(() => {});
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

  onProgress({ stage: 'processing', message: 'Building content usage map (parsing pages)...', percent: 78 });
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

  const usageMap = await buildUsageMap(pages, org, repo, ref, (p) => onProgress(p));
  perf.markdownParse.pages = pages.length;
  perf.markdownParse.uniquePages = uniquePagePaths.size;
  if (duplicateCount > 0) {
    perf.markdownParse.duplicatePageEvents = duplicateCount;
  }
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

  const saveStart = Date.now();
  const sheetBuildStart = Date.now();
  const mediaSheet = buildMediaSheet(index);
  const usageSheet = buildUsageSheet(index);
  const sheetBuildMs = Date.now() - sheetBuildStart;

  onProgress({
    stage: 'saving',
    message: `Saving ${mediaSheet.length} media entries, ${usageSheet.length} page-hash pairs...`,
    percent: 90,
  });

  const indexPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX}`;
  const multiSheetStart = Date.now();
  const formData = await createMultiSheet({
    [SheetNames.MEDIA]: mediaSheet,
    [SheetNames.USAGE]: usageSheet,
  });
  const multiSheetMs = Date.now() - multiSheetStart;

  const blob = formData.get('data');
  const payloadSizeBytes = blob ? blob.size : 0;
  const payloadSizeKB = Math.round((payloadSizeBytes / 1024) * 10) / 10;
  const payloadSizeMB = Math.round((payloadSizeBytes / (1024 * 1024)) * 100) / 100;

  const uploadStart = Date.now();
  const indexResp = await daFetch(`${DA_ORIGIN}/source${indexPath}`, {
    method: 'POST',
    body: formData,
  });
  const uploadMs = Date.now() - uploadStart;
  if (!indexResp.ok) {
    const isDenied = indexResp.status === 401 || indexResp.status === 403;
    const code = isDenied ? ErrorCodes.DA_WRITE_DENIED : ErrorCodes.DA_SAVE_FAILED;
    const msg = isDenied ? t('DA_WRITE_DENIED') : t('DA_SAVE_FAILED');
    logMediaLibraryError(code, { status: indexResp.status, endpoint: indexPath });
    throw new MediaLibraryError(code, msg, { status: indexResp.status, endpoint: indexPath });
  }

  const metaSaveStart = Date.now();
  const metaResp = await saveIndexMeta({
    lastFetchTime: Date.now(),
    entriesCount: index.length,
    mediaCount: mediaSheet.length,
    usageCount: usageSheet.length,
    lastRefreshBy: 'media-indexer',
    lastBuildMode: buildMode,
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
