/**
 * DA admin list and AEM preview/publish helpers for the content browser.
 * DA admin base URL matches canvas file-browser: `DA_ORIGIN` from shared constants
 * (env from `da-admin` query/localStorage and da.page vs da.live).
 */

import { DA_ORIGIN } from '../../../../public/utils/constants.js';

const DEFAULT_AEM_ORIGIN = 'https://admin.hlx.page';

/**
 * Parses a `#/org/site/...` hash into path segments and fullpath for the DA list API.
 * @param {string} locationHash - Same shape as `location.hash` (may include `#`).
 * @returns {{ pathSegments: string[], fullpath: string } | null}
 */
export function parseHashToPathContext(locationHash) {
  const withoutHash = (locationHash || '').replace(/^#\/?/, '').trim();
  if (!withoutHash) return null;
  const pathSegments = withoutHash.split('/').filter(Boolean);
  if (pathSegments.length < 2) return null;
  const fullpath = `/${pathSegments.join('/')}`;
  return { pathSegments, fullpath };
}

/**
 * Returns a function that loads folder contents from DA admin `/list`.
 * @param {object} options
 * @param {typeof import('../../../../utils/daFetch.js').daFetch} options.daFetch
 * @param {string} [options.daOrigin]
 * @returns {(fullpath: string) => Promise<
 *   object[] | { items: object[], permissions?: string[] }>}
 *   Default factory returns `{ items, permissions }` (see `sl-browse-folder`).
 */
export function createListFetcher({ daFetch, daOrigin = DA_ORIGIN }) {
  /**
   * Fetches the JSON list payload for one folder path.
   * @param {string} fullpath - Absolute folder path (e.g. `/org/site/subfolder`).
   */
  return async function listFolder(fullpath) {
    const requestUrl = `${daOrigin}/list${fullpath}`;
    const response = await daFetch(requestUrl);
    if (!response.ok) {
      throw new Error(`List failed: ${response.status}`);
    }
    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : payload?.items ?? [];
    return { items, permissions: response.permissions };
  };
}

/**
 * PUT to DA admin `/source{path}` (create/update resource). Same contract as legacy `saveToDa`.
 * @param {object} options
 * @param {typeof import('../../../../utils/daFetch.js').daFetch} options.daFetch
 * @param {string} [options.daOrigin]
 * @returns {(daPath: string, formData?: FormData) => Promise<
 *   { ok: boolean, error?: string, status?: number }>}
 */
export function createSaveToSource({ daFetch, daOrigin = DA_ORIGIN }) {
  return async function saveToSource(daPath, formData) {
    const normalized = daPath.startsWith('/') ? daPath : `/${daPath}`;
    /** @type {RequestInit} */
    const opts = { method: 'PUT' };
    if (formData && [...formData.keys()].length > 0) {
      opts.body = formData;
    }
    const response = await daFetch(`${daOrigin}/source${normalized}`, opts);
    if (!response.ok) {
      const errorMessage = response.headers.get('x-error') || response.statusText || 'Save failed';
      return { ok: false, status: response.status, error: errorMessage };
    }
    return { ok: true };
  };
}

/**
 * Returns a function that deletes a resource via DA admin `DELETE /source{path}`.
 * @param {object} options
 * @param {typeof import('../../../../utils/daFetch.js').daFetch} options.daFetch
 * @param {string} [options.daOrigin]
 * @returns {(fullpath: string) => Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export function createDeleteItem({ daFetch, daOrigin = DA_ORIGIN }) {
  /**
   * Deletes the item at the given DA path.
   * @param {string} fullpath - Absolute path to the file or folder.
   */
  return async function deleteItem(fullpath) {
    const normalizedPath = fullpath.startsWith('/') ? fullpath : `/${fullpath}`;
    const requestUrl = `${daOrigin}/source${normalizedPath}`;
    try {
      const response = await daFetch(requestUrl, { method: 'DELETE' });
      if (!response.ok) {
        const errorMessage = response.headers.get('x-error') || response.statusText || 'Delete failed';
        return { ok: false, status: response.status, error: errorMessage };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Delete failed' };
    }
  };
}

/**
 * Returns a function that renames or moves an item via DA admin `POST /move/{source}`.
 * @param {object} options
 * @param {typeof import('../../../../utils/daFetch.js').daFetch} options.daFetch
 * @param {string} [options.daOrigin]
 * @returns Rename function; resolves to `{ ok, status?, error? }`.
 */
export function createRenameItem({ daFetch, daOrigin = DA_ORIGIN }) {
  /**
   * Moves `sourceDaPath` to `destinationDaPath` (multipart `destination` field).
   * @param {string} sourceDaPath - Current DA path (leading `/` stripped for the move URL).
   * @param {string} destinationDaPath - Target absolute path.
   */
  return async function renameItem(sourceDaPath, destinationDaPath) {
    const sourceSegments = (sourceDaPath || '').replace(/^\/+/, '');
    if (!sourceSegments) return { ok: false, error: 'Missing source path' };
    let destinationPath = (destinationDaPath || '').trim();
    if (!destinationPath) return { ok: false, error: 'Missing destination' };
    if (!destinationPath.startsWith('/')) destinationPath = `/${destinationPath}`;
    const encodedSourcePath = sourceSegments
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const requestUrl = `${daOrigin}/move/${encodedSourcePath}`;
    const formData = new FormData();
    formData.append('destination', destinationPath);
    try {
      const response = await daFetch(requestUrl, { method: 'POST', body: formData });
      if (!response.ok) {
        const errorMessage = response.headers.get('x-error') || response.statusText || 'Rename failed';
        return { ok: false, status: response.status, error: errorMessage };
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Rename failed' };
    }
  };
}

/**
 * Splits a DA admin path into owner, repo, and the remainder for AEM status URLs.
 * @param {string} path - `/owner/repo/path/to/resource` (no host).
 * @returns {{ owner: string, repo: string, aemPath: string } | null}
 */
export function parseAemAdminPath(path) {
  const trimmed = (path || '').trim();
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const splitSegments = normalized.slice(1).toLowerCase().split('/').filter(Boolean);
  const [owner, repo, ...restSegments] = splitSegments;
  if (!owner || !repo) return null;
  return { owner, repo, aemPath: restSegments.join('/') };
}

/**
 * GETs AEM admin resource status (preview/live metadata, profile, links).
 * @param {string} path - `/org/site/path/to/file.ext`
 * @param {object} options
 * @param {() => Promise<{ accessToken?: { token?: string } } | null>} options.getIms
 * @param {string} [options.aemOrigin]
 * @returns {Promise<object | null>}
 */
export async function fetchAemResourceStatus(path, { getIms, aemOrigin = DEFAULT_AEM_ORIGIN }) {
  const parsed = parseAemAdminPath(path);
  if (!parsed || !parsed.aemPath) return null;
  const { owner, repo, aemPath } = parsed;
  const requestUrl = `${aemOrigin}/status/${owner}/${repo}/main/${aemPath}`;
  const ims = await getIms();
  const bearerToken = ims?.accessToken?.token ? `Bearer ${ims.accessToken.token}` : '';
  const response = await fetch(requestUrl, {
    method: 'GET',
    headers: {
      accept: '*/*',
      ...(bearerToken
        ? { Authorization: bearerToken, 'x-content-source-authorization': bearerToken }
        : {}),
    },
  });
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Builds the `/owner/site/...` admin path for a list row using API path or folder + name.
 * @param {{ name?: string, path?: string, ext?: string }} listItem
 * @param {string} folderFullpath - Parent folder from list context (`/org/site` or deeper).
 * @returns {string | null}
 */
export function daItemToAdminPath(listItem, folderFullpath) {
  const pathFromApi = (listItem?.path || '').replace(/^\/+/, '').trim();
  if (pathFromApi) return `/${pathFromApi}`.replace(/\/+/g, '/');
  const folderNormalized = (folderFullpath || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const itemName = (listItem?.name || '').trim();
  if (!folderNormalized || !itemName) return null;
  return `/${folderNormalized}/${itemName}`.replace(/\/+/g, '/');
}

/**
 * Enriches file rows with AEM preview/live flags and dates (bounded parallel GETs).
 * @param {Array<object>} items
 * @param {string} folderFullpath
 * @param {object} options
 * @param {() => Promise<{ accessToken?: { token?: string } } | null>} options.getIms
 * @param {string} [options.aemOrigin]
 * @param {number} [options.concurrency=6]
 */
export async function enrichListItemsWithAemStatus(items, folderFullpath, options = {}) {
  const { getIms, aemOrigin = DEFAULT_AEM_ORIGIN, concurrency = 6 } = options;
  if (!getIms || items.length === 0) return items;

  const enrichedItems = items.map((item) => ({ ...item }));
  const fileRowIndices = [];
  enrichedItems.forEach((item, index) => {
    if (!item.ext) return;
    if (!daItemToAdminPath(item, folderFullpath)) return;
    fileRowIndices.push(index);
  });

  for (let batchStart = 0; batchStart < fileRowIndices.length; batchStart += concurrency) {
    const indexBatch = fileRowIndices.slice(batchStart, batchStart + concurrency);
    await Promise.all(
      indexBatch.map(async (rowIndex) => {
        const item = enrichedItems[rowIndex];
        const daAdminPath = daItemToAdminPath(item, folderFullpath);
        if (!daAdminPath) return;
        const statusPayload = await fetchAemResourceStatus(daAdminPath, { getIms, aemOrigin });
        if (!statusPayload) return;
        const { preview: previewBlock, live: liveBlock, profile } = statusPayload;
        /** @type {Record<string, string | boolean>} */
        const aemFields = {
          aemPreviewOk: Number(previewBlock?.status) === 200,
          aemLiveOk: Number(liveBlock?.status) === 200,
        };
        const previewSourceModified = previewBlock?.sourceLastModified;
        if (previewSourceModified) {
          aemFields.aemPreviewSourceLastModified = String(previewSourceModified).trim();
        }
        const previewLastModified = previewBlock?.lastModified;
        if (previewLastModified) {
          aemFields.aemPreviewLastModified = String(previewLastModified).trim();
        }
        const liveLastModified = liveBlock?.lastModified;
        if (liveLastModified) {
          aemFields.aemLiveLastModified = String(liveLastModified).trim();
        }
        const profileEmail = profile?.email;
        if (profileEmail) {
          aemFields.aemProfileEmail = String(profileEmail).trim();
        }
        enrichedItems[rowIndex] = { ...item, ...aemFields };
      }),
    );
  }

  return enrichedItems;
}

/**
 * POSTs to AEM admin to preview or publish a resource.
 * @param {string} path - Full pathname e.g. `/org/site/path/to/page`
 * @param {'preview'|'live'} action
 * @param {object} options
 * @param {() => Promise<{ accessToken?: { token?: string } } | null>} options.getIms
 * @param {string} [options.aemOrigin]
 * @returns {Promise<{ preview?: { url: string }, live?: { url: string }, error?: object }>}
 */
export async function saveToAem(path, action, { getIms, aemOrigin = DEFAULT_AEM_ORIGIN }) {
  const [owner, repo, ...resourceSegments] = path.slice(1).toLowerCase().split('/');
  const aemPath = resourceSegments.join('/');
  const requestUrl = `${aemOrigin}/${action}/${owner}/${repo}/main/${aemPath}`;
  const ims = await getIms();
  const bearerToken = ims?.accessToken?.token ? `Bearer ${ims.accessToken.token}` : '';
  const response = await fetch(requestUrl, {
    method: 'POST',
    headers: {
      ...(bearerToken
        ? { Authorization: bearerToken, 'x-content-source-authorization': bearerToken }
        : {}),
    },
  });
  if (!response.ok) {
    const headerError = response.headers.get('x-error');
    return { error: { status: response.status, message: headerError || response.statusText } };
  }
  return response.json();
}

export { DA_ORIGIN as DEFAULT_DA_ORIGIN, DEFAULT_AEM_ORIGIN };
