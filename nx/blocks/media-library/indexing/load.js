import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import {
  createSheet,
  loadIndexChunks,
  loadSheetMeta,
} from './admin-api.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { t } from '../core/messages.js';
import {
  buildFullIndex,
  buildIncrementalIndex,
  checkReindexEligibility,
  getIndexStatus,
} from './build.js';
import { getCanonicalMediaTimestamp, sortMediaData } from '../core/utils.js';
import { getDedupeKey, canonicalizeMediaUrl } from '../core/urls.js';
import {
  IndexFiles,
  SheetNames,
} from '../core/constants.js';

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
      };
    }
  } catch (e) {
    return { exists: false, locked: false, timestamp: null };
  }
  return { exists: false, locked: false, timestamp: null };
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
  if (lock.exists && lock.locked) {
    return { data: [], indexing: true };
  }

  try {
    // Check if index is chunked by loading meta
    const meta = await loadSheetMeta(metaPath);

    if (meta?.chunked === true) {
      const chunkCount = meta.chunkCount || 0;
      if (chunkCount === 0) {
        return { data: [] };
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
      };
    }

    if (resp.status === 401 || resp.status === 403) {
      logMediaLibraryError(ErrorCodes.DA_READ_DENIED, { path, status: resp.status });
      throw new MediaLibraryError(ErrorCodes.DA_READ_DENIED, t('DA_READ_DENIED'), { path });
    }

    if (resp.status === 404) {
      return { data: [], indexMissing: true };
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
  const lockData = [{
    timestamp: Date.now(),
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
        merged.latestUsageTimestamp = Math.max(
          item.latestUsageTimestamp ?? item.timestamp ?? 0,
          existingItem.latestUsageTimestamp ?? existingItem.timestamp ?? 0,
        );
        merged.nameSource = item.nameSource || existingItem.nameSource;
        merged.timestampSource = item.timestampSource || existingItem.timestampSource;
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
  if (existingLock.exists && existingLock.locked) {
    const lockAge = Date.now() - existingLock.timestamp;
    const maxLockAge = 30 * 60 * 1000; // 30 minutes

    if (lockAge < maxLockAge) {
      throw new Error(`Index build already in progress. Lock created ${Math.round(lockAge / 1000 / 60)} minutes ago.`);
    }
    await removeIndexLock(sitePath);
  }

  await createIndexLock(sitePath);

  try {
    const reindexCheck = await checkReindexEligibility(sitePath, org, repo);
    const useIncremental = !forceFull && reindexCheck.shouldReindex;

    let mediaData;
    if (useIncremental) {
      mediaData = await buildIncrementalIndex(
        sitePath,
        org,
        repo,
        ref,
        onProgress,
        undefined,
        onProgressiveData,
      );
    } else {
      mediaData = await buildFullIndex(sitePath, org, repo, ref, onProgress, onProgressiveData);
    }

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
  }
}
