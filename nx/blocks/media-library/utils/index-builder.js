import {
  streamLog, loadIndexMeta, saveIndexMeta, checkIndex, loadSheet, createSheet,
} from './admin-api.js';
import {
  normalizePath, isPage, extractName, detectMediaType,
  isPdf, isSvg, isFragmentDoc, isPdfOrSvg,
  isLinkedContentPath, toAbsoluteFilePath,
  buildUsageMap, matchPageEvents,
  toLinkedContentEntry, toExternalMediaEntry, checkMemory,
} from './index-helpers.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { daFetch } from '../../../utils/daFetch.js';
import {
  IndexConfig,
  Operation,
  IndexFiles,
  Paths,
} from './constants.js';
import { getDedupeKey } from './filters.js';

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
  const { exists: indexExists, lastModified: indexLastModified } = await checkIndex('.da/mediaindex', org, repo);

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

function removeMediaMaybeAddOrphan(idx, entry, path, medialog) {
  const i = idx.findIndex((e) => e.hash === entry.hash && e.doc === path);
  if (i === -1) return 0;
  const { hash } = entry;
  const hasDelete = medialog.some((m) => m.mediaHash === hash && m.operation === 'delete');
  idx.splice(i, 1);
  const stillHasEntry = idx.some((e) => e.hash === hash);
  const alreadyUnused = idx.some((e) => e.hash === hash && !e.doc);
  if (!stillHasEntry && !hasDelete && !alreadyUnused) {
    idx.push({
      hash,
      doc: '',
      url: entry.url,
      name: entry.name,
      timestamp: entry.timestamp,
      user: entry.user,
      operation: entry.operation,
      type: entry.type,
      status: 'unused',
    });
  }
  return 1;
}

