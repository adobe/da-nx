import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { createSheet } from './admin-api.js';
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
  MediaType,
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

function normalizeMediaItem(item) {
  if (item.type === MediaType.IMAGE && (item.alt === 'null' || item.alt === undefined)) {
    return { ...item, alt: null };
  }
  return item;
}

export async function loadMediaSheet(sitePath) {
  const path = getMediaSheetPath(sitePath);

  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);

    if (resp.ok) {
      const data = await resp.json();
      const result = data[SheetNames.MEDIA].data;
      return result.map(normalizeMediaItem);
    }
  } catch (error) {
    console.error(`[MediaIndexer] Error loading ${IndexFiles.MEDIA_INDEX}:`, error); // eslint-disable-line no-console
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
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
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
  return daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
}

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

    // buildFullIndex and buildIncrementalIndex already save the multi-sheet structure
    await removeIndexLock(sitePath);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    const sortedData = sortMediaData(mediaData);
    return {
      duration: `${duration}s`,
      hasChanges: true,
      mediaData: sortedData,
    };
  } catch (error) {
    await removeIndexLock(sitePath);
    throw error;
  }
}
