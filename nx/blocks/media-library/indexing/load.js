import { daFetch } from '../../../utils/daFetch.js';
import {
  createSheet,
  loadIndexChunks,
  loadSheetMeta,
} from './admin-api.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { t } from '../core/messages.js';
import {
  checkReindexEligibility,
  getIndexStatus,
} from './index-status.js';
import { getCanonicalMediaTimestamp, sortMediaData } from '../core/utils.js';
import { getDedupeKey, canonicalizeMediaUrl } from '../core/urls.js';
import {
  IndexFiles,
  SheetNames,
  IndexConfig,
  DA_ETC_ORIGIN,
  DA_ORIGIN,
} from '../core/constants.js';
import { isPerfEnabled } from '../core/params.js';

const LOCK_OWNER_STORAGE_KEY = 'media-library-lock-owner-id';

function getOrgRepoFromSitePath(sitePath) {
  if (!sitePath) return { org: null, repo: null };
  const parts = sitePath.split('/').filter(Boolean);
  return {
    org: parts[0] || null,
    repo: parts[1] || null,
  };
}

export function getMediaLibraryPath(sitePath) {
  return `${sitePath}/${IndexFiles.FOLDER}`;
}

export function getMediaSheetPath(sitePath) {
  return `${getMediaLibraryPath(sitePath)}/${IndexFiles.MEDIA_INDEX}`;
}

export function getIndexLockPath(sitePath) {
  return `${getMediaLibraryPath(sitePath)}/${IndexFiles.INDEX_LOCK}`;
}

export async function checkIndexLock(sitePath) {
  const path = getIndexLockPath(sitePath);
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (resp.ok) {
      const data = await resp.json();
      const lockData = data.data?.[0] || data;
      return {
        exists: true,
        locked: lockData.locked || false,
        timestamp: lockData.timestamp || null,
        startedAt: lockData.startedAt || lockData.timestamp || null,
        lastUpdated: lockData.lastUpdated || lockData.timestamp || null,
        ownerId: lockData.ownerId || '',
        mode: lockData.mode || '',
      };
    }
  } catch (e) {
    return {
      exists: false,
      locked: false,
      timestamp: null,
      startedAt: null,
      lastUpdated: null,
      ownerId: '',
      mode: '',
    };
  }
  return {
    exists: false,
    locked: false,
    timestamp: null,
    startedAt: null,
    lastUpdated: null,
    ownerId: '',
    mode: '',
  };
}

