/**
 * Worker-safe fetch utilities
 *
 * All functions accept runtime parameters (tokens, origins) instead of
 * relying on window, localStorage, or global state.
 */

// Counter for generating unique request IDs for token refresh messages
let tokenRefreshRequestId = 0;

/**
 * Request fresh site token from main thread (on 401/403)
 *
 * @returns {Promise<string|null>} Fresh site token or null if refresh failed
 */
function requestTokenRefresh() {
  return new Promise((resolve) => {
    const requestId = `token-refresh-${tokenRefreshRequestId}`;
    tokenRefreshRequestId += 1;

    let resolved = false;
    let timeoutId;

    const handler = (event) => {
      if (resolved) return;

      const { type, requestId: respId, token } = event.data;
      if (type === 'token-refresh-response' && respId === requestId) {
        resolved = true;
        self.removeEventListener('message', handler);
        clearTimeout(timeoutId);
        resolve(token || null);
      }
    };

    self.addEventListener('message', handler);

    timeoutId = setTimeout(() => {
      if (resolved) return;
      resolved = true;
      self.removeEventListener('message', handler);
      resolve(null);
    }, 5000);

    self.postMessage({ type: 'token-refresh', requestId });
  });
}

/**
 * Worker-safe CORS proxy fetch
 * Same as etcFetch but accepts daEtcOrigin as parameter
 *
 * @param {string} href - URL to fetch
 * @param {string} api - API endpoint (e.g., 'cors')
 * @param {string} daEtcOrigin - DA ETC origin (e.g., 'https://da-etc.adobeaem.workers.dev')
 * @param {object} options - Fetch options
 * @returns {Promise<Response>}
 */
export function etcFetch(href, api, daEtcOrigin, options) {
  const url = `${daEtcOrigin}/${api}?url=${encodeURIComponent(href)}`;
  const opts = options || {};
  return fetch(url, opts);
}

/**
 * Worker-safe DA fetch with injected IMS token
 * Equivalent to daFetch but accepts token as parameter
 *
 * @param {string} url - URL to fetch
 * @param {string} imsToken - IMS access token
 * @param {object} opts - Fetch options
 * @returns {Promise<Response>}
 */
export async function workerDaFetch(url, imsToken, opts = {}) {
  opts.headers ||= {};

  if (imsToken) {
    opts.headers.Authorization = `Bearer ${imsToken}`;

    // For admin.hlx.page URLs, add x-content-source-authorization header
    // This is required for writes and API access (matches daFetch.js:27-29)
    if (url.startsWith('https://admin.hlx.page')) {
      opts.headers['x-content-source-authorization'] = `Bearer ${imsToken}`;
    }
  }

  let resp;
  try {
    resp = await fetch(url, opts);
  } catch (err) {
    resp = new Response(null, { status: 500, statusText: err.message });
  }

  // Note: In worker context, we can't trigger sign-in on 401
  // Just return the response and let caller handle it
  resp.permissions = resp.headers.get('x-da-actions')?.split('=').pop().split(',');
  return resp;
}

/**
 * Worker-safe authenticated fetch
 * Equivalent to fetchWithAuth but accepts token as parameter
 *
 * @param {string} url - URL to fetch
 * @param {string} imsToken - IMS access token
 * @param {object} opts - Fetch options
 * @returns {Promise<Response>}
 */
