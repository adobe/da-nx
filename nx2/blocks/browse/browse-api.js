import { daFetch, DA_ORIGIN, AEM_ORIGIN } from '../../utils/daFetch.js';
import { parseRepoPath } from './utils.js';

/**
 * Folder listing for the given fullpath.
 * @param {string} fullpath
 * @returns {Promise<unknown[] | { error: string; status: number }>}
 */
export async function listFolder(fullpath) {
  let response;
  try {
    response = await daFetch(`${DA_ORIGIN}/list${fullpath}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List request failed';
    return { error: message, status: 0 };
  }
  if (!response.ok) {
    return { error: `List failed: ${response.status}`, status: response.status };
  }
  try {
    const payload = await response.json();
    if (!Array.isArray(payload)) {
      return { error: 'Invalid list response', status: response.status };
    }
    return payload;
  } catch {
    return { error: 'Invalid response body', status: response.status };
  }
}

/**
 * GET status JSON for one repository path, or null if skipped or failed.
 * @param {string} resourcePath
 * @returns {Promise<object | null>}
 */
export async function fetchResourceStatus(resourcePath) {
  try {
    const parsed = parseRepoPath(resourcePath);
    if (!parsed?.contentPath) return null;
    const { org, site, contentPath } = parsed;
    const url = `${AEM_ORIGIN}/status/${org}/${site}/main/${contentPath}`;
    const response = await daFetch(url);
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}
