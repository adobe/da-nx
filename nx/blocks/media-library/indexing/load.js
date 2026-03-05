import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { createSheet } from './admin-api.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { t } from '../core/messages.js';
import {
  buildFullIndex,
  buildIncrementalIndex,
  checkReindexEligibility,
  getIndexStatus,
} from './build.js';
import { sortMediaData } from '../core/utils.js';
import { getDedupeKey } from '../core/urls.js';
import {
  IndexFiles,
  SheetNames,
} from '../core/constants.js';

export function getMediaLibraryPath(sitePath) {
  return `${sitePath}/${IndexFiles.FOLDER}`;
}

export function getMediaSheetPath(sitePath) {
  return `${getMediaLibraryPath(sitePath)}/${IndexFiles.MEDIA_INDEX}`;
}

export function getIndexLockPath(sitePath) {
  return `${getMediaLibraryPath(sitePath)}/${IndexFiles.INDEX_LOCK}`;
}

export async function saveMediaSheet(data, sitePath) {
  const path = getMediaSheetPath(sitePath);
  const formData = await createSheet(data);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function loadMediaSheet(sitePath) {
  const path = getMediaSheetPath(sitePath);

  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);

    if (resp.ok) {
      const data = await resp.json();
      const result = data[SheetNames.MEDIA]?.data;
      if (!Array.isArray(result)) {
        logMediaLibraryError(ErrorCodes.INDEX_PARSE_ERROR, { path, error: 'Invalid index shape' });
        throw new MediaLibraryError(ErrorCodes.INDEX_PARSE_ERROR, t('INDEX_PARSE_ERROR'), { path });
      }
      return result;
    }
  } catch (error) {
    if (error instanceof MediaLibraryError) throw error;
    logMediaLibraryError(ErrorCodes.INDEX_PARSE_ERROR, { path, error: error?.message });
    throw new MediaLibraryError(ErrorCodes.INDEX_PARSE_ERROR, t('INDEX_PARSE_ERROR'), { path });
  }
  return [];
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

// Loads media sheet if index changed; returns { hasChanged, mediaData }.
export async function loadMediaIfUpdated(sitePath, org, repo) {
  const { hasChanged } = await hasMediaSheetChanged(sitePath, org, repo);

  if (hasChanged) {
    const mediaData = await loadMediaSheet(sitePath);
    return { hasChanged: true, mediaData };
  }

  return { hasChanged: false, mediaData: null };
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
  } catch (error) {
    return { exists: false, locked: false, timestamp: null };
  }
  return { exists: false, locked: false, timestamp: null };
}

export async function removeIndexLock(sitePath) {
  const path = getIndexLockPath(sitePath);
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
  if (!resp.ok) {
    logMediaLibraryError(ErrorCodes.LOCK_REMOVE_FAILED, { status: resp.status, path });
    throw new MediaLibraryError(ErrorCodes.LOCK_REMOVE_FAILED, t('LOCK_REMOVE_FAILED'), { status: resp.status, path });
  }
  return resp;
}

// Builds uniqueItems, usageIndex, folderPaths from raw media data.
export function buildMediaIndexStructures(mediaData) {
  const uniqueItemsMap = new Map();
  const usageIndex = new Map();
  const folderPaths = new Set();

  mediaData.forEach((item) => {
    const groupingKey = item.url ? getDedupeKey(item.url) : item.hash;
    const existingItem = uniqueItemsMap.get(groupingKey);
    if (!uniqueItemsMap.has(groupingKey) || item.timestamp > existingItem.timestamp) {
      uniqueItemsMap.set(groupingKey, item);
    }

    if (item.doc) {
      if (!usageIndex.has(groupingKey)) {
        usageIndex.set(groupingKey, []);
      }
      usageIndex.get(groupingKey).push(item);

      const lastSlash = item.doc.lastIndexOf('/');
      if (lastSlash > 0) {
        const folder = item.doc.substring(0, lastSlash);
        folderPaths.add(folder);
      }
    }
  });

  return {
    uniqueItems: Array.from(uniqueItemsMap.values()),
    usageIndex,
    folderPaths,
  };
}

// eslint-disable-next-line max-len -- function signature
export default async function buildMediaIndex(sitePath, org, repo, ref, onProgress, onProgressiveData) {
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
    const useIncremental = reindexCheck.shouldReindex;

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
