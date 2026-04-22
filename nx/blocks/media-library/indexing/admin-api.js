import { daFetch, initIms } from '../../../utils/daFetch.js';
import { etcFetch } from '../core/urls.js';
import {
  IndexFiles,
  ExternalMedia,
  DA_ETC_ORIGIN,
  AEM_ORIGIN,
  DA_ORIGIN,
} from '../core/constants.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { isPerfEnabled } from '../core/params.js';
import { t } from '../core/messages.js';

const AEM_PAGE_MARKDOWN_RATE = 180; /* keep some headroom under the 200 RPS host limit */
const AEM_SITE_AUTH_DENIED = new Set([401, 403]);

const delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function createRateLimiter(initialRate) {
  let intervalMs = Math.ceil(1000 / initialRate);
  let queue = Promise.resolve();

  return {
    async acquire() {
      const gate = queue;
      queue = queue.then(() => delay(intervalMs));
      return gate;
    },
    handleResponse(res) {
      const rate = parseFloat(res.headers.get('x-ratelimit-rate'));
      if (rate > 0) intervalMs = Math.ceil(1000 / rate);
    },
    backoff(seconds) {
      queue = queue.then(() => delay(seconds * 1000));
    },
    reset() {
      queue = Promise.resolve();
      intervalMs = Math.ceil(1000 / initialRate);
    },
  };
}

const aemPageMarkdownLimiter = createRateLimiter(AEM_PAGE_MARKDOWN_RATE);

export function resetAemPageMarkdownRateLimiter() {
  aemPageMarkdownLimiter.reset();
}

async function fetchWithAuthRaw(url, opts = {}) {
  opts.headers ||= {};
  const { accessToken } = await initIms();
  if (accessToken?.token) {
    opts.headers.Authorization = `Bearer ${accessToken.token}`;
  }
  return fetch(url, opts);
}

