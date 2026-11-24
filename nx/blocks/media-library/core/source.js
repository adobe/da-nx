import { daFetch } from './ims-adapter.js';
import { DA_ADMIN, HLX_ADMIN } from '../../../utils/utils.js';
import { AEM_API_ORIGIN } from './constants.js';
import { getMessage } from './messages.js';
import { getRetryAfterMs } from './rate-limit.js';
import {
  getSourceUrl,
  getListUrl,
  toListItems,
  toSaveOptions,
} from './source-api.js';

const MAX_RETRY_AFTER_MS = 2000;

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

async function fetchAdmin(url, retryDelaysMs = [250, 500]) {
  const resp = await daFetch(url);
  if (![429, 503].includes(resp.status) || !retryDelaysMs.length) return resp;
  const retryAfterMs = getRetryAfterMs(resp);
  if (retryAfterMs > MAX_RETRY_AFTER_MS) return resp;
  const [delayMs, ...rest] = retryDelaysMs;
  await sleep(retryAfterMs || delayMs);
  return fetchAdmin(url, rest);
}

const checkFailed = (resp) => new Error(getMessage('SOURCE_CHECK_FAILED', { status: resp.status }));

// Ping like nx2 isHlx6, over the media library's daFetch so plugin-injected tokens work.
// The ping header is also set for a source bus overlay alone, so check the primary source.
async function probe(org, site) {
  const ping = await fetchAdmin(`${HLX_ADMIN}/ping/${org}/${site}`);
  if (!ping.ok && ping.status !== 404) throw checkFailed(ping);
  if (!ping.headers.has('x-api-upgrade-available')) return false;
  const config = await fetchAdmin(`${HLX_ADMIN}/sidekick/${org}/${site}/main/config.json`);
  if (!config.ok) throw checkFailed(config);
  const { contentSourceType, contentSourceUrl } = await config.json();
  return contentSourceType === 'sourcebus' || !!contentSourceUrl?.startsWith(`${AEM_API_ORIGIN}/`);
}

export const isHlx6 = (() => {
  const cache = {};

  return (org, site) => {
    if (!org || !site) return Promise.resolve(false);
    const key = `/${org}/${site}`;
    cache[key] ??= probe(org, site).catch((error) => {
      delete cache[key];
      throw error;
    });
    return cache[key];
  };
})();

export async function getSourceOrigin(path) {
  const [, org, site] = path.split('/');
  return (await isHlx6(org, site)) ? AEM_API_ORIGIN : DA_ADMIN;
}

export async function fetchSource(path, opts, pacing) {
  const sourceOrigin = await getSourceOrigin(path);
  return daFetch(getSourceUrl({ sourceOrigin, path }), opts, pacing);
}

export async function saveSource({
  path, json, method = 'PUT', retry = true,
}) {
  const sourceOrigin = await getSourceOrigin(path);
  const opts = toSaveOptions({ sourceOrigin, json, method });
  return daFetch(getSourceUrl({ sourceOrigin, path }), opts, { retry });
}

export async function deleteSource(path) {
  return fetchSource(path, { method: 'DELETE' }, { retry: false });
}

export async function listSource(path) {
  const sourceOrigin = await getSourceOrigin(path);
  const resp = await daFetch(getListUrl({ sourceOrigin, path }));
  if (!resp.ok) return { ok: false, status: resp.status, items: [] };
  const body = await resp.json();
  if (sourceOrigin === AEM_API_ORIGIN && !Array.isArray(body)) {
    return { ok: false, status: 502, items: [] };
  }
  return {
    ok: true, status: resp.status, items: toListItems({ sourceOrigin, path, body }), sourceOrigin,
  };
}
