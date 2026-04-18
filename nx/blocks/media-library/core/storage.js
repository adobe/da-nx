import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { IndexFiles } from './constants.js';

/**
 * Get the media library path for a site
 * @param {string} sitePath - Site path (e.g., '/org/repo')
 * @returns {string} Media library path
 */
export function getMediaLibraryPath(sitePath) {
  return `${sitePath}/${IndexFiles.FOLDER}`;
}

/**
 * Load index metadata file
 * @param {string} sitePath - Site path
 * @returns {Promise<Object|null>} Metadata object or null if not found
 */
export async function loadIndexMetadata(sitePath) {
  try {
    const path = `${getMediaLibraryPath(sitePath)}/${IndexFiles.MEDIA_INDEX_META}`;
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * Load a specific index chunk
 * @param {string} sitePath - Site path
 * @param {number} chunkIndex - Chunk index number
 * @returns {Promise<Array>} Array of media entries or empty array if not found
 */
export async function loadIndexChunk(sitePath, chunkIndex) {
  try {
    const path = `${getMediaLibraryPath(sitePath)}/${IndexFiles.MEDIA_INDEX_CHUNK_PREFIX}${chunkIndex}.json`;
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (!resp.ok) return [];
    return await resp.json();
  } catch {
    return [];
  }
}

/**
 * Write index chunk to DA storage
 * @param {string} sitePath - Site path
 * @param {number} chunkIndex - Chunk index number
 * @param {Array} data - Array of media entries
 * @returns {Promise<boolean>} True if write succeeded, false otherwise
 */
export async function writeIndexChunk(sitePath, chunkIndex, data) {
  try {
    const path = `${getMediaLibraryPath(sitePath)}/${IndexFiles.MEDIA_INDEX_CHUNK_PREFIX}${chunkIndex}.json`;
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return resp.ok;
  } catch {
    return false;
  }
}
