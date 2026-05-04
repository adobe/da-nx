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

  // If child actions header is present, use it.
  // This is a hint as to what can be done with the children.
  if (resp.headers?.get('x-da-child-actions')) {
    resp.permissions = resp.headers.get('x-da-child-actions').split('=').pop().split(',');
    return resp;
  }

  // Use the self actions hint if child actions are not present.
  if (resp.headers?.get('x-da-actions')) {
    resp.permissions = resp.headers?.get('x-da-actions')?.split('=').pop().split(',');
    return resp;
  }

  // TODO: HLX6 does not have this, so fake it for now.
  resp.permissions ??= ['read', 'write'];

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
    if (!site) return false;

    const path = `/${org}/${site}`;
    cache[path] ??= fetchUpgradeStatus(path);
    return cache[path];
  };
})();

const getApiPath = async (org, site, api, daPath) => {
  const hlx6 = await isHlx6(org, site);

  if (api === 'versionsource') {
    if (hlx6) return `${AEM_API}/${org}/sites/${site}/${api}${daPath}/.versions`;
    return `${DA_ADMIN}/versionsource/${org}/${site}${daPath}`;
  }

  if (api === 'config') {
    if (hlx6) {
      if (!site) return `${AEM_API}/${org}/config.json`;
      return `${AEM_API}/${org}/sites/${site}/config.json`;
    }
    if (!site) return `${DA_ADMIN}/${api}/${org}/`;
    return `${DA_ADMIN}/${api}/${org}/${site}/`;
  }

  // HLX6 does not have a list api,
  // it will use the source formatting.
  if (api === 'list') {
    return `${DA_ADMIN}/${api}/${org}/${site}${daPath}`;
  }

  // api === 'source'
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
  const hlx6 = await isHlx6(org, site);
  const url = await getApiPath(org, site, 'source', daPath);
  const textExt = Object.keys(TEXT_TYPES).find((e) => daPath.endsWith(e));
  const opts = { method: 'POST' };
  if (hlx6) {
    const hlx6Opts = { ...opts };
    // Convert blobs to text for HLX6
    if (textExt) {
      hlx6Opts.body = body instanceof Blob ? await body.text() : body;
      hlx6Opts.headers = { 'Content-Type': TEXT_TYPES[textExt] };
    } else {
      hlx6Opts.body = body;
    }
    return daFetch({ url, opts: hlx6Opts });
  }
  const formData = new FormData();
  formData.append('data', body);
  const daOpts = { ...opts, body: formData };
  return daFetch({ url, opts: daOpts });
};

export const getSource = async ({ org, site, daPath }) => {
  const url = await getApiPath(org, site, 'source', daPath);
  return daFetch({ url });
};

export const listSource = async ({ org, site, daPath }) => {
  const hlx6 = await isHlx6(org, site);
  if (hlx6) {
    const path = daPath ? `/${daPath}/` : '/';
    const url = await getApiPath(org, site, 'source', path);
    return daFetch({ url });
  }
  const url = await getApiPath(org, site, 'list', daPath);
  return daFetch({ url });
};

export const putVersion = async ({ org, site, daPath, operation, comment }) => {
  const url = new URL(await getApiPath(org, site, 'versionsource', daPath));
  if (operation) url.searchParams.set('operation', operation);
  if (comment) url.searchParams.set('comment', comment);
  const opts = { method: 'POST' };
  return daFetch({ url: url.toString(), opts });
};

export const getConfig = async ({ org, site }) => {
  const url = await getApiPath(org, site, 'config');
  return daFetch({ url });
};

export const putConfig = async ({ org, site, body }) => {
  const url = await getApiPath(org, site, 'config');

  const formData = new FormData();
  formData.append('config', body);

  const opts = { method: 'POST', body: formData };

  return daFetch({ url, opts });
};

export function hlx6ToDaList(parentPath, items) {
  return items.map((item) => {
    const contentType = item['content-type'];

    // Only HLX6 has a content type
    if (!contentType) return item;

    // Normalize folder
    const isFolder = item.name.endsWith('/');
    let name = isFolder ? item.name.slice(0, -1) : item.name;

    // Set the path before extension removal
    const path = `${parentPath}/${name}`;

    // Remove extension for display
    const nameSplit = name.split('.');
    name = nameSplit.length > 1 ? nameSplit[0] : name;

    // Scaffold out the basics
    const daItem = { name, path, contentType };

    const ext = nameSplit.length > 1 && nameSplit.pop();
    if (ext) daItem.ext = ext;

    const lastModified = item['last-modified'];
    if (lastModified) {
      const unixTime = Math.floor(new Date(lastModified).getTime());
      daItem.lastModified = unixTime;
    }

    return daItem;
  });
}
