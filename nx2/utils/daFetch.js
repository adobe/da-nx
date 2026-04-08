export const AEM_ORIGIN = 'https://admin.hlx.page';

const DA_ADMIN_ENVS = {
  local: 'http://localhost:8787',
  stage: 'https://stage-admin.da.live',
  prod: 'https://admin.da.live',
};

function getDaEnv(key, envs) {
  const query = new URL(window.location.href).searchParams.get(key);
  if (query === 'reset') {
    localStorage.removeItem(key);
  } else if (query) {
    localStorage.setItem(key, query);
  }
  const env = envs[localStorage.getItem(key) || 'prod'];
  // TODO: INFRA
  return location.origin === 'https://da.page' ? env.replace('.live', '.page') : env;
}

export const DA_ORIGIN = (() => getDaEnv('da-admin', DA_ADMIN_ENVS))();

let imsDetails;

async function initIms() {
  if (imsDetails) return imsDetails;
  const { loadIms } = await import('./ims.js');
  try {
    imsDetails = await loadIms();
    return imsDetails;
  } catch {
    return null;
  }
}

export const daFetch = async (url, opts = {}) => {
  opts.headers ||= {};
  if (localStorage.getItem('nx-ims') || imsDetails) {
    const { accessToken } = await initIms();
    if (accessToken) {
      opts.headers.Authorization = `Bearer ${accessToken.token}`;

      if (url.startsWith(AEM_ORIGIN)) {
        opts.headers['x-content-source-authorization'] = `Bearer ${accessToken.token}`;
      }
    }
  }
  let resp;
  try {
    resp = await fetch(url, opts);
  } catch (err) {
    return new Response(null, { status: 500, statusText: err.message });
  }
  if (resp.status === 401) {
    const { loadIms, handleSignIn } = await import('./ims.js');
    await loadIms();
    handleSignIn();
  }
  resp.permissions = resp.headers.get('x-da-actions')?.split('=').pop().split(',');
  return resp;
};