function processPageMediaUpdates(updatedIndex, pagesByPath, medialogEntries, onLog) {
  let added = 0;
  let removed = 0;

  pagesByPath.forEach((pageEvents, normalizedPath) => {
    const latestEvent = pageEvents[0];
    const latestTs = latestEvent.timestamp;
    const windowStart = latestTs;
    const windowEnd = latestTs + IndexConfig.INCREMENTAL_WINDOW_MS;

    onLog(`--- Page: ${normalizedPath} ---`);
    onLog(`  Latest preview: ${latestTs} (${new Date(latestTs).toISOString()})`);
    onLog(`  Window: [${windowStart}-${windowEnd}] (${IndexConfig.INCREMENTAL_WINDOW_MS / 1000}s)`);

    const matchesPage = (m) => m.resourcePath && m.resourcePath === normalizedPath;
    const pageMedialogAll = medialogEntries.filter(matchesPage);
    const inWindow = (m) => m.timestamp >= windowStart && m.timestamp < windowEnd;
    const newPageMedia = pageMedialogAll.filter(inWindow);
    const outsideWindow = pageMedialogAll.filter((m) => !newPageMedia.includes(m));

    if (pageMedialogAll.length > 0) {
      onLog(`  Medialog for page: ${pageMedialogAll.length} total, ${newPageMedia.length} in window, ${outsideWindow.length} outside`);
      if (outsideWindow.length > 0) {
        outsideWindow.slice(0, 3).forEach((m) => {
          onLog(`    Outside: hash=${m.mediaHash} ts=${m.timestamp} (${new Date(m.timestamp).toISOString()})`);
        });
      }
    }

    const oldPageEntries = updatedIndex.filter((e) => e.doc === normalizedPath);
    const oldHashes = new Set(oldPageEntries.map((e) => e.hash));
    const newHashes = new Set(newPageMedia.map((m) => m.mediaHash));

    onLog(`  Old (index): ${oldHashes.size} hashes ${[...oldHashes].slice(0, 5).join(', ')}${oldHashes.size > 5 ? '...' : ''}`);
    onLog(`  New (medialog in window): ${newHashes.size} hashes ${[...newHashes].slice(0, 5).join(', ')}${newHashes.size > 5 ? '...' : ''}`);

    if (newPageMedia.length === 0 && oldPageEntries.length > 0) {
      onLog('  Edge case: Page previewed with no media in window - removing old entries');
      const rm = removeMediaMaybeAddOrphan;
      oldPageEntries.forEach((oldEntry) => {
        removed += rm(updatedIndex, oldEntry, normalizedPath, medialogEntries);
      });
      return;
    }

    const toRemove = [...oldHashes].filter((h) => !newHashes.has(h));
    const toAdd = [...newHashes].filter((h) => !oldHashes.has(h));
    const unchanged = [...newHashes].filter((h) => oldHashes.has(h));

    if (toRemove.length || toAdd.length) {
      onLog(`  Diff: remove ${toRemove.length} (${toRemove.slice(0, 3).join(', ')}${toRemove.length > 3 ? '...' : ''}), add ${toAdd.length}`);
    }

    const rm = removeMediaMaybeAddOrphan;
    toRemove.forEach((hash) => {
      const oldEntry = oldPageEntries.find((e) => e.hash === hash);
      if (oldEntry) {
        removed += rm(updatedIndex, oldEntry, normalizedPath, medialogEntries);
      }
    });

    toAdd.forEach((hash) => {
      const media = newPageMedia.find((m) => m.mediaHash === hash);
      if (media) {
        updatedIndex.push({
          hash: media.mediaHash,
          doc: normalizedPath,
          url: media.path,
          name: extractName(media),
          timestamp: media.timestamp,
          user: media.user,
          operation: media.operation,
          type: detectMediaType(media),
          status: 'referenced',
        });
        added += 1;
      }
    });

    unchanged.forEach((hash) => {
      const idx = updatedIndex.findIndex((e) => e.hash === hash && e.doc === normalizedPath);
      const media = newPageMedia.find((m) => m.mediaHash === hash);
      if (idx !== -1 && media) {
        updatedIndex[idx].timestamp = media.timestamp;
      }
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
          doc: '',
          url: media.path,
          name: media.originalFilename.split('/').pop(),
          timestamp: media.timestamp,
          user: media.user,
          operation: media.operation,
          type: detectMediaType(media),
          status: 'unused',
        });
        added += 1;
      }
    }
  });

  return added;
}

