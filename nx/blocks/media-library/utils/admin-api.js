import { daFetch, initIms } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { CORS_PROXY_URL, IndexFiles } from './constants.js';

export async function fetchWithCorsProxy(url, options = {}) {
  const { proxyOnly = false, ...fetchOpts } = options;

  const doProxyFetch = () => {
    const proxyUrl = `${CORS_PROXY_URL}?url=${encodeURIComponent(url)}`;
    return fetch(proxyUrl, fetchOpts);
  };

  if (proxyOnly) {
    return doProxyFetch();
  }

  try {
    const response = await fetch(url, fetchOpts);
    if (!response.ok) {
      return doProxyFetch();
    }

    return response;
  } catch (directError) {
    if (directError.name === 'TypeError'
        && (directError.message.includes('CORS')
        || directError.message.includes('blocked')
        || directError.message.includes('Access-Control-Allow-Origin')
        || directError.message.includes('Failed to fetch'))) {
      return doProxyFetch();
    }
    throw directError;
  }
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

const DEFAULT_TIMEFRAME_DAYS = 90;

export async function fetchWithAuth(url, opts = {}) {
  opts.headers ||= {};
  const { accessToken } = await initIms();
  if (accessToken) {
    opts.headers.Authorization = `Bearer ${accessToken.token}`;
  }
  return fetch(url, opts);
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
) {
  const fetchParams = new URLSearchParams();
  fetchParams.append('limit', limit.toString());

  if (since != null && typeof since === 'number') {
    // Use from/to for precise incremental range (per admin API: from=start, to=end)
    const fromIso = new Date(since).toISOString();
    const toIso = new Date().toISOString();
    fetchParams.append('from', fromIso);
    fetchParams.append('to', toIso);
  } else {
    const sinceDuration = since != null ? timestampToDuration(since) : '36500d';
    fetchParams.append('since', sinceDuration);
  }

  const baseUrl = `https://admin.hlx.page/${endpoint}/${org}/${repo}/${ref}`;
  const separator = endpoint === 'medialog' ? '/' : '';
  let nextUrl = `${baseUrl}${separator}?${fetchParams.toString()}`;

  const sleep = (ms) => new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

  while (nextUrl) {
    const resp = await fetchWithAuth(nextUrl);

    if (!resp.ok) {
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

    if (nextUrl) await sleep(100);
  }
}

export async function fetchPageMarkdown(pagePath, org, repo, ref = 'main') {
  try {
    const path = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
    const url = `https://${ref}--${repo}--${org}.aem.page${path}`;
    const resp = await fetchWithCorsProxy(url, { proxyOnly: true });
    if (!resp.ok) return null;
    return resp.text();
  } catch {
    return null;
  }
}

export async function listFolder(path, org, repo) {
  const normalizedPath = path.replace(/^\//, '') || '';
  const url = `${DA_ORIGIN}/list/${org}/${repo}/${normalizedPath}`;
  const resp = await daFetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  return Array.isArray(data) ? data : (data.sources || []);
}

export async function checkIndex(folderPath, org, repo) {
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

export async function saveIndexMeta(meta, path) {
  const formData = await createSheet([meta]);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'POST',
    body: formData,
  });
}
