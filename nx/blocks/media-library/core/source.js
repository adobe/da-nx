import { daFetch } from './ims-adapter.js';
import { DA_ADMIN, HLX_ADMIN } from '../../../utils/utils.js';
import { AEM_API_ORIGIN } from './constants.js';
import { defaultDelay as sleep } from './rate-limit.js';
import {
  getSourceUrl,
  getListUrl,
  toListItems,
  toSaveOptions,
} from './source-api.js';

// The browser can't read admin's Retry-After (not CORS-exposed), so wait a fixed time.
const ADMIN_RETRY_WAIT_MS = 1000;

async function fetchAdmin(url, retries = 2) {
  const resp = await daFetch(url);
  if (!(resp.status === 429 || resp.status >= 500) || !retries) return resp;
  await sleep(ADMIN_RETRY_WAIT_MS);
  return fetchAdmin(url, retries - 1);
}

// Ping like nx2 isHlx6, over the media library's daFetch so plugin-injected tokens work.
// A failed ping means DA, which main always uses.
async function probe(org, site) {
  const ping = await fetchAdmin(`${HLX_ADMIN}/ping/${org}/${site}`);
  return ping.headers.has('x-api-upgrade-available');
}

export const isHlx6 = (() => {
  const cache = {};

  return (org, site) => {
    if (!org || !site) return Promise.resolve(false);
    const key = `/${org}/${site}`;
    cache[key] ??= probe(org, site);
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
