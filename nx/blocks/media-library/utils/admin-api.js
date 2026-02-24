import { daFetch, initIms } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { createSheet } from './utils.js';

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

export function isMetaStale(meta, thresholdMs = 5 * 60 * 1000) {
  if (!meta || !meta.lastFetchTime) return true;

  const age = Date.now() - meta.lastFetchTime;
  return age > thresholdMs;
}

export async function fetchFromAdminAPI(
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

export async function loadDataSheet(path) {
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

export async function saveDataSheet(data, path) {
  const formData = await createSheet(data);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function loadMeta(path) {
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (resp.ok) {
      const data = await resp.json();
      const metaData = data.data || data || null;
      // Meta is stored as single-row array, extract first element
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

export async function saveMeta(meta, path) {
  const metaArray = Array.isArray(meta) ? meta : [meta];
  const formData = await createSheet(metaArray);

  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function fetchAuditLog(org, repo, ref = 'main', since = null, limit = 1000) {
  return fetchFromAdminAPI('log', org, repo, ref, since, limit);
}
