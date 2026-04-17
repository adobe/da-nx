import { daFetch, DA_ORIGIN, AEM_ORIGIN } from '../../utils/daFetch.js';

/**
 * Folder listing for the given fullpath.
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

/**
 * Splits an absolute path into owner, repo, and content path (lowercased), or null.
 * @param {string} path
 * @returns {{ owner: string, repo: string, contentPath: string } | null}
 */
function parseRepositoryPath(path) {
  const trimmed = (path || '').trim();
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const parts = normalized.slice(1).toLowerCase().split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo, ...rest] = parts;
  return { owner, repo, contentPath: rest.join('/') };
}

/**
 * Absolute repo path from item path or folder plus item name.
 * @param {object} item
 * @param {string} folderFullpath
 * @returns {string | null}
 */
export function itemToRepositoryPath(item, folderFullpath) {
  const fromApi = (item.path || '').replace(/^\/+/, '').trim();
  if (fromApi) return `/${fromApi}`.replace(/\/+/g, '/');
  const folder = (folderFullpath || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const name = (item.name || '').trim();
  if (!folder || !name) return null;
  return `/${folder}/${name}`.replace(/\/+/g, '/');
}

/**
 * GET status JSON for one repository path, or null if skipped or failed.
 * @param {string} repositoryPath
 * @param {string} [statusOrigin]
 * @returns {Promise<object | null>}
 */
export async function fetchResourceStatus(repositoryPath, statusOrigin = AEM_ORIGIN) {
  try {
    const parsed = parseRepositoryPath(repositoryPath);
    if (!parsed?.contentPath) return null;
    const { owner, repo, contentPath } = parsed;
    const url = `${statusOrigin}/status/${owner}/${repo}/main/${contentPath}`;
    const response = await daFetch(url);
    if (!response.ok) return null;
    return await response.json().catch(() => null);
  } catch {
    return null;
  }
}

/**
 * Clones items and merges status onto file rows (parallel batches, default concurrency 6).
 * @param {object[]} items
 * @param {string} folderFullpath
 * @param {{ statusOrigin?: string, concurrency?: number }} [opts]
 * @returns {Promise<object[]>}
 */
export async function fetchResourceStatusForItems(items, folderFullpath, opts = {}) {
  const { statusOrigin = AEM_ORIGIN, concurrency = 6 } = opts;
  const out = items.map((item) => ({ ...item }));
  const indices = out
    .map((item, i) => (item.ext && itemToRepositoryPath(item, folderFullpath) ? i : -1))
    .filter((i) => i >= 0);

  for (let i = 0; i < indices.length; i += concurrency) {
    const batch = indices.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (rowIndex) => {
        try {
          const item = out[rowIndex];
          const path = itemToRepositoryPath(item, folderFullpath);
          const json = await fetchResourceStatus(path, statusOrigin);
          if (!json) return;

          const { preview, live, profile } = json;

          const extra = {
            previewOk: Number(preview?.status) === 200,
            liveOk: Number(live?.status) === 200,
          };
          if (preview?.lastModified) {
            extra.previewLastModified = String(preview.lastModified);
          }
          if (live?.lastModified) {
            extra.liveLastModified = String(live.lastModified);
          }
          if (profile?.email) extra.profileEmail = String(profile.email).trim();

          const displayName = profile?.displayName || profile?.name
            || [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
          if (displayName) extra.profileDisplayName = displayName;

          out[rowIndex] = { ...item, ...extra };
        } catch {
          /* one bad row or network glitch must not drop the whole batch */
        }
      }),
    );
  }
  return out;
}
