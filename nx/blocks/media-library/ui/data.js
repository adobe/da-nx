/**
 * Display Data Module - Load and process index data for UI
 *
 * This module belongs to the display layer and is responsible for:
 * - Loading published index data for UI display
 * - Checking if index has changed (for refresh detection)
 * - Processing raw index data into display structures
 * - Read-only lock checking (to show indexing status in UI)
 *
 * NO indexing logic - only reads already-published index data.
 */

import { daFetch } from '../../../utils/daFetch.js';
import {
  loadIndexChunks,
  loadSheetMeta,
} from '../indexing/admin-api.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { t } from '../core/messages.js';
import { getIndexStatus } from '../indexing/index-status.js';
import { getCanonicalMediaTimestamp } from '../core/utils.js';
import { getDedupeKey, canonicalizeMediaUrl } from '../core/urls.js';
import { isIndexedExternalMediaEntry } from '../core/media.js';
import {
  IndexFiles,
  SheetNames,
  DA_ORIGIN,
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

export async function loadMediaSheet(sitePath, onProgressiveChunk) {
  const path = getMediaSheetPath(sitePath);
  const basePath = getMediaLibraryPath(sitePath);
  const metaPath = `${basePath}/${IndexFiles.MEDIA_INDEX_META}`;
  const { org, repo } = getOrgRepoFromSitePath(sitePath);

  try {
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
      return {
        data: [],
        indexMissing: true,
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

// Loads media sheet if index changed; returns { hasChanged, mediaData, indexMissing }.
export async function loadMediaIfUpdated(sitePath, org, repo) {
  const { hasChanged } = await hasMediaSheetChanged(sitePath, org, repo);

  if (hasChanged) {
    const { data, indexMissing } = await loadMediaSheet(sitePath);
    return {
      hasChanged: true,
      mediaData: data,
      indexMissing: !!indexMissing,
    };
  }

  return { hasChanged: false, mediaData: null, indexMissing: false };
}

export function getUsageIndexKey(media) {
  if (!media) return '';
  const isExternal = isIndexedExternalMediaEntry(media);
  if (isExternal) {
    return media.hash || '';
  }
  return media.url ? getDedupeKey(media.url) : (media.hash || '');
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

export function buildMediaIndexStructures(mediaData) {
  const uniqueItemsMap = new Map();
  const usageIndex = new Map();

  mediaData.forEach((item) => {
    const groupingKey = getUsageIndexKey(item);
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