export async function createSheet(data, type = 'sheet') {
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

export async function createMultiSheet(sheets) {
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
 * Get chunk filename for a given chunk number
 * @param {number} chunkNum - Zero-based chunk index
 * @returns {string} Chunk filename (e.g., 'index-000.json')
 */
function getChunkFileName(chunkNum) {
  return `${IndexFiles.MEDIA_INDEX_CHUNK_PREFIX}${String(chunkNum).padStart(3, '0')}.json`;
}

/**
 * Split media sheet into chunks
 * @param {Array} mediaData - Full media sheet data
 * @param {number} chunkSize - Entries per chunk
 * @returns {Array<Array>} Array of chunks
 */
function chunkMediaSheet(mediaData, chunkSize) {
  const chunks = [];
  for (let i = 0; i < mediaData.length; i += chunkSize) {
    chunks.push(mediaData.slice(i, i + chunkSize));
  }
  return chunks;
}

const DEFAULT_TIMEFRAME_DAYS = 3650; /* 10 years */

export async function fetchWithAuth(url, opts = {}) {
  return fetchWithAuthRaw(url, opts);
}

export async function fetchSidekickConfig(org, repo, ref = 'main') {
  if (!org || !repo) return null;

  try {
    const resp = await fetchWithAuth(`${AEM_ORIGIN}/sidekick/${org}/${repo}/${ref}/config.json`);
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

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

export function isMetadataStale(meta, thresholdMs = 5 * 60 * 1000) {
  if (!meta || !meta.lastFetchTime) return true;

  const age = Date.now() - meta.lastFetchTime;
  return age > thresholdMs;
}

export async function fetchPaginated(
  endpoint,
  org,
  repo,
  ref = 'main',
  since = null,
  limit = 1000,
  onPageLoaded = null,
) {
  const params = new URLSearchParams();
  params.append('limit', limit.toString());

  const sinceDuration = timestampToDuration(since);
  params.append('since', sinceDuration);

  const baseUrl = `https://admin.hlx.page/${endpoint}/${org}/${repo}/${ref}`;
  const separator = endpoint === 'medialog' ? '/' : '';
  const url = `${baseUrl}${separator}?${params.toString()}`;

  const resp = await fetchWithAuth(url);

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

    const nextResp = await fetchWithAuth(nextUrl);
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

export async function loadSheet(path) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);

    if (resp.ok) {
      const data = await resp.json();
      return data.data || data || [];
    }
  } catch {
    return [];
  }
  return [];
}

export async function loadMultiSheet(path, sheetName, options = {}) {
  const { allowMissing = false } = options;

  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);

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
 * Load all index chunks and concatenate
 * @param {string} basePath - Base path without filename (e.g., '/org/repo/.da/media-insights')
 * @param {number} chunkCount - Number of chunks to load
 * @param {string} sheetName - Sheet name to extract from each chunk
 * @returns {Promise<Array>} Concatenated array from all chunks
 */
export async function loadIndexChunks(basePath, chunkCount, sheetName, onProgressiveChunk) {
  // If progressive callback provided, load chunk 0 first for immediate display
  if (onProgressiveChunk && chunkCount > 0) {
    const chunk0Path = `${basePath}/${getChunkFileName(0)}`;
    const chunk0Data = await loadMultiSheet(chunk0Path, sheetName);

    // Show chunk 0 immediately
    onProgressiveChunk(chunk0Data, 0, chunkCount);

    // Load remaining chunks in background
    if (chunkCount > 1) {
      const remainingPromises = [];
      for (let i = 1; i < chunkCount; i += 1) {
        const chunkFileName = getChunkFileName(i);
        const chunkPath = `${basePath}/${chunkFileName}`;
        remainingPromises.push(
          loadMultiSheet(chunkPath, sheetName)
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
    const chunkFileName = getChunkFileName(i);
    const chunkPath = `${basePath}/${chunkFileName}`;
    chunkPromises.push(
      loadMultiSheet(chunkPath, sheetName)
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

/**
 * Save index as chunks
 * @param {string} basePath - Base path without filename
 * @param {Array} mediaData - Media sheet data (must be pre-sorted)
 * @param {Array} usageData - Usage sheet data
 * @param {number} chunkSize - Entries per chunk
 * @returns {Promise<number>} Number of chunks created
 */
export async function saveIndexChunks(basePath, mediaData, usageData, chunkSize) {
  const mediaChunks = chunkMediaSheet(mediaData, chunkSize);

  // Always save at least chunk 0, even if empty (for consistency)
  const chunksToSave = mediaChunks.length > 0 ? mediaChunks : [[]];
  const savePromises = [];

  for (let i = 0; i < chunksToSave.length; i += 1) {
    const chunkFileName = getChunkFileName(i);
    const chunkPath = `${basePath}/${chunkFileName}`;

    // Only include usage sheet in first chunk to avoid duplication
    const sheets = {
      media: chunksToSave[i],
      usage: i === 0 ? usageData : [],
    };

    const formData = await createMultiSheet(sheets);
    const savePromise = daFetch(`${DA_ORIGIN}/source${chunkPath}`, {
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
      failedChunks.push({ chunk: i, status: resp.status });
    }
  });

  if (failedChunks.length > 0) {
    const error = new Error(`Failed to save ${failedChunks.length}/${chunksToSave.length} chunks: ${failedChunks.map((f) => `chunk ${f.chunk} (${f.status})`).join(', ')}`);
    error.failedChunks = failedChunks;
    throw error;
  }

  return chunksToSave.length;
}

export async function saveSheet(data, path) {
  const formData = await createSheet(data);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function loadSheetMeta(path) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
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

export async function saveSheetMeta(meta, path) {
  const metaArray = Array.isArray(meta) ? meta : [meta];
  const formData = await createSheet(metaArray);

  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function fetchAuditLog(org, repo, ref = 'main', since = null, limit = 1000) {
  return fetchPaginated('log', org, repo, ref, since, limit);
}

export async function streamLog(
  endpoint,
  org,
  repo,
  ref,
  since,
  limit,
  onChunk,
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
    const resp = await fetchWithAuth(nextUrl);

    if (!resp.ok) {
      if (resp.status === 403) {
        logMediaLibraryError(ErrorCodes.EDS_LOG_DENIED, { status: 403, endpoint: nextUrl });
        throw new MediaLibraryError(
          ErrorCodes.EDS_LOG_DENIED,
          t('EDS_LOG_DENIED'),
          { status: 403, endpoint: nextUrl },
        );
      }
      if (resp.status === 401) {
        logMediaLibraryError(ErrorCodes.EDS_AUTH_EXPIRED, { status: 401, endpoint: nextUrl });
        throw new MediaLibraryError(
          ErrorCodes.EDS_AUTH_EXPIRED,
          t('EDS_AUTH_EXPIRED'),
          { status: 401, endpoint: nextUrl },
        );
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

function validateBulkStatusPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('Bulk status paths must be a non-empty array');
  }

  const invalidPaths = paths.filter((p) => typeof p !== 'string' || !p.startsWith('/'));

  if (invalidPaths.length > 0) {
    throw new Error(`Invalid bulk status paths (must start with /): ${invalidPaths.join(', ')}`);
  }

  return paths;
}

export async function createBulkStatusJob(org, repo, ref, contentPath = null, options = {}) {
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

  // Validate paths before sending to API
  paths = validateBulkStatusPaths(paths);

  const payload = {
    paths,
    select: ['preview'],
  };
  if (options.pathsOnly) {
    payload.pathsOnly = true;
  }
  if (isPerfEnabled()) {
    // eslint-disable-next-line no-console
    console.log('[MediaIndexer:createBulkStatusJob] creating job with paths:', paths, options.pathsOnly ? '(pathsOnly)' : '');
  }

  const resp = await fetchWithAuth(url, {
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

const BULK_JOB_TERMINAL_SUCCESS = ['completed', 'stopped'];
const BULK_JOB_TERMINAL_FAILURE = ['failed', 'error', 'cancelled'];

function asJobData(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  let nested = obj.job && typeof obj.job === 'object' ? obj.job : null;
  if (!nested && obj.data?.job && typeof obj.data.job === 'object') {
    nested = obj.data.job;
  }
  return nested && Object.keys(nested).length > 0 ? nested : obj;
}

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

export function parseResourcesFromDetailsRaw(raw) {
  const jobData = asJobData(raw);
  const dataRoot = (jobData && typeof jobData === 'object') ? jobData.data : null;
  const resources = dataRoot && typeof dataRoot === 'object' ? dataRoot.resources : null;
  return Array.isArray(resources) ? resources : [];
}

export function extractJobPhase(rawJobData) {
  const jobData = asJobData(rawJobData);
  const dataRoot = asObject(jobData.data);
  return typeof dataRoot.phase === 'string' ? dataRoot.phase : '';
}

export function extractJobState(rawJobData) {
  if (typeof rawJobData?.state === 'string' && rawJobData.state) {
    return rawJobData.state;
  }
  const jobData = asJobData(rawJobData);
  return typeof jobData.state === 'string' ? jobData.state : '';
}

export function extractJobError(rawJobData) {
  const jobData = asJobData(rawJobData);
  return typeof jobData.error === 'string' ? jobData.error : '';
}

export function extractJobCancelled(rawJobData) {
  const jobData = asJobData(rawJobData);
  return jobData.cancelled === true;
}

export function extractJobIsComplete(rawJobData, pathsOnly) {
  const state = extractJobState(rawJobData);
  const phase = extractJobPhase(rawJobData);
  const error = extractJobError(rawJobData);
  const cancelled = extractJobCancelled(rawJobData);

  if (state !== 'stopped' || error || cancelled) {
    return false;
  }
  if (phase === 'completed') {
    return true;
  }
  if (!pathsOnly) {
    const resources = parseResourcesFromDetailsRaw(rawJobData);
    return resources.length > 0;
  }
  return false;
}

export function extractJobPaths(rawJobData) {
  const jobData = asJobData(rawJobData);
  const resources = asObject(asObject(jobData.data).resources);
  const paths = new Set();
  Object.values(resources).forEach((partitionPaths) => {
    if (!Array.isArray(partitionPaths)) return;
    partitionPaths.forEach((path) => {
      if (typeof path === 'string' && path.startsWith('/')) {
        paths.add(path);
      }
    });
  });
  return Array.from(paths);
}

export async function getStatusJobDetailsRaw(jobUrl) {
  const detailsUrl = `${jobUrl}/details`;
  const resp = await fetchWithAuth(detailsUrl);

  if (!resp.ok) {
    const err = new Error(`Failed to fetch job details: ${resp.status}`);
    err.status = resp.status;
    throw err;
  }

  return resp.json();
}

// Polls job URL until completed, stopped, failed, or timeout.
export async function pollStatusJob(
  jobUrl,
  pollInterval = 1000,
  onProgress = null,
  maxDurationMs = 0,
) {
  const startedAt = Date.now();
  let lastHeartbeatLog = 0;
  let state;
  let progress;
  let error;
  let cancelled;

  // Use while loop like backfill instead of recursion
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resp = await fetchWithAuth(jobUrl);

    if (!resp.ok) {
      const err = new Error(`Failed to fetch job status: ${resp.status}`);
      err.status = resp.status;
      throw err;
    }

    const data = await resp.json();
    state = data.state;
    progress = data.progress;
    error = data.error;
    cancelled = data.cancelled;

    if (onProgress && progress) {
      onProgress(progress);
    }

    if (isPerfEnabled()) {
      const elapsed = Date.now() - startedAt;
      const heartbeatInterval = 30000;
      if (elapsed - lastHeartbeatLog >= heartbeatInterval) {
        const proc = progress?.processed ?? 0;
        const total = progress?.total ?? 0;
        // eslint-disable-next-line no-console
        console.log(
          `[MediaIndexer:poll] ${Math.round(elapsed / 1000)}s elapsed, state=${state}, processed=${proc}/${total}`,
        );
        lastHeartbeatLog = elapsed;
      }
    }

    // Check for terminal states
    if (BULK_JOB_TERMINAL_SUCCESS.includes(state)) {
      if (state === 'stopped' && (error || cancelled)) {
        throw new Error(error || 'Bulk status job was cancelled');
      }
      if (isPerfEnabled()) {
        const elapsed = Date.now() - startedAt;
        // eslint-disable-next-line no-console
        console.log(`[MediaIndexer:poll] Job completed with state=${state} after ${Math.round(elapsed / 1000)}s`);
      }
      return state;
    }

    if (BULK_JOB_TERMINAL_FAILURE.includes(state)) {
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

export async function getStatusJobDetails(jobUrl) {
  const raw = await getStatusJobDetailsRaw(jobUrl);
  return parseResourcesFromDetailsRaw(raw);
}

const aemSiteTokenCache = new Map();

function getAemSiteTokenCacheKey(org, site, ref = 'main') {
  return `${org}/${site}/${ref}`;
}

function getCachedAemSiteToken(org, site, ref = 'main') {
  const key = getAemSiteTokenCacheKey(org, site, ref);
  const cached = aemSiteTokenCache.get(key);
  if (!cached || cached.promise) return null;
  if (cached.siteTokenExpiry && cached.siteTokenExpiry <= Date.now() + 60_000) {
    aemSiteTokenCache.delete(key);
    return null;
  }
  return cached.siteToken ? cached : null;
}

function clearCachedAemSiteToken(org, site, ref = 'main') {
  aemSiteTokenCache.delete(getAemSiteTokenCacheKey(org, site, ref));
}

export function resetAemSiteTokenCache() {
  aemSiteTokenCache.clear();
}

async function fetchAemSiteToken(org, site, ref = 'main') {
  const { accessToken } = await initIms() || {};
  const imsToken = accessToken?.token;
  if (!imsToken) {
    return { error: 'Missing IMS access token' };
  }

  const body = JSON.stringify({
    org,
    site,
    ref,
    accessToken: imsToken,
  });
  const resp = await fetch(`${AEM_ORIGIN}/auth/adobe/exchange`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });

  if (!resp.ok) {
    return { error: `Error fetch AEM Site Token ${resp.status}` };
  }

  const data = await resp.json();
  const siteToken = data.siteToken || data.token;
  const siteTokenExpiry = data.siteTokenExpiry || data.tokenExpiry || 0;

  if (!siteToken) {
    return { error: 'AEM Site Token missing from exchange response' };
  }

  return { siteToken, siteTokenExpiry };
}

const getAemSiteToken = (() => {
  const loadToken = async (org, site, ref = 'main') => {
    const result = await fetchAemSiteToken(org, site, ref);
    if (result?.siteToken) {
      aemSiteTokenCache.set(getAemSiteTokenCacheKey(org, site, ref), result);
      return result;
    }
    clearCachedAemSiteToken(org, site, ref);
    return result;
  };

  return ({ org, site, ref = 'main' }) => {
    const key = getAemSiteTokenCacheKey(org, site, ref);
    const cached = getCachedAemSiteToken(org, site, ref);
    if (cached) return Promise.resolve(cached);

    const pending = aemSiteTokenCache.get(key);
    if (pending?.promise) return pending.promise;

    const promise = loadToken(org, site, ref)
      .catch((error) => {
        clearCachedAemSiteToken(org, site, ref);
        throw error;
      });
    aemSiteTokenCache.set(key, { promise });
    return promise;
  };
})();

function toMarkdownFetchPath(pagePath, org, repo) {
  let path = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
  const prefix = `/${org}/${repo}`;
  if (path.startsWith(`${prefix}/`) || path === prefix) {
    path = path === prefix ? '/' : path.slice(prefix.length);
  }
  if (path.endsWith('/')) return `${path}index.md`;
  if (path.endsWith('.md')) return path;
  return `${path}.md`;
}

function buildAemPageMarkdownUrl(pagePath, org, repo, ref = 'main') {
  return `https://${ref}--${repo}--${org}.aem.page${toMarkdownFetchPath(pagePath, org, repo)}`;
}

function appendNoCacheParam(url) {
  const noCacheUrl = new URL(url);
  noCacheUrl.searchParams.set('nocache', Date.now().toString());
  return noCacheUrl.toString();
}

function getCachedSiteTokenHeaders(org, site, ref = 'main') {
  const cached = getCachedAemSiteToken(org, site, ref);
  if (!cached?.siteToken) return null;
  return { Authorization: `token ${cached.siteToken}` };
}

export async function getSiteTokenHeaders(org, site, ref = 'main') {
  const json = await getAemSiteToken({ org, site, ref });
  const { siteToken } = json;
  if (!siteToken) return null;
  return { Authorization: `token ${siteToken}` };
}

async function fetchAemPageMarkdownWithRetry(url, headers = null, maxRetries = 1) {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    await aemPageMarkdownLimiter.acquire();
    const opts = {};
    if (headers) opts.headers = headers;
    const res = await etcFetch(appendNoCacheParam(url), 'cors', opts);
    aemPageMarkdownLimiter.handleResponse(res);

    if (res.status === 429 && attempt < maxRetries) {
      const headerVal = parseInt(res.headers.get('x-retry-after') || res.headers.get('retry-after'), 10);
      const retryAfter = headerVal > 0 ? headerVal : 2 ** attempt;
      if (isPerfEnabled()) {
        // eslint-disable-next-line no-console
        console.log(`[aem-page] 429 rate limit hit, backing off ${retryAfter}s (attempt ${attempt + 1}/${maxRetries + 1})`);
      }
      aemPageMarkdownLimiter.backoff(retryAfter);
      // eslint-disable-next-line no-continue
      continue;
    }

    if (res.status === 503 && attempt < maxRetries) {
      aemPageMarkdownLimiter.backoff(2 ** attempt);
      // eslint-disable-next-line no-continue
      continue;
    }

    return res;
  }

  throw new Error(`AEM page request failed after ${maxRetries + 1} attempts`);
}

export async function fetchPageMarkdown(pagePath, org, repo, ref = 'main') {
  try {
    const pageUrl = buildAemPageMarkdownUrl(pagePath, org, repo, ref);
    const cachedSiteHeaders = getCachedSiteTokenHeaders(org, repo, ref);
    let resp = await fetchAemPageMarkdownWithRetry(pageUrl, cachedSiteHeaders);

    if (resp.ok) {
      const text = await resp.text();

      // Detect HTML response instead of markdown (only check document start)
      const trimmed = text.trim();
      const isHtml = trimmed.startsWith('<!DOCTYPE')
                     || trimmed.startsWith('<html')
                     || trimmed.startsWith('<HTML');

      if (isHtml) {
        return { markdown: null, html: text, status: resp.status };
      }

      // If markdown is empty, try .html fallback to ensure we're not missing content
      if (!text.trim()) {
        const htmlUrl = pageUrl.replace(/\.md$/, '.html');
        const htmlResp = await fetchAemPageMarkdownWithRetry(htmlUrl, cachedSiteHeaders);
        if (htmlResp.ok) {
          const html = await htmlResp.text();
          if (html.trim()) {
            return { markdown: null, html, status: 200 };
          }
        }
      }

      return { markdown: text, status: resp.status };
    }

    if (AEM_SITE_AUTH_DENIED.has(resp.status)) {
      if (cachedSiteHeaders) {
        clearCachedAemSiteToken(org, repo, ref);
      }

      const siteTokenHeaders = await getSiteTokenHeaders(org, repo, ref);
      if (siteTokenHeaders) {
        resp = await fetchAemPageMarkdownWithRetry(pageUrl, siteTokenHeaders);
        if (resp.ok) {
          const text = await resp.text();

          // Detect HTML response instead of markdown (only check document start)
          const trimmed = text.trim();
          const isHtml = trimmed.startsWith('<!DOCTYPE')
                         || trimmed.startsWith('<html')
                         || trimmed.startsWith('<HTML');

          if (isHtml) {
            return { markdown: null, html: text, status: resp.status };
          }

          // If markdown is empty, try .html fallback to ensure we're not missing content
          if (!text.trim()) {
            const htmlUrl = pageUrl.replace(/\.md$/, '.html');
            const htmlResp = await fetchAemPageMarkdownWithRetry(htmlUrl, siteTokenHeaders);
            if (htmlResp.ok) {
              const html = await htmlResp.text();
              if (html.trim()) {
                return { markdown: null, html, status: 200 };
              }
            }
          }

          return { markdown: text, status: resp.status };
        }
      }

      return {
        markdown: null,
        status: resp.status,
        reason: `HTTP ${resp.status}`,
      };
    }

    // Try HTML fallback on 404
    if (resp.status === 404) {
      const htmlUrl = pageUrl.replace(/\.md$/, '.html');
      const htmlResp = await fetchAemPageMarkdownWithRetry(htmlUrl, cachedSiteHeaders);
      if (htmlResp.ok) {
        const html = await htmlResp.text();
        return { markdown: null, html, status: 200 };
      }
    }

    return { markdown: null, status: resp.status, reason: `HTTP ${resp.status}` };
  } catch (err) {
    return { markdown: null, status: 0, reason: err?.message || 'Unknown error' };
  }
}

// Lists folder contents via DA List API.
export async function listFolder(path, org, repo) {
  // Strip org/repo prefix if present (path might be /org/repo/subfolder or just /subfolder)
  const prefix = `/${org}/${repo}`;
  let contentPath = path;
  if (path.startsWith(`${prefix}/`)) {
    contentPath = path.slice(prefix.length);
  } else if (path === prefix) {
    contentPath = '';
  }

  const normalizedPath = contentPath.replace(/^\//, '') || '';
  const url = `${DA_ORIGIN}/list/${org}/${repo}/${normalizedPath}`;

  const resp = await daFetch(url);
  if (!resp.ok) {
    return [];
  }
  const data = await resp.json();
  return Array.isArray(data) ? data : (data.sources || []);
}

const MEDIA_EXTS = new Set([
  ...ExternalMedia.EXTENSIONS.pdf,
  ...ExternalMedia.EXTENSIONS.svg,
  ...ExternalMedia.EXTENSIONS.image,
  ...ExternalMedia.EXTENSIONS.video,
]);

function stripOrgRepoPrefix(path, org, repo) {
  if (!path || !org || !repo) return path;
  const prefix = `/${org}/${repo}`;
  if (path.startsWith(`${prefix}/`) || path === prefix) {
    return path === prefix ? '/' : path.slice(prefix.length);
  }
  return path;
}

export async function listItemsAtPath(org, repo, contentPath = '') {
  const normalizedPath = (contentPath || '').replace(/^\//, '') || '';
  const items = await listFolder(normalizedPath, org, repo);
  const folders = items
    .filter((item) => !('ext' in item))
    .map((item) => stripOrgRepoPrefix(item.path || item.name || '', org, repo))
    .filter(Boolean);
  const prefix = normalizedPath ? `/${normalizedPath}`.replace(/\/$/, '') : '';
  const rootLevelResources = [];
  items.forEach((item) => {
    const ext = item?.ext;
    if (!ext || typeof ext !== 'string') return;
    const rawPath = (item.path || item.name || '').replace(/^\//, '');
    if (!rawPath) return;
    let p = prefix ? `${prefix}/${rawPath}` : `/${rawPath}`;
    p = stripOrgRepoPrefix(p, org, repo);
    if (ext.toLowerCase() === 'html') {
      const docPath = p.replace(/\.html$/i, '');
      rootLevelResources.push({ path: docPath });
    } else if (MEDIA_EXTS.has(ext.toLowerCase())) {
      rootLevelResources.push({ path: p });
    }
  });
  return { folders, rootLevelResources };
}

export async function listRootLevelResources(org, repo, contentPath = '') {
  const normalizedPath = (contentPath || '').replace(/^\//, '') || '';
  const items = await listFolder(normalizedPath, org, repo);
  const resources = [];
  const prefix = normalizedPath ? `/${normalizedPath}`.replace(/\/$/, '') : '';
  items.forEach((item) => {
    const ext = item?.ext;
    if (!ext || typeof ext !== 'string') return;
    const rawPath = (item.path || item.name || '').replace(/^\//, '');
    if (!rawPath) return;
    let p = prefix ? `${prefix}/${rawPath}` : `/${rawPath}`;
    p = stripOrgRepoPrefix(p, org, repo);
    if (ext.toLowerCase() === 'html') {
      const docPath = p.replace(/\.html$/i, '');
      resources.push({ path: docPath });
    } else if (MEDIA_EXTS.has(ext.toLowerCase())) {
      resources.push({ path: p });
    }
  });
  return resources;
}

// Returns { exists, lastModified } for index file in DA.
export async function checkIndex(folderPath, org, repo) {
  // Check if index is chunked by loading meta
  const metaPath = `${folderPath}/${IndexFiles.MEDIA_INDEX_META}`;
  const meta = await loadSheetMeta(metaPath);

  if (meta?.chunked === true) {
    // For chunked indexes, use meta file timestamp for alignment checks
    // This avoids timing issues where chunk 0 upload → meta save can exceed alignment tolerance
    const items = await listFolder(folderPath, org, repo);

    // Verify at least chunk 0 exists (or chunkCount=0 for old empty indexes)
    if (meta.chunkCount === 0) {
      // Old empty index - meta exists, treat as valid
      const metaFile = items.find(
        (item) => (item.name === 'index-meta' && item.ext === 'json')
          || (item.path && item.path.endsWith(`/${IndexFiles.MEDIA_INDEX_META}`)),
      );
      const lastMod = metaFile?.lastModified ?? metaFile?.props?.lastModified ?? null;
      return { exists: true, lastModified: lastMod };
    }

    // Check if first chunk exists
    const chunk0File = items.find(
      (item) => (item.name === 'index-000' && item.ext === 'json')
        || (item.path && item.path.endsWith(`/${IndexFiles.MEDIA_INDEX_CHUNK_PREFIX}000.json`)),
    );

    if (!chunk0File) {
      return { exists: false, lastModified: null };
    }

    // Return meta file timestamp (saved last, aligns with lastFetchTime)
    const metaFile = items.find(
      (item) => (item.name === 'index-meta' && item.ext === 'json')
        || (item.path && item.path.endsWith(`/${IndexFiles.MEDIA_INDEX_META}`)),
    );
    const lastMod = metaFile?.lastModified ?? metaFile?.props?.lastModified;
    const ts = lastMod != null && typeof lastMod === 'number' ? lastMod : null;
    return { exists: true, lastModified: ts };
  }

  // Fallback: check for single index.json (backward compatibility)
  const items = await listFolder(folderPath, org, repo);
  const indexFile = items.find(
    (item) => (item.name === 'media-index' && item.ext === 'json')
      || (item.path && item.path.endsWith(`/${IndexFiles.MEDIA_INDEX}`)),
  );
  if (!indexFile) return { exists: false, lastModified: null };
  const lastMod = indexFile.lastModified ?? indexFile.props?.lastModified;
  const ts = lastMod != null && typeof lastMod === 'number' ? lastMod : null;
  return { exists: true, lastModified: ts };
}

// Loads index meta JSON (lastFetchTime, etc.) from DA.
export async function loadIndexMeta(path) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (resp.ok) {
      const data = await resp.json();
      return data.data?.[0] || data;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[MediaIndexer] Failed to load meta from ${path}:`, error.message);
    return null;
  }
  return null;
}

// Saves index meta to DA source path.
export async function saveIndexMeta(meta, path) {
  const formData = await createSheet([meta]);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'POST',
    body: formData,
  });
}

function isProtectedSiteAssetUrl(url, org, repo, ref = 'main') {
  if (!url || !org || !repo) return false;

  try {
    const parsed = new URL(url);
    return parsed.hostname === `${ref}--${repo}--${org}.aem.page`;
  } catch {
    return false;
  }
}

function sanitizeValidationUrl(url) {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return url.split('#')[0];
  }
}

async function fetchFileResponse(url, {
  method = 'HEAD',
  redirectMode = 'manual',
  org = '',
  repo = '',
  ref = 'main',
  signal,
} = {}) {
  const requestUrl = sanitizeValidationUrl(url);
  const opts = {
    method,
    signal,
    redirect: redirectMode,
  };
  const isProtectedSiteAsset = isProtectedSiteAssetUrl(requestUrl, org, repo, ref);
  const cachedSiteHeaders = isProtectedSiteAsset ? getCachedSiteTokenHeaders(org, repo, ref) : null;

  if (cachedSiteHeaders) {
    opts.headers = cachedSiteHeaders;
  }

  const response = await etcFetch(appendNoCacheParam(requestUrl), 'cors', opts);

  if (!isProtectedSiteAsset || !AEM_SITE_AUTH_DENIED.has(response.status)) {
    return response;
  }

  if (cachedSiteHeaders) {
    clearCachedAemSiteToken(org, repo, ref);
  }

  const siteTokenHeaders = await getSiteTokenHeaders(org, repo, ref);
  if (!siteTokenHeaders) {
    return response;
  }

  return etcFetch(appendNoCacheParam(requestUrl), 'cors', {
    method,
    signal,
    redirect: redirectMode,
    headers: siteTokenHeaders,
  });
}

function resolveProxyRedirectUrl(originalUrl, response) {
  try {
    const originalUrlObj = new URL(sanitizeValidationUrl(originalUrl));
    const etcHostname = new URL(DA_ETC_ORIGIN).hostname;
    const location = (response.headers.get('location') || '').trim();

    if (location && response.status >= 300 && response.status < 400) {
      const locationUrl = new URL(location, originalUrlObj.origin);
      if (locationUrl.hostname === etcHostname) {
        return `${originalUrlObj.origin}${locationUrl.pathname}${locationUrl.search}`;
      }
      return locationUrl.toString();
    }
  } catch {
    // ignore malformed URL/redirects
  }

  return '';
}

async function followFileRedirects(requestUrl, response, options = {}, redirectCount = 0) {
  const redirectUrl = resolveProxyRedirectUrl(requestUrl, response);
  if (!redirectUrl || redirectUrl === requestUrl || redirectCount >= 5) {
    return {
      requestUrl,
      response,
    };
  }

  const nextResponse = await fetchFileResponse(redirectUrl, options);
  return followFileRedirects(redirectUrl, nextResponse, options, redirectCount + 1);
}

async function fetchFileResponseInfo(url, {
  method = 'HEAD',
  redirectMode = 'manual',
  timeoutMs = 5000,
  org = '',
  repo = '',
  ref = 'main',
} = {}) {
  if (!url) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      finalUrl: '',
      lastModified: null,
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetchFileResponse(url, {
      method,
      redirectMode,
      org,
      repo,
      ref,
      signal: controller.signal,
    });
    const {
      requestUrl,
      response: finalResponse,
    } = await followFileRedirects(url, response, {
      method,
      redirectMode,
      org,
      repo,
      ref,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const rawLastModified = finalResponse.headers.get('last-modified');
    const parsedLastModified = rawLastModified ? new Date(rawLastModified).getTime() : Number.NaN;

    return {
      ok: finalResponse.ok,
      status: finalResponse.status,
      contentType: finalResponse.headers.get('content-type') || '',
      finalUrl: requestUrl,
      redirected: finalResponse.redirected || requestUrl !== url,
      lastModified: Number.isNaN(parsedLastModified) ? null : parsedLastModified,
    };
  } catch (error) {
    if (isPerfEnabled()) {
      // eslint-disable-next-line no-console
      console.log(`[fetchFileResponseInfo:${method}] Failed for ${url}:`, error.message);
    }

    return {
      ok: false,
      status: 0,
      contentType: '',
      finalUrl: '',
      redirected: false,
      lastModified: null,
      error: error.message,
    };
  }
}

export async function fetchFileHeadInfo(url, options = {}) {
  return fetchFileResponseInfo(url, {
    ...options,
    method: 'HEAD',
    redirectMode: 'manual',
  });
}

export async function fetchFileGetInfo(url, options = {}) {
  return fetchFileResponseInfo(url, {
    ...options,
    method: 'GET',
    redirectMode: 'follow',
  });
}

// Fetches Last-Modified timestamp for absolute URLs (PDFs, SVGs, fragments)
export async function fetchFileLastModified(url, timeoutMs = 5000, org = '', repo = '', ref = 'main') {
  const headInfo = await fetchFileHeadInfo(url, {
    timeoutMs,
    org,
    repo,
    ref,
  });
  return headInfo.lastModified;
}
