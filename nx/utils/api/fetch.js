import { loadIms, handleSignIn } from '../ims.js';

export const DA_LEGACY_ORIGINS = [
  'https://da.live',
  'https://da.page',
  'https://admin.da.live',
  'https://admin.da.page',
  'https://stage-admin.da.live',
  'https://content.da.live',
  'http://localhost:8787',
];

export const HELIX6_ORIGIN = 'https://api.aem.live';

export const AEM_ADMIN_ORIGINS = [
  'https://admin.hlx.page',
  'https://admin.aem.live',
  HELIX6_ORIGIN,
];

const ETC_ORIGINS = [
  'https://stage-content.da.live',
  'https://helix-snapshot-scheduler-ci.adobeaem.workers.dev',
  'https://helix-snapshot-scheduler-prod.adobeaem.workers.dev',
];

const ALLOWED_TOKEN = [...DA_LEGACY_ORIGINS, ...AEM_ADMIN_ORIGINS, ...ETC_ORIGINS];

let imsDetails;

export function setImsDetails(token) {
  imsDetails = { accessToken: { token } };
}

export async function initIms() {
  if (imsDetails) return imsDetails;
  try {
    imsDetails = await loadIms();
    return imsDetails;
  } catch {
    return null;
  }
}

export async function getAuthToken() {
  if (!localStorage.getItem('nx-ims')) return null;
  const ims = await initIms();
  return ims?.accessToken?.token || null;
}

function urlOrigin(url) {
  try {
    return new URL(url).origin;
  } catch {
    return '';
  }
}

export const daFetch = async (url, opts = {}) => {
  opts.headers = opts.headers || {};
  const accessToken = await getAuthToken();
  if (accessToken) {
    const origin = urlOrigin(url);
    if (ALLOWED_TOKEN.includes(origin)) {
      opts.headers.Authorization = `Bearer ${accessToken}`;
      if (AEM_ADMIN_ORIGINS.includes(origin)) {
        opts.headers['x-content-source-authorization'] = `Bearer ${accessToken}`;
      }
    }
  }

  let resp;
  try {
    resp = await fetch(url, opts);
  } catch (err) {
    resp = new Response(null, { status: 500, statusText: err.message });
  }

  if (resp.status === 401 && opts.noRedirect !== true) {
    if (DA_LEGACY_ORIGINS.some((origin) => url.startsWith(origin))) {
      if (accessToken) {
        // eslint-disable-next-line no-console
        console.warn('You see the 404 page because you have no access to this page', url);
        window.location = `${window.location.origin}/not-found`;
        return { ok: false };
      }
      // eslint-disable-next-line no-console
      console.warn('You need to sign in because you are not authorized to access this page', url);
      await loadIms();
      handleSignIn();
    }
  }

  if (resp.status === 403) return resp;

  if (resp.headers?.get('x-da-child-actions')) {
    resp.permissions = resp.headers.get('x-da-child-actions').split('=').pop().split(',');
    return resp;
  }

  if (resp.headers?.get('x-da-actions')) {
    resp.permissions = resp.headers.get('x-da-actions').split('=').pop().split(',');
    return resp;
  }

  resp.permissions = ['read', 'write'];
  return resp;
};
