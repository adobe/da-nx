import { DA_ORIGIN } from '../public/utils/constants.js';

let imsDetails;

export function setImsDetails(token) {
  imsDetails = { accessToken: { token } };
}

export async function initIms() {
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
    }
  }
  let resp;
  try {
    resp = await fetch(url, opts);
  } catch (err) {
    resp = new Response(null, { status: 500, statusText: err.message });
  }
  if (resp.status === 401) {
    const { loadIms, handleSignIn } = await import('./ims.js');
    await loadIms();
    handleSignIn();
  }
  resp.permissions = resp.headers.get('x-da-actions')?.split('=').pop().split(',');
  return resp;
};

export function replaceHtml(text, fromOrg, fromRepo, { daMetadataEl = null } = {}) {
  let inner = text;
  if (fromOrg && fromRepo) {
    const fromOrigin = `https://main--${fromRepo}--${fromOrg}.aem.live`;
    inner = text
      .replaceAll('./media', `${fromOrigin}/media`)
      .replaceAll('href="/', `href="${fromOrigin}/`);
  }

  return `
    <body>
      <header></header>
      <main>${inner}</main>
      ${daMetadataEl ? `<div class="da-metadata">${daMetadataEl.innerHTML}</div>` : ''}
      <footer></footer>
    </body>
  `;
}

export async function saveToDa(text, url, { daMetadataEl = null } = {}) {
  const daPath = `/${url.org}/${url.repo}${url.pathname}`;
  const daHref = `https://da.live/edit#${daPath}`;
  const { org, repo } = url;

  const body = replaceHtml(text, org, repo, { daMetadataEl });

  const blob = new Blob([body], { type: 'text/html' });
  const formData = new FormData();
  formData.append('data', blob);
  const opts = { method: 'PUT', body: formData };
  try {
    const daResp = await daFetch(`${DA_ORIGIN}/source${daPath}.html`, opts);
    return { daHref, daStatus: daResp.status, daResp, ok: daResp.ok };
  } catch {
    // eslint-disable-next-line no-console
    console.log(`Couldn't save ${url.daUrl}`);
    return null;
  }
}

function getBlob(url, content) {
  const body = url.type === 'json'
    ? content : replaceHtml(content, url.fromOrg, url.fromRepo);

  const type = url.type === 'json' ? 'application/json' : 'text/html';

  return new Blob([body], { type });
}

export async function saveAllToDa(url, content) {
  const { toOrg, toRepo, destPath, editPath, type } = url;

  const route = type === 'json' ? '/sheet' : '/edit';
  url.daHref = `https://da.live${route}#/${toOrg}/${toRepo}${editPath}`;

  const blob = getBlob(url, content);
  const body = new FormData();
  body.append('data', blob);
  const opts = { method: 'PUT', body };

  try {
    const resp = await daFetch(`${DA_ORIGIN}/source/${toOrg}/${toRepo}${destPath}`, opts);
    return resp.status;
  } catch {
    // eslint-disable-next-line no-console
    console.log(`Couldn't save ${destPath}`);
    return 500;
  }
}
