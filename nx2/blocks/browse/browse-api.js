import { daFetch, DA_ORIGIN } from '../../utils/daFetch.js';

/**
 * @param {string} fullpath
 * @returns {Promise<
 *   | { items: unknown[]; permissions?: unknown }
 *   | { error: string; status: number }
 * >}
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
    const items = Array.isArray(payload) ? payload : payload?.items ?? [];
    return { items, permissions: response.permissions };
  } catch {
    return { error: 'Invalid response body', status: response.status };
  }
}