export async function workerFetchWithAuth(url, imsToken, opts = {}) {
  opts.headers ||= {};

  if (imsToken) {
    opts.headers.Authorization = `Bearer ${imsToken}`;

    // For admin.hlx.page URLs, add x-content-source-authorization header
    // This is required for Status API, Audit log, Media log (matches daFetch.js:27-29)
    if (url.startsWith('https://admin.hlx.page')) {
      opts.headers['x-content-source-authorization'] = `Bearer ${imsToken}`;
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn('[workerFetchWithAuth] No imsToken provided for URL:', url);
  }

  return fetch(url, opts);
}

/**
 * Create sheet FormData for DA storage
 * Same as createSheet from admin-api.js
 *
 * @param {Array} data - Sheet data
 * @param {string} type - Sheet type (default: 'sheet')
 * @returns {FormData}
 */
export function createSheet(data, type = 'sheet') {
  const sheetMeta = {
    total: data.length,
    limit: data.length,
    offset: 0,
    data,
    ':type': type,
  };
  const blob = new Blob([JSON.stringify(sheetMeta, null, 2)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);
  return formData;
}

/**
 * Create multi-sheet FormData for DA storage
 * Same as createMultiSheet from admin-api.js
 *
 * @param {object} sheets - Object with sheet names as keys, data arrays as values
 * @returns {FormData}
 */
export function createMultiSheet(sheets) {
  const sheetNames = Object.keys(sheets);
  const multiSheetData = {
    ':version': 3,
    ':type': 'multi-sheet',
    ':names': sheetNames,
  };

  sheetNames.forEach((name) => {
    const data = sheets[name];
    multiSheetData[name] = {
      total: data.length,
      offset: 0,
      limit: data.length,
      data,
    };
  });

  const blob = new Blob([JSON.stringify(multiSheetData, null, 2)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);
  return formData;
}

/**
 * Load sheet from DA storage
 * Worker-safe version of loadSheet from admin-api.js
 *
 * @param {string} path - Path to sheet
 * @param {string} daOrigin - DA origin (e.g., 'https://admin.da.live')
 * @param {string} imsToken - IMS access token
 * @returns {Promise<Array>}
 */
export async function loadSheet(path, daOrigin, imsToken) {
  try {
    const resp = await workerDaFetch(`${daOrigin}/source${path}`, imsToken);

    if (resp.ok) {
      const data = await resp.json();
      return data.data || data || [];
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * Save sheet to DA storage
 * Worker-safe version of saveSheet from admin-api.js
 *
 * @param {Array} data - Sheet data
 * @param {string} path - Path to save to
 * @param {string} daOrigin - DA origin
 * @param {string} imsToken - IMS access token
 * @returns {Promise<Response>}
 */
export async function saveSheet(data, path, daOrigin, imsToken) {
  const formData = createSheet(data);
  return workerDaFetch(`${daOrigin}/source${path}`, imsToken, {
    method: 'PUT',
    body: formData,
  });
}

/**
 * Load sheet metadata from DA storage
 * Worker-safe version of loadSheetMeta from admin-api.js
 *
 * @param {string} path - Path to meta file
 * @param {string} daOrigin - DA origin
 * @param {string} imsToken - IMS access token
 * @returns {Promise<object|null>}
 */
export async function loadSheetMeta(path, daOrigin, imsToken) {
  try {
    const resp = await workerDaFetch(`${daOrigin}/source${path}`, imsToken);
    if (resp.ok) {
      const data = await resp.json();
      const metaData = data.data || data || null;
      if (Array.isArray(metaData) && metaData.length > 0) {
        return metaData[0];
      }
      return metaData;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Save sheet metadata to DA storage
 * Worker-safe version of saveSheetMeta from admin-api.js
 *
 * @param {object} meta - Metadata object
 * @param {string} path - Path to save to
 * @param {string} daOrigin - DA origin
 * @param {string} imsToken - IMS access token
 * @returns {Promise<Response>}
 */
export async function saveSheetMeta(meta, path, daOrigin, imsToken) {
  const metaArray = Array.isArray(meta) ? meta : [meta];
  const formData = createSheet(metaArray);

  return workerDaFetch(`${daOrigin}/source${path}`, imsToken, {
    method: 'PUT',
    body: formData,
  });
}

const DEFAULT_TIMEFRAME_DAYS = 3650; /* 10 years */

/**
 * Worker-safe version of timestampToDuration from admin-api.js
 * Converts timestamp to duration string (e.g., "7d", "3h")
 */
export function timestampToDuration(timestamp) {
  if (!timestamp) return `${DEFAULT_TIMEFRAME_DAYS}d`;

  const ageMs = Date.now() - timestamp;
  const days = Math.ceil(ageMs / (24 * 60 * 60 * 1000));

  if (days < 1) {
    const hours = Math.ceil(ageMs / (60 * 60 * 1000));
    return hours > 0 ? `${hours}h` : '1h';
  }

  return `${Math.min(days, DEFAULT_TIMEFRAME_DAYS)}d`;
}

/**
 * Fetch paginated data from admin.hlx.page endpoints
 * Worker-safe version of fetchPaginated from admin-api.js
 *
 * @param {string} endpoint - Endpoint name (e.g., 'log', 'medialog')
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} imsToken - IMS access token
 * @param {string} ref - Reference (default: 'main')
 * @param {number|null} since - Timestamp or null
 * @param {number} limit - Results per page
 * @param {function} onPageLoaded - Optional callback for each page
 * @returns {Promise<Array>}
 */
export async function fetchPaginated(
  endpoint,
  org,
  repo,
  imsToken,
  ref = 'main',
  since = null,
  limit = 1000,
  onPageLoaded = null,
) {
  const params = new URLSearchParams();
  params.append('limit', limit.toString());

  // Convert timestamp to duration string
  const sinceDuration = timestampToDuration(since);
  params.append('since', sinceDuration);

  const baseUrl = `https://admin.hlx.page/${endpoint}/${org}/${repo}/${ref}`;
  const separator = endpoint === 'medialog' ? '/' : '';
  const url = `${baseUrl}${separator}?${params.toString()}`;

  const resp = await workerFetchWithAuth(url, imsToken);

  if (!resp.ok) {
    throw new Error(`${endpoint} API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  let entries = data.entries || data.data || [];
  let { nextToken } = data;

  if (onPageLoaded && entries.length > 0) {
    onPageLoaded(entries, !!nextToken);
  }

  while (nextToken) {
    params.set('nextToken', nextToken);
    const nextUrl = `${baseUrl}${separator}?${params.toString()}`;

    const nextResp = await workerFetchWithAuth(nextUrl, imsToken);
    if (!nextResp.ok) break;

    const nextData = await nextResp.json();
    const nextEntries = nextData.entries || nextData.data || [];

    if (!nextEntries || nextEntries.length === 0) break;

    entries = entries.concat(nextEntries);
    nextToken = nextData.nextToken;

    if (onPageLoaded) {
      onPageLoaded(entries, !!nextToken);
    }
  }

  return entries;
}

/**
 * Build AEM page markdown URL
 * @param {string} pagePath - Page path
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} ref - Reference
 * @returns {string}
 */
function buildAemPageMarkdownUrl(pagePath, org, repo, ref = 'main') {
  let path = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
  const prefix = `/${org}/${repo}`;
  if (path.startsWith(`${prefix}/`) || path === prefix) {
    path = path === prefix ? '/' : path.slice(prefix.length);
  }
  if (path.endsWith('/')) path = `${path}index.md`;
  if (!path.endsWith('.md')) path = `${path}.md`;

  return `https://${ref}--${repo}--${org}.aem.page${path}`;
}

/**
 * Append no-cache parameter to URL
 * @param {string} url - URL to modify
 * @returns {string}
 */
function appendNoCacheParam(url) {
  const noCacheUrl = new URL(url);
  noCacheUrl.searchParams.set('nocache', Date.now().toString());
  return noCacheUrl.toString();
}

/**
 * Fetch markdown from .aem.page using CORS proxy
 * Worker-safe version of fetchPageMarkdown from admin-api.js
 *
 * @param {string} pagePath - Page path
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} daEtcOrigin - DA ETC origin for CORS proxy
 * @param {string} ref - Reference (default: 'main')
 * @param {string|null} siteToken - Optional site token for protected sites
 * @returns {Promise<object>} { markdown, status, reason }
 */
export async function fetchPageMarkdown(
  pagePath,
  org,
  repo,
  daEtcOrigin,
  ref = 'main',
  siteToken = null,
) {
  try {
    const pageUrl = buildAemPageMarkdownUrl(pagePath, org, repo, ref);
    const headers = {};

    if (siteToken) {
      headers.Authorization = `token ${siteToken}`;
    }

    const opts = Object.keys(headers).length > 0 ? { headers } : {};
    const resp = await etcFetch(appendNoCacheParam(pageUrl), 'cors', daEtcOrigin, opts);

    if (resp.ok) {
      const text = await resp.text();

      // Detect HTML response instead of markdown
      const trimmed = text.trim();
      const isHtml = trimmed.startsWith('<!DOCTYPE')
                     || trimmed.startsWith('<html')
                     || trimmed.startsWith('<HTML');

      if (isHtml) {
        return { markdown: null, html: text, status: resp.status };
      }

      return { markdown: text, status: resp.status };
    }

    // Retry on 401/403 with fresh token (protected sites)
    // Main thread clears cache and refetches, so even if token value is same, retry is valid
    if ((resp.status === 401 || resp.status === 403) && siteToken) {
      const freshToken = await requestTokenRefresh();
      if (freshToken) {
        // Retry with fresh token (even if same value - cache was cleared on main thread)
        const retryHeaders = { Authorization: `token ${freshToken}` };
        const retryOpts = { headers: retryHeaders };
        const retryResp = await etcFetch(appendNoCacheParam(pageUrl), 'cors', daEtcOrigin, retryOpts);

        if (retryResp.ok) {
          const text = await retryResp.text();
          const trimmed = text.trim();
          const isHtml = trimmed.startsWith('<!DOCTYPE')
                         || trimmed.startsWith('<html')
                         || trimmed.startsWith('<HTML');

          if (isHtml) {
            return { markdown: null, html: text, status: retryResp.status };
          }

          return { markdown: text, status: retryResp.status };
        }

        return { markdown: null, status: retryResp.status, reason: `HTTP ${retryResp.status} (after token refresh)` };
      }
    }

    return { markdown: null, status: resp.status, reason: `HTTP ${resp.status}` };
  } catch (err) {
    return { markdown: null, status: 0, reason: err?.message || 'Unknown error' };
  }
}

/**
 * Create bulk status job
 * Worker-safe version of createBulkStatusJob from admin-api.js
 *
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} ref - Reference
 * @param {string} imsToken - IMS access token
 * @param {string|null} contentPath - Content path filter (optional)
 * @param {object} options - Options { paths, pathsOnly }
 * @returns {Promise<object>} { jobId, jobUrl }
 */
export async function createBulkStatusJob(
  org,
  repo,
  ref,
  imsToken,
  contentPath = null,
  options = {},
) {
  const url = `https://admin.hlx.page/status/${org}/${repo}/${ref}/*`;
  let paths;

  if (options.paths && options.paths.length > 0) {
    paths = options.paths;
  } else {
    const normalizedPath = contentPath && contentPath.trim()
      ? contentPath.replace(/\/+$/, '').replace(/^(?!\/)/, '/')
      : null;
    paths = normalizedPath ? [normalizedPath, `${normalizedPath}/*`] : ['/*'];
  }

  const payload = {
    paths,
    select: ['preview'],
  };

  if (options.pathsOnly) {
    payload.pathsOnly = true;
  }

  const resp = await workerFetchWithAuth(url, imsToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text();
    const err = new Error(`Failed to create bulk status job: ${resp.status} - ${text}`);
    err.status = resp.status;
    throw err;
  }

  const data = await resp.json();

  if (!data.job || data.job.state !== 'created') {
    throw new Error('Bulk status job creation failed or returned unexpected state');
  }

  return {
    jobId: data.job.name,
    jobUrl: data.links?.self,
  };
}

/**
 * Poll status job until complete
 * Worker-safe version of pollStatusJob from admin-api.js
 *
 * @param {string} jobUrl - Job URL from createBulkStatusJob
 * @param {string} imsToken - IMS access token
 * @param {number} pollInterval - Poll interval in ms (default: 1000)
 * @param {function} onProgress - Optional progress callback
 * @param {number} maxDurationMs - Max duration before timeout (0 = no timeout)
 * @returns {Promise<string>} Final job state
 */
export async function pollStatusJob(
  jobUrl,
  imsToken,
  pollInterval = 1000,
  onProgress = null,
  maxDurationMs = 0,
) {
  const startedAt = Date.now();
  const TERMINAL_SUCCESS = ['completed', 'stopped'];
  const TERMINAL_FAILURE = ['failed', 'error', 'cancelled'];

  const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resp = await workerFetchWithAuth(jobUrl, imsToken);

    if (!resp.ok) {
      const err = new Error(`Failed to fetch job status: ${resp.status}`);
      err.status = resp.status;
      throw err;
    }

    const data = await resp.json();
    const { state, progress, error, cancelled } = data;

    if (onProgress && progress) {
      onProgress(progress);
    }

    // Check for terminal states
    if (TERMINAL_SUCCESS.includes(state)) {
      if (state === 'stopped' && (error || cancelled)) {
        throw new Error(error || 'Bulk status job was cancelled');
      }
      return state;
    }

    if (TERMINAL_FAILURE.includes(state)) {
      throw new Error(`Bulk status job ended with state: ${state}`);
    }

    if (maxDurationMs > 0 && Date.now() - startedAt >= maxDurationMs) {
      throw new Error(`Bulk status job polling timed out after ${Math.round(maxDurationMs / 60000)} minutes`);
    }

    // Wait before next poll
    // eslint-disable-next-line no-await-in-loop
    await delay(pollInterval);
  }
}

/**
 * Get status job details
 * Worker-safe version of getStatusJobDetailsRaw from admin-api.js
 *
 * @param {string} jobUrl - Job URL
 * @param {string} imsToken - IMS access token
 * @returns {Promise<object>}
 */
export async function getStatusJobDetails(jobUrl, imsToken) {
  const detailsUrl = `${jobUrl}/details`;
  const resp = await workerFetchWithAuth(detailsUrl, imsToken);

  if (!resp.ok) {
    const err = new Error(`Failed to fetch job details: ${resp.status}`);
    err.status = resp.status;
    throw err;
  }

  return resp.json();
}

/**
 * Worker-safe version of streamLog from admin-api.js
 * Streams auditlog or medialog with pagination support
 *
 * @param {string} endpoint - 'log' for auditlog or 'medialog' for medialog
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} ref - Reference (branch)
 * @param {number|null} since - Timestamp (ms) or null for default timeframe
 * @param {number} limit - Page size
 * @param {Function} onChunk - Callback for each chunk of entries
 * @param {string} imsToken - IMS access token
 * @param {object} options - { fullHistory: boolean }
 */
export async function streamLog(
  endpoint,
  org,
  repo,
  ref,
  since,
  limit,
  onChunk,
  imsToken,
  options = {},
) {
  const fetchParams = new URLSearchParams();
  fetchParams.append('limit', limit.toString());

  if (options.fullHistory) {
    fetchParams.append('from', '2015-01-01T00:00:00.000Z');
    fetchParams.append('to', new Date().toISOString());
  } else if (since != null && typeof since === 'number') {
    const fromIso = new Date(since).toISOString();
    const toIso = new Date().toISOString();
    fetchParams.append('from', fromIso);
    fetchParams.append('to', toIso);
  } else {
    const sinceDuration = since != null ? timestampToDuration(since) : `${DEFAULT_TIMEFRAME_DAYS}d`;
    fetchParams.append('since', sinceDuration);
  }

  const baseUrl = `https://admin.hlx.page/${endpoint}/${org}/${repo}/${ref}`;
  const separator = endpoint === 'medialog' ? '/' : '';
  let nextUrl = `${baseUrl}${separator}?${fetchParams.toString()}`;

  while (nextUrl) {
    const resp = await workerFetchWithAuth(nextUrl, imsToken);

    if (!resp.ok) {
      if (resp.status === 403) {
        throw new Error(`403 Forbidden: ${endpoint} access denied for ${nextUrl}`);
      }
      if (resp.status === 401) {
        throw new Error(`401 Unauthorized: IMS token expired for ${nextUrl}`);
      }
      throw new Error(`${endpoint} API error: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    const entries = data.entries || data.data || [];

    if (entries.length > 0 && onChunk) {
      await onChunk(entries);
    }

    const nextLink = data.links?.next;
    const token = data.nextToken;

    if (nextLink && typeof nextLink === 'string' && nextLink.trim()) {
      const base = `${baseUrl}${separator}`;
      nextUrl = nextLink.startsWith('http') ? nextLink : new URL(nextLink, base).href;
    } else if (token) {
      fetchParams.set('nextToken', token);
      nextUrl = `${baseUrl}${separator}?${fetchParams.toString()}`;
    } else {
      nextUrl = null;
    }
  }
}

/**
 * Get chunk filename for given index
 */
function getChunkFileName(chunkNum, indexFilesChunkPrefix) {
  return `${indexFilesChunkPrefix}${String(chunkNum).padStart(3, '0')}.json`;
}

/**
 * Split media sheet into chunks
 */
function chunkMediaSheet(mediaData, chunkSize) {
  const chunks = [];
  for (let i = 0; i < mediaData.length; i += chunkSize) {
    chunks.push(mediaData.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Worker-safe version of saveIndexChunks from admin-api.js
 *
 * @param {string} basePath - Base path for chunks (e.g., /org/repo/.da/media-insights)
 * @param {Array} mediaData - Media sheet data
 * @param {Array} usageData - Usage sheet data
 * @param {number} chunkSize - Entries per chunk
 * @param {string} daOrigin - DA origin (e.g., https://admin.da.live)
 * @param {string} imsToken - IMS access token
 * @param {string} indexFilesChunkPrefix - Chunk filename prefix (e.g., 'index-')
 * @returns {Promise<number>} Number of chunks saved
 */
export async function saveIndexChunks(
  basePath,
  mediaData,
  usageData,
  chunkSize,
  daOrigin,
  imsToken,
  indexFilesChunkPrefix,
) {
  const mediaChunks = chunkMediaSheet(mediaData, chunkSize);

  // Always save at least chunk 0, even if empty (for consistency)
  const chunksToSave = mediaChunks.length > 0 ? mediaChunks : [[]];
  const savePromises = [];

  for (let i = 0; i < chunksToSave.length; i += 1) {
    const chunkFileName = getChunkFileName(i, indexFilesChunkPrefix);
    const chunkPath = `${basePath}/${chunkFileName}`;

    // Only include usage sheet in first chunk to avoid duplication
    const sheets = {
      media: chunksToSave[i],
      usage: i === 0 ? usageData : [],
    };

    const formData = await createMultiSheet(sheets);
    const savePromise = workerDaFetch(`${daOrigin}/source${chunkPath}`, imsToken, {
      method: 'PUT',
      body: formData,
    });

    savePromises.push(savePromise);
  }

  const responses = await Promise.all(savePromises);

  // Validate all chunks saved successfully
  const failedChunks = [];
  responses.forEach((resp, i) => {
    if (!resp.ok) {
      failedChunks.push(i);
    }
  });

  if (failedChunks.length > 0) {
    throw new Error(`Failed to save chunks: ${failedChunks.join(', ')}`);
  }

  return chunksToSave.length;
}

/**
 * Worker-safe version of saveIndexMeta from admin-api.js
 *
 * @param {object} meta - Metadata object
 * @param {string} path - Full path to meta file
 * @param {string} daOrigin - DA origin (e.g., https://admin.da.live)
 * @param {string} imsToken - IMS access token
 * @returns {Promise<Response>}
 */
export async function saveIndexMeta(meta, path, daOrigin, imsToken) {
  const formData = await createSheet([meta]);
  return workerDaFetch(`${daOrigin}/source${path}`, imsToken, {
    method: 'POST',
    body: formData,
  });
}

/**
 * Worker-safe version of loadMultiSheet from admin-api.js
 *
 * @param {string} path - Full path to multi-sheet file
 * @param {string} sheetName - Sheet name to load
 * @param {string} daOrigin - DA origin (e.g., https://admin.da.live)
 * @param {string} imsToken - IMS access token
 * @param {object} options - Options { allowMissing: boolean }
 * @returns {Promise<Array>} Sheet data array
 */
export async function loadMultiSheet(path, sheetName, daOrigin, imsToken, options = {}) {
  const { allowMissing = false } = options;

  try {
    const resp = await workerDaFetch(`${daOrigin}/source${path}`, imsToken);

    if (resp.ok) {
      const data = await resp.json();

      // Validate sheet key exists in the response
      if (!(sheetName in data)) {
        throw new Error(`Sheet "${sheetName}" missing from ${path} (found: ${Object.keys(data).join(', ')})`);
      }

      const sheetData = data[sheetName]?.data;

      // Validate sheet.data exists (even if empty array)
      if (!Array.isArray(sheetData)) {
        throw new Error(`Sheet "${sheetName}" in ${path} has invalid data (expected array, got ${typeof sheetData})`);
      }

      return sheetData;
    }

    if (resp.status === 404 && allowMissing) {
      return [];
    }

    throw new Error(`Failed to load sheet from ${path}: HTTP ${resp.status}`);
  } catch (error) {
    if (allowMissing && error.message?.includes('404')) {
      return [];
    }
    throw error;
  }
}

/**
 * Worker-safe version of loadIndexChunks from admin-api.js
 *
 * @param {string} basePath - Base path for chunks
 * @param {number} chunkCount - Number of chunks
 * @param {string} sheetName - Sheet name to load
 * @param {string} daOrigin - DA origin (e.g., https://admin.da.live)
 * @param {string} imsToken - IMS access token
 * @param {Function} onProgressiveChunk - Optional progressive callback
 * @param {string} indexFilesChunkPrefix - Chunk file prefix (default: 'index-')
 * @returns {Promise<Array>} Flattened array of all sheet data
 */
export async function loadIndexChunks(basePath, chunkCount, sheetName, daOrigin, imsToken, onProgressiveChunk, indexFilesChunkPrefix = 'index-') {
  // If progressive callback provided, load chunk 0 first for immediate display
  if (onProgressiveChunk && chunkCount > 0) {
    const chunk0Path = `${basePath}/${getChunkFileName(0, indexFilesChunkPrefix)}`;
    const chunk0Data = await loadMultiSheet(chunk0Path, sheetName, daOrigin, imsToken);

    // Show chunk 0 immediately
    onProgressiveChunk(chunk0Data, 0, chunkCount);

    // Load remaining chunks in background
    if (chunkCount > 1) {
      const remainingPromises = [];
      for (let i = 1; i < chunkCount; i += 1) {
        const chunkFileName = getChunkFileName(i, indexFilesChunkPrefix);
        const chunkPath = `${basePath}/${chunkFileName}`;
        remainingPromises.push(
          loadMultiSheet(chunkPath, sheetName, daOrigin, imsToken)
            .then((data) => {
              // Progressive update for each chunk
              onProgressiveChunk(data, i, chunkCount);
              return { success: true, chunk: i, data, count: data.length };
            })
            .catch((error) => ({ success: false, chunk: i, error: error.message, count: 0 })),
        );
      }

      const remainingResults = await Promise.all(remainingPromises);
      const failures = remainingResults.filter((r) => !r.success);

      if (failures.length > 0) {
        const failedChunks = failures.map((f) => `chunk ${f.chunk}: ${f.error}`).join(', ');
        throw new Error(`Failed to load ${failures.length}/${chunkCount - 1} chunks (${failedChunks})`);
      }

      return [chunk0Data, ...remainingResults.map((r) => r.data)].flat();
    }

    return chunk0Data;
  }

  // Fallback: Load all chunks in parallel (no progressive loading)
  const chunkPromises = [];
  for (let i = 0; i < chunkCount; i += 1) {
    const chunkFileName = getChunkFileName(i, indexFilesChunkPrefix);
    const chunkPath = `${basePath}/${chunkFileName}`;
    chunkPromises.push(
      loadMultiSheet(chunkPath, sheetName, daOrigin, imsToken)
        .then((data) => ({ success: true, chunk: i, data, count: data.length }))
        .catch((error) => ({ success: false, chunk: i, error: error.message, count: 0 })),
    );
  }

  const results = await Promise.all(chunkPromises);
  const failures = results.filter((r) => !r.success);

  if (failures.length > 0) {
    const failedChunks = failures.map((f) => `chunk ${f.chunk}: ${f.error}`).join(', ');
    throw new Error(`Failed to load ${failures.length}/${chunkCount} chunks (${failedChunks})`);
  }

  return results.map((r) => r.data).flat();
}
