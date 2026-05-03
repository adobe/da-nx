import { HLX_ADMIN, AEM_API, DA_ADMIN, ALLOWED_TOKEN } from './utils.js';

const { loadIms, handleSignIn } = await (async () => {
  const { getNx } = await import(`${window.location.origin}/scripts/utils.js`);
  return import(`${getNx()}/utils/ims.js`);
})();

export const daFetch = async ({ url, opts = { method: 'GET' }, redirect = false }) => {
  const { accessToken } = await loadIms();
  if (!accessToken) {
    handleSignIn();
    return {};
  }

  opts.headers = opts.headers || {};

  const canToken = ALLOWED_TOKEN.some((origin) => new URL(url).origin === origin);
  if (canToken) {
    opts.headers.Authorization = `Bearer ${accessToken.token}`;
    if ([HLX_ADMIN, AEM_API].some((origin) => new URL(url).origin === origin)) {
      opts.headers['x-content-source-authorization'] = `Bearer ${accessToken.token}`;
      opts.headers.Authorization = `Bearer ${accessToken.token}`;
    }
  }

  const resp = await fetch(url, opts);
  const { status } = resp;
  if (status === 401 || status === 403) {
    if (redirect) window.location = `${window.location.origin}/not-found`;
  }

  return resp;
};

const STORAGE_KEY = 'hlx6-upgrade';

export const isHlx6 = (() => {
  const cache = {};

  const fetchUpgradeStatus = async (path) => {
    const lsCache = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
    if (lsCache[path]) return true;

    const resp = await daFetch({ url: `${HLX_ADMIN}/ping${path}` });
    const upgraded = resp.headers.get('x-api-upgrade-available') !== null;
    if (upgraded) {
      lsCache[path] = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lsCache));
    }
    return upgraded;
  };

  return (org, site) => {
    const path = `/${org}/${site}`;
    cache[path] ??= fetchUpgradeStatus(path);
    return cache[path];
  };
})();

const getApiPath = async (org, site, api, daPath) => {
  const hlx6 = await isHlx6(org, site);
  if (hlx6) return `${AEM_API}/${org}/sites/${site}/${api}${daPath}`;
  return `${DA_ADMIN}/${api}/${org}/${site}${daPath}`;
};

export const signout = () => {
  daFetch(`${DA_ADMIN}/logout`);
};

const TEXT_TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
};

export const putSource = async ({ org, site, daPath, body }) => {
  const url = await getApiPath(org, site, 'source', daPath);
  const ext = Object.keys(TEXT_TYPES).find((e) => daPath.endsWith(e));
  const opts = { method: 'POST' };
  if (ext) {
    opts.body = body instanceof Blob ? await body.text() : body;
    opts.headers = { 'Content-Type': TEXT_TYPES[ext] };
  } else {
    opts.body = body;
  }
  return daFetch({ url, opts });
};