export function getIndexLockOwnerId() {
  if (typeof window === 'undefined' || !window.sessionStorage) return '';

  let ownerId = window.sessionStorage.getItem(LOCK_OWNER_STORAGE_KEY);
  if (ownerId) return ownerId;

  ownerId = `ml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  window.sessionStorage.setItem(LOCK_OWNER_STORAGE_KEY, ownerId);
  return ownerId;
}

export function isFreshIndexLock(lock, now = Date.now()) {
  if (!(lock?.exists && lock?.locked)) return false;
  const heartbeat = lock.lastUpdated || lock.timestamp || lock.startedAt;
  if (!heartbeat) return false;
  return (now - heartbeat) < IndexConfig.LOCK_STALE_THRESHOLD_MS;
}

export async function saveMediaSheet(data, sitePath) {
  const path = getMediaSheetPath(sitePath);
  const formData = await createSheet(data);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function loadMediaSheet(sitePath, onProgressiveChunk) {
  const path = getMediaSheetPath(sitePath);
  const basePath = getMediaLibraryPath(sitePath);
  const metaPath = `${basePath}/${IndexFiles.MEDIA_INDEX_META}`;
  const { org, repo } = getOrgRepoFromSitePath(sitePath);
  const lock = await checkIndexLock(sitePath);
  const lockFresh = isFreshIndexLock(lock);

  try {
    // Check if index is chunked by loading meta
    const meta = await loadSheetMeta(metaPath);

    if (meta?.chunked === true) {
      const chunkCount = meta.chunkCount || 0;
      if (chunkCount === 0) {
        return { data: [], lockFresh };
      }

      try {
        const result = await loadIndexChunks(
          basePath,
          chunkCount,
          SheetNames.MEDIA,
          onProgressiveChunk,
        );
        if (!Array.isArray(result)) {
          logMediaLibraryError(ErrorCodes.INDEX_PARSE_ERROR, { path, error: 'Invalid chunked index shape' });
          throw new MediaLibraryError(ErrorCodes.INDEX_PARSE_ERROR, t('INDEX_PARSE_ERROR'), { path });
        }
        const mappedData = result.map((item) => ({
          ...item,
          url: canonicalizeMediaUrl(item.url, org, repo),
        }));
        return {
          data: mappedData,
          lockFresh,
        };
      } catch (chunkError) {
        // eslint-disable-next-line no-console
        console.warn(`[MediaIndexer:loadMediaSheet] Chunk load failed: ${chunkError.message}, falling back to single index.json`);
      }
    }

    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);

    if (resp.ok) {
      const data = await resp.json();
      const result = data[SheetNames.MEDIA]?.data;
      if (!Array.isArray(result)) {
        logMediaLibraryError(ErrorCodes.INDEX_PARSE_ERROR, { path, error: 'Invalid index shape' });
        throw new MediaLibraryError(ErrorCodes.INDEX_PARSE_ERROR, t('INDEX_PARSE_ERROR'), { path });
      }
      return {
        data: result.map((item) => ({
          ...item,
          url: canonicalizeMediaUrl(item.url, org, repo),
        })),
        lockFresh,
      };
    }

    if (resp.status === 401 || resp.status === 403) {
      logMediaLibraryError(ErrorCodes.DA_READ_DENIED, { path, status: resp.status });
      throw new MediaLibraryError(ErrorCodes.DA_READ_DENIED, t('DA_READ_DENIED'), { path });
    }

    if (resp.status === 404) {
      return {
        data: [],
        indexMissing: true,
        indexing: lockFresh,
        lockFresh,
      };
    }

    logMediaLibraryError(ErrorCodes.INDEX_LOAD_FAILED, { path, status: resp.status });
    throw new MediaLibraryError(ErrorCodes.INDEX_LOAD_FAILED, t('INDEX_LOAD_FAILED'), { path });
  } catch (error) {
    if (error instanceof MediaLibraryError) throw error;
    const isParseLike = error instanceof SyntaxError
      || (error?.message?.toLowerCase?.().includes('json') ?? false);

    if (isParseLike) {
      logMediaLibraryError(ErrorCodes.INDEX_PARSE_ERROR, { path, error: error?.message });
      throw new MediaLibraryError(ErrorCodes.INDEX_PARSE_ERROR, t('INDEX_PARSE_ERROR'), { path });
    }
    logMediaLibraryError(ErrorCodes.NETWORK_TIMEOUT, { path, error: error?.message });
    throw new MediaLibraryError(ErrorCodes.NETWORK_TIMEOUT, t('NOTIFY_DISCOVERY_FAILED'), { path });
  }
}

export async function hasMediaSheetChanged(sitePath, org, repo) {
  try {
    const status = await getIndexStatus(sitePath, org, repo);

    if (!status.indexExists) {
      return { hasChanged: true, fileTimestamp: null };
    }

    const key = `${sitePath.replace(/\//g, '-')}-media-lastupdated`;
    const stored = localStorage.getItem(key);
    const lastKnown = stored ? parseInt(stored, 10) : null;

    const hasChanged = !lastKnown || status.indexLastModified > lastKnown;

    if (status.indexLastModified) {
      localStorage.setItem(key, status.indexLastModified.toString());
    }

    return { hasChanged, fileTimestamp: status.indexLastModified };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[MediaIndexer] Error checking ${IndexFiles.MEDIA_INDEX} modification:`, error);
    return { hasChanged: true, fileTimestamp: null };
  }
}

// Loads media sheet if index changed; returns { hasChanged, mediaData, indexMissing, indexing }.
export async function loadMediaIfUpdated(sitePath, org, repo) {
  const { hasChanged } = await hasMediaSheetChanged(sitePath, org, repo);

  if (hasChanged) {
    const { data, indexMissing, indexing } = await loadMediaSheet(sitePath);
    return {
      hasChanged: true,
      mediaData: data,
      indexMissing: !!indexMissing,
      indexing: !!indexing,
    };
  }

  return { hasChanged: false, mediaData: null, indexMissing: false, indexing: false };
}

export async function createIndexLock(sitePath) {
  const path = getIndexLockPath(sitePath);
  const ownerId = getIndexLockOwnerId();
  const now = Date.now();
  const lockData = [{
    timestamp: now,
    startedAt: now,
    lastUpdated: now,
    ownerId,
    locked: true,
  }];
  const formData = await createSheet(lockData);
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
  if (!resp.ok) {
    logMediaLibraryError(ErrorCodes.LOCK_CREATE_FAILED, { status: resp.status, path });
    const isDenied = resp.status === 401 || resp.status === 403;
    const msg = isDenied ? t('LOCK_CREATE_FAILED_PERMISSION') : t('LOCK_CREATE_FAILED_GENERIC');
    throw new MediaLibraryError(ErrorCodes.LOCK_CREATE_FAILED, msg, { status: resp.status, path });
  }
  return resp;
}

export async function refreshIndexLock(sitePath, lockData = {}) {
  const path = getIndexLockPath(sitePath);
  const now = Date.now();
  const formData = await createSheet([{
    locked: true,
    timestamp: lockData.timestamp || lockData.startedAt || now,
    startedAt: lockData.startedAt || lockData.timestamp || now,
    lastUpdated: now,
    ownerId: lockData.ownerId || getIndexLockOwnerId(),
    mode: lockData.mode || '',
  }]);
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
  if (!resp.ok) {
    logMediaLibraryError(ErrorCodes.LOCK_CREATE_FAILED, { status: resp.status, path });
    const isDenied = resp.status === 401 || resp.status === 403;
    const msg = isDenied ? t('LOCK_CREATE_FAILED_PERMISSION') : t('LOCK_CREATE_FAILED_GENERIC');
    throw new MediaLibraryError(ErrorCodes.LOCK_CREATE_FAILED, msg, { status: resp.status, path });
  }
  return resp;
}

export async function removeIndexLock(sitePath) {
  const path = getIndexLockPath(sitePath);
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
  if (!resp.ok) {
    if (resp.status === 404) return resp;
    logMediaLibraryError(ErrorCodes.LOCK_REMOVE_FAILED, { status: resp.status, path });
    throw new MediaLibraryError(ErrorCodes.LOCK_REMOVE_FAILED, t('LOCK_REMOVE_FAILED'), { status: resp.status, path });
  }
  return resp;
}

function statusRankForUniqueCard(item) {
  return item.doc ? 2 : 0;
}

function shouldReplaceUniqueItem(existingItem, item) {
  if (!existingItem) return true;

  const itemHasDoc = !!(item.doc && item.doc !== '');
  const existingHasDoc = !!(existingItem.doc && existingItem.doc !== '');
  if (itemHasDoc && !existingHasDoc) return true;
  if (!itemHasDoc && existingHasDoc) return false;

  const itemTs = getCanonicalMediaTimestamp(item);
  const existingTs = getCanonicalMediaTimestamp(existingItem);
  if (itemTs !== existingTs) return itemTs > existingTs;

  return statusRankForUniqueCard(item) > statusRankForUniqueCard(existingItem);
}

// Builds uniqueItems and usageIndex from raw media data.
export function buildMediaIndexStructures(mediaData) {
  const uniqueItemsMap = new Map();
  const usageIndex = new Map();

  mediaData.forEach((item) => {
    const groupingKey = item.url ? getDedupeKey(item.url) : item.hash;
    const existingItem = uniqueItemsMap.get(groupingKey);
    if (!uniqueItemsMap.has(groupingKey) || shouldReplaceUniqueItem(existingItem, item)) {
      const merged = { ...item };

      if (existingItem) {
        merged.originalPath = item.originalPath || existingItem.originalPath || '';
        merged.displayName = item.displayName || existingItem.displayName || item.name;
        const hasModified = item.modifiedTimestamp !== undefined
          && item.modifiedTimestamp !== null;
        merged.modifiedTimestamp = hasModified
          ? Math.max(item.modifiedTimestamp, existingItem.modifiedTimestamp ?? 0)
          : existingItem.modifiedTimestamp;
      }

      uniqueItemsMap.set(groupingKey, merged);
    }

    if (item.doc) {
      if (!usageIndex.has(groupingKey)) {
        usageIndex.set(groupingKey, []);
      }
      usageIndex.get(groupingKey).push(item);
    }
  });

  return {
    uniqueItems: Array.from(uniqueItemsMap.values()),
    usageIndex,
  };
}

/**
 * Run index build in web worker
 *
 * @param {string} mode - 'full' or 'incremental'
 * @param {string} sitePath - Site path
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} ref - Branch reference
 * @param {Function} onProgress - Progress callback
 * @param {Function} onProgressiveData - Progressive data callback
 * @returns {Promise<Array>} Media data
 */
async function runWorkerBuild(
  mode,
  sitePath,
  org,
  repo,
  ref,
  onProgress,
  onProgressiveData,
) {
  // Get runtime context
  const imsToken = window.adobeIMS?.getAccessToken?.()?.token;
  if (!imsToken) {
    throw new Error('No IMS token available');
  }

  // Get fresh site token using the same logic as main branch (with caching and expiry)
  // This ensures worker gets a valid token that won't immediately expire
  let siteToken = null;
  try {
    const { getAemSiteToken } = await import('./admin-api.js');
    const tokenResult = await getAemSiteToken({ org, site: repo, ref });
    siteToken = tokenResult?.siteToken || null;
  } catch {
    // If we can't get a fresh token, fall back to localStorage (legacy behavior)
    siteToken = window.localStorage?.getItem?.(`site-token-${org}-${repo}`) || null;
  }

  const daOrigin = DA_ORIGIN;
  const daEtcOrigin = DA_ETC_ORIGIN;
  const perfEnabled = isPerfEnabled();

  // Create worker using blob URL to avoid CORS issues with ?nx=local
  // When running with ?nx=local, files load from localhost but page is on da.live
  // Workers must be same-origin, so we create a blob URL
  const workerUrl = new URL('./worker/worker.js', import.meta.url).href;
  const response = await fetch(workerUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch worker code: ${response.status}`);
  }

  let workerCode = await response.text();

  // Replace ALL relative imports with absolute URLs so worker can fetch them
  // This converts: import './foo.js' → import 'http://localhost:6456/.../foo.js'
  const baseUrl = new URL('./worker/', import.meta.url).href;
  workerCode = workerCode.replace(
    /from\s+['"](\.\.[^'"]*|\.\/[^'"]*)['"]/g,
    (match, path) => {
      const absoluteUrl = new URL(path, baseUrl).href;
      return `from '${absoluteUrl}'`;
    },
  );

  // Create blob URL from transformed code
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const workerBlobUrl = URL.createObjectURL(blob);

  const worker = new Worker(workerBlobUrl, { type: 'module' });

  // Set up result promise
  const resultPromise = new Promise((resolve, reject) => {
    worker.onmessage = async (event) => {
      const { type, data, error, message, requestId } = event.data;

      if (type === 'progress') {
        onProgress?.(data);
      } else if (type === 'progressive') {
        onProgressiveData?.(data);
      } else if (type === 'log') {
        // eslint-disable-next-line no-console
        console.log('[IndexWorker]', message);
      } else if (type === 'token-refresh') {
        // Worker requests fresh site token (401/403 during markdown fetch)
        // Must clear cache first to force a real refresh (matches canonical behavior)
        try {
          const { getAemSiteToken, clearCachedAemSiteToken } = await import('./admin-api.js');
          clearCachedAemSiteToken(org, repo, ref);
          const tokenResult = await getAemSiteToken({ org, site: repo, ref });
          const freshToken = tokenResult?.siteToken || null;
          worker.postMessage({ type: 'token-refresh-response', requestId, token: freshToken });
        } catch (err) {
          worker.postMessage({ type: 'token-refresh-response', requestId, token: null, error: err.message });
        }
      } else if (type === 'success') {
        resolve(data);
      } else if (type === 'error') {
        reject(new Error(error.message || 'Worker error'));
      }
    };

    worker.onerror = (event) => {
      // eslint-disable-next-line no-console
      console.error('[runWorkerBuild] Worker error event:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      });
      const errorDetails = event.filename
        ? `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`
        : event.message;
      reject(new Error(`Worker error: ${errorDetails}`));
    };
  });

  // Send build parameters to worker
  worker.postMessage({
    mode,
    sitePath,
    org,
    repo,
    ref,
    imsToken,
    siteToken,
    daOrigin,
    daEtcOrigin,
    isPerfEnabled: perfEnabled,
    IndexConfig,
  });

  try {
    const result = await resultPromise;
    return result;
  } finally {
    // Clean up
    worker.terminate();
    URL.revokeObjectURL(workerBlobUrl);
  }
}

// eslint-disable-next-line max-len -- function signature
export default async function buildMediaIndex(
  sitePath,
  org,
  repo,
  ref,
  onProgress,
  onProgressiveData,
  options = {},
) {
  const { forceFull = false } = options;
  const startTime = Date.now();

  const existingLock = await checkIndexLock(sitePath);
  const ownerId = getIndexLockOwnerId();
  const ownsExistingLock = existingLock.ownerId && existingLock.ownerId === ownerId;
  if (isFreshIndexLock(existingLock) && !ownsExistingLock) {
    const heartbeat = existingLock.lastUpdated
      || existingLock.timestamp
      || existingLock.startedAt
      || Date.now();
    const lockAge = Date.now() - heartbeat;
    throw new Error(
      `Index build already in progress. Lock updated ${Math.round(lockAge / 1000 / 60)} minutes ago.`,
    );
  }
  if (
    existingLock.exists
    && existingLock.locked
    && !isFreshIndexLock(existingLock)
    && !ownsExistingLock
  ) {
    await removeIndexLock(sitePath);
  }

  await createIndexLock(sitePath);
  const heartbeatLockData = {
    startedAt: ownsExistingLock
      ? (existingLock.startedAt || existingLock.timestamp || Date.now())
      : Date.now(),
    timestamp: ownsExistingLock
      ? (existingLock.timestamp || existingLock.startedAt || Date.now())
      : Date.now(),
    ownerId,
    mode: forceFull ? 'full' : 'incremental',
  };
  const heartbeatTimer = setInterval(() => {
    refreshIndexLock(sitePath, heartbeatLockData).catch(() => {});
  }, IndexConfig.LOCK_HEARTBEAT_INTERVAL_MS);

  try {
    const reindexCheck = await checkReindexEligibility(sitePath, org, repo);
    const useIncremental = !forceFull && reindexCheck.shouldReindex;

    // Run build in worker (full or incremental)
    const buildMode = useIncremental ? 'incremental' : 'full';
    const mediaData = await runWorkerBuild(
      buildMode,
      sitePath,
      org,
      repo,
      ref,
      onProgress,
      onProgressiveData,
    );

    let lockRemoveFailed = false;
    try {
      await removeIndexLock(sitePath);
    } catch (lockErr) {
      if (lockErr.code === ErrorCodes.LOCK_REMOVE_FAILED) {
        lockRemoveFailed = true;
      } else {
        throw lockErr;
      }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    const sortedData = sortMediaData(mediaData);
    return {
      duration: `${duration}s`,
      hasChanges: true,
      mediaData: sortedData,
      lockRemoveFailed,
    };
  } catch (error) {
    try {
      await removeIndexLock(sitePath);
    } catch { /* swallow */ }
    throw error;
  } finally {
    clearInterval(heartbeatTimer);
  }
}
