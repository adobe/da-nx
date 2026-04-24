import {
  loadIndexMeta,
  checkIndex,
} from './admin-api.js';
import {
  IndexConfig,
  IndexFiles,
} from '../core/constants.js';
import { normalizeSitePath } from '../core/paths.js';

function getIndexFolderPath(sitePath) {
  const normalized = normalizeSitePath(sitePath);
  const parts = normalized.split('/').filter(Boolean);

  // For /org/repo -> /org/repo/.da/media-insights
  // For /org/repo/subfolder -> /org/repo/subfolder/.da/media-insights
  if (parts.length < 2) return `/${IndexFiles.FOLDER}`;

  return `/${parts.join('/')}/${IndexFiles.FOLDER}`;
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
