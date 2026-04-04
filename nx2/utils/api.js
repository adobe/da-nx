import { HLX_ADMIN, AEM_API, DA_ADMIN, ALLOWED_TOKEN } from './utils.js';
import { loadIms, handleSignIn } from './ims.js';

export const daFetch = async ({ url, opts = { method: 'GET' }, redirect = false }) => {
  const { accessToken } = await loadIms();
  if (!accessToken) {
    handleSignIn();
    return {};
  }

  opts.headers = opts.headers || {};

  const canToken = ALLOWED_TOKEN.some((origin) => new URL(url).origin === origin);
  if (accessToken && canToken) {
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

export const ping = async ({ pathDetails }) => {
  const { org, site } = pathDetails;
  try {
    const resp = await fetch(`${HLX_ADMIN}/ping/${org}/${site}`);
    return {
      link: resp.headers.get('link'),
      upgrade: resp.headers.get('x-api-upgrade-available'),
    };
  } catch {
    return null;
  }
};

export const source = async ({ pathDetails, body, method = 'GET' }) => {
  // TODO: support media
  const { view, org, site, path } = pathDetails;
  const ext = view === 'sheet' ? 'json' : 'html';
  const contentType = ext === 'json' ? 'application/json' : 'text/html';
  try {
    const resp = await daFetch({
      url: `${AEM_API}/${org}/sites/${site}/source/${path}${ext}`,
      opts: {
        method,
        headers: { 'Content-Type': contentType },
        body,
      },
    });
    return resp.json();
  } catch {
    return null;
  }
};

export const list = async ({ pathDetails }) => {
  const { org, site, path } = pathDetails;
  const prefix = path ? `/${path}/` : '/';
  return daFetch({ url: `${AEM_API}/${org}/sites/${site}/source${prefix}` })
    .then((resp) => resp.json())
    .catch(() => null);
};

export const signout = () => {
  daFetch(`${DA_ADMIN}/logout`);
};
