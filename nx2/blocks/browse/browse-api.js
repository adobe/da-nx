import { daFetch, DA_ORIGIN } from '../../utils/daFetch.js';

export async function listFolder(fullpath) {
  const response = await daFetch(`${DA_ORIGIN}/list${fullpath}`);
  if (!response.ok) {
    throw new Error(`List failed: ${response.status}`);
  }
  const payload = await response.json();
  const items = Array.isArray(payload) ? payload : payload?.items ?? [];
  return { items, permissions: response.permissions };
}