async function processLinkedContentIncremental(
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
  onProgress({
    stage: 'starting',
    message: 'Mode: Incremental re-index (since last build)',
    percent: 5,
  });

  onProgress({ stage: 'loading', message: 'Loading existing index...', percent: 8 });
  const existingIndex = await loadSheet(indexPath);

  if (onProgressiveData && existingIndex?.length > 0) {
    onProgressiveData(existingIndex);
  }

  log(`Fetching auditlog since ${new Date(lastFetchTime).toISOString()}`);
  onProgress({ stage: 'fetching', message: 'Fetching new auditlog entries...', percent: 15 });

  const auditlogEntries = [];
  await streamLog('log', org, repo, ref, lastFetchTime, IndexConfig.API_PAGE_SIZE, (entries) => {
    auditlogEntries.push(...entries);
    onProgress({
      stage: 'fetching',
      message: `Fetched ${auditlogEntries.length} auditlog entries...`,
      percent: 25,
    });
  });

  const validEntries = auditlogEntries.filter((e) => e && e.path && e.route === 'preview');
  const pages = validEntries.filter((e) => isPage(e.path));

  onProgress({ stage: 'fetching', message: 'Fetching new medialog entries...', percent: 35 });

  const medialogEntries = [];
  await streamLog('medialog', org, repo, ref, lastFetchTime, IndexConfig.API_PAGE_SIZE, (entries) => {
    medialogEntries.push(...entries);
    onProgress({
      stage: 'fetching',
      message: `Fetched ${medialogEntries.length} medialog entries...`,
      percent: 45,
    });
  });

  if (pages.length === 0 && medialogEntries.length === 0) {
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

  const pagesByPath = new Map();
  pages.forEach((e) => {
    const p = normalizePath(e.path);
    if (!pagesByPath.has(p)) pagesByPath.set(p, []);
    pagesByPath.get(p).push(e);
  });

  pagesByPath.forEach((events) => {
    events.sort((a, b) => b.timestamp - a.timestamp);
  });
  log(`Time window: ${IndexConfig.INCREMENTAL_WINDOW_MS / 1000}s (medialog within window of latest preview)`);
  log(`Pages to process: ${pagesByPath.size} (${[...pagesByPath.keys()].join(', ')})`);
  log(`Medialog entries since lastFetch: ${medialogEntries.length}`);

  const pageResults = processPageMediaUpdates(updatedIndex, pagesByPath, medialogEntries, log);
  let { added, removed } = pageResults;

  const referencedHashes = new Set(
    updatedIndex.filter((e) => e.doc).flatMap((e) => e.hash),
  );

  const standaloneAdded = processStandaloneUploads(updatedIndex, medialogEntries, referencedHashes);
  added += standaloneAdded;

  const files = validEntries.filter((e) => !isPage(e.path));
  const linkedResults = await processLinkedContentIncremental(
    updatedIndex,
    files,
    pages,
    org,
    repo,
    ref,
    onProgress,
    log,
  );
  added += linkedResults.added;
  removed += linkedResults.removed;

  onProgress({
    stage: 'processing',
    message: `Incremental: +${added} added, -${removed} removed, total: ${updatedIndex.length}`,
    percent: 85,
  });

  onProgress({ stage: 'saving', message: `Saving ${updatedIndex.length} entries...`, percent: 90 });

  const formData = await createSheet(updatedIndex);
  await daFetch(`${DA_ORIGIN}/source${indexPath}`, {
    method: 'POST',
    body: formData,
  });

  await saveIndexMeta({
    lastFetchTime: Date.now(),
    entriesCount: updatedIndex.length,
    lastRefreshBy: 'media-indexer',
    lastBuildMode: 'incremental',
  }, metaPath);

  onProgress({
    stage: 'complete',
    message: `Incremental complete! ${updatedIndex.length} entries (${added} added, ${removed} removed)`,
    percent: 100,
  });

  return updatedIndex;
}

export async function buildFullIndex(sitePath, org, repo, ref, onProgress, onProgressiveData) {
  const index = [];
  const buildMode = 'full';

  onProgress({
    stage: 'starting',
    message: 'Mode: Full build (rebuilding from auditlog + medialog)',
    percent: 5,
  });

  onProgress({ stage: 'fetching', message: 'Fetching auditlog (streaming)...', percent: 10 });

  const pagesByPath = new Map();
  const filesByPath = new Map();
  const deletedPaths = new Set();
  let auditlogCount = 0;
  let firstChunkLogged = false;

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

  await streamLog('log', org, repo, ref, null, IndexConfig.API_PAGE_SIZE, (chunk) => {
    if (!firstChunkLogged) {
      firstChunkLogged = true;
      // eslint-disable-next-line no-console
      console.log(`[MediaIndexer] First auditlog chunk: ${chunk.length} entries`);
    }
    chunk.forEach((e) => {
      if (!e?.path || e.route !== 'preview') return;
      auditlogCount += 1;
      if (isPage(e.path)) {
        const p = normalizePath(e.path);
        if (!pagesByPath.has(p)) pagesByPath.set(p, []);
        pagesByPath.get(p).push(e);
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
      message: `Auditlog: ${auditlogCount} entries, ${pagesByPath.size} pages...`,
      percent: 15,
    });
  });

  pagesByPath.forEach((events) => events.sort((a, b) => b.timestamp - a.timestamp));

  const pages = [];
  pagesByPath.forEach((events) => pages.push(...events));

  filesByPath.forEach((event, path) => {
    if (isLinkedContentPath(path) && event.method === 'DELETE') {
      deletedPaths.add(path);
    }
  });

  onProgress({
    stage: 'fetching',
    message: `Identified ${pages.length} page events, ${filesByPath.size} files`,
    percent: 25,
  });

  onProgress({ stage: 'fetching', message: 'Fetching medialog (streaming)...', percent: 30 });

  const entryMap = new Map();
  const referencedHashes = new Set();
  const standaloneBuffer = [];
  let medialogCount = 0;
  const PROGRESSIVE_EMIT_INTERVAL = 100;

  const emitProgressive = () => {
    if (onProgressiveData && (entryMap.size > 0 || earlyLinkedEntries.length > 0)) {
      const combined = [...earlyLinkedEntries, ...Array.from(entryMap.values())];
      onProgressiveData(dedupeProgressiveItems(combined));
    }
  };

  await streamLog('medialog', org, repo, ref, null, IndexConfig.API_PAGE_SIZE, (chunk) => {
    chunk.forEach((media) => {
      medialogCount += 1;
      if (media.resourcePath) {
        const matches = matchPageEvents(pagesByPath, media.resourcePath, media.timestamp);
        matches.forEach((pageEvent) => {
          const normalizedPath = normalizePath(pageEvent.path);
          const hash = media.mediaHash;
          const key = `${hash}|${normalizedPath}`;
          const existing = entryMap.get(key);
          if (!existing || media.timestamp > existing.timestamp) {
            entryMap.set(key, {
              hash,
              doc: normalizedPath,
              url: media.path,
              name: extractName(media),
              timestamp: media.timestamp,
              user: media.user,
              operation: media.operation,
              type: detectMediaType(media),
              status: 'referenced',
            });
          }
          referencedHashes.add(hash);
        });
      } else if (media.originalFilename) {
        standaloneBuffer.push(media);
      }
      if (medialogCount > 0 && medialogCount % PROGRESSIVE_EMIT_INTERVAL === 0) {
        emitProgressive();
      }
    });
    emitProgressive();
    const mem = checkMemory();
    if (mem.warning) {
      onProgress({
        stage: 'processing',
        message: `Memory: ${mem.usedMB.toFixed(0)}MB / ${mem.limitMB.toFixed(0)}MB`,
        percent: 35,
      });
    } else {
      onProgress({
        stage: 'fetching',
        message: `Medialog: ${medialogCount} entries processed...`,
        percent: 35,
      });
    }
  });

  onProgress({
    stage: 'processing',
    message: `Processed ${medialogCount} medialog, ${entryMap.size} page refs`,
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
          doc: '',
          url: media.path,
          name: media.originalFilename.split('/').pop(),
          timestamp: media.timestamp,
          user: media.user,
          operation: media.operation,
          type: detectMediaType(media),
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

  if (onProgressiveData && (index.length > 0 || earlyLinkedEntries.length > 0)) {
    const combined = [...earlyLinkedEntries, ...index];
    onProgressiveData(dedupeProgressiveItems(combined));
  }

  // Phase 5: Linked content (PDFs, SVGs, fragments) - parse pages for usage
  onProgress({ stage: 'processing', message: 'Building content usage map (parsing pages)...', percent: 78 });
  const usageMap = await buildUsageMap(pages, org, repo, ref, (p) => onProgress(p));

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

  onProgress({ stage: 'saving', message: `Saving ${index.length} entries...`, percent: 90 });

  const indexPath = `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX}`;
  const formData = await createSheet(index);
  await daFetch(`${DA_ORIGIN}/source${indexPath}`, {
    method: 'POST',
    body: formData,
  });

  await saveIndexMeta({
    lastFetchTime: Date.now(),
    entriesCount: index.length,
    lastRefreshBy: 'media-indexer',
    lastBuildMode: buildMode,
  }, `${sitePath}/${IndexFiles.FOLDER}/${IndexFiles.MEDIA_INDEX_META}`);

  onProgress({ stage: 'complete', message: `Complete! ${index.length} entries indexed`, percent: 100 });

  return index;
}
