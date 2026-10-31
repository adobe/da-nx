import { daFetch } from './ims-adapter.js';
import { DA_ADMIN, HLX_ADMIN } from '../../../utils/utils.js';
import { AEM_API_ORIGIN } from './constants.js';
import {
  getSourceUrl,
  getListUrl,
  toListItems,
  toSaveOptions,
} from './source-api.js';

// Same probe as nx2 isHlx6, but over the media library's daFetch so plugin-injected tokens work.
export const isHlx6 = (() => {
  const cache = {};

  const isTransient = ({ status }) => status === 429 || status >= 500;

  const probe = async (org, site, retryDelaysMs = [250, 500]) => {
    const resp = await daFetch(`${HLX_ADMIN}/ping/${org}/${site}`);
    if (!isTransient(resp)) return resp.headers.get('x-api-upgrade-available') !== null;
    if (!retryDelaysMs.length) return undefined;
    const [delayMs, ...rest] = retryDelaysMs;
    await new Promise((resolve) => { setTimeout(resolve, delayMs); });
    return probe(org, site, rest);
  };

  return (org, site) => {
    if (!org || !site) return Promise.resolve(false);
    const key = `/${org}/${site}`;
    cache[key] ??= probe(org, site).then((hlx6) => {
      if (hlx6 === undefined) delete cache[key];
      return hlx6 ?? false;
    });
    return cache[key];
  };
})();

export async function getSourceOrigin(path) {
  const [, org, site] = path.split('/');
  return (await isHlx6(org, site)) ? AEM_API_ORIGIN : DA_ADMIN;
}

export async function fetchSource(path, opts) {
  const sourceOrigin = await getSourceOrigin(path);
  return daFetch(getSourceUrl({ sourceOrigin, path }), opts);
}

export async function saveSource({ path, json, method = 'PUT' }) {
  const sourceOrigin = await getSourceOrigin(path);
  const opts = toSaveOptions({ sourceOrigin, json, method });
  return daFetch(getSourceUrl({ sourceOrigin, path }), opts);
}

export async function deleteSource(path) {
  return fetchSource(path, { method: 'DELETE' });
}

export async function listSource(path) {
  const sourceOrigin = await getSourceOrigin(path);
  const resp = await daFetch(getListUrl({ sourceOrigin, path }));
  if (!resp.ok) return { ok: false, status: resp.status, items: [] };
  const body = await resp.json();
  return { ok: true, status: resp.status, items: toListItems({ sourceOrigin, path, body }) };
}
