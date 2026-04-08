// move to public constants
export const DA_ORIGIN = 'https://admin.da.live';
export const AEM_ORIGIN = 'https://admin.hlx.page';

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
