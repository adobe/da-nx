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

export function replaceHtml(text, fromOrg, fromRepo, daMetadata = {}) {
  let inner = text;
  if (fromOrg && fromRepo) {
    const fromOrigin = `https://main--${fromRepo}--${fromOrg}.aem.live`;
    inner = text
      .replaceAll('./media', `${fromOrigin}/media`)
      .replaceAll('href="/', `href="${fromOrigin}/`);
  }

  let metadataHTML = '';
  if (Object.keys(daMetadata).length > 0) {
    const daRows = Object.entries(daMetadata)
      .map(([key, value]) => `<div><div>${key}</div><div>${value}</div></div>`)
      .join('');
    metadataHTML = `\n  <div class="da-metadata">${daRows}</div>\n`;
  }

  return `
    <body>
      <header></header>
      <main>${inner}</main>
      ${metadataHTML}<footer></footer>
    </body>
  `;
}

export async function saveToDa(text, url, daMetadata = {}) {
  const { org, repo, pathname } = url;
  const daPath = `/${org}/${repo}${pathname}`;
  const daHref = `https://da.live/edit#${daPath}`;

  const body = replaceHtml(text, org, repo, daMetadata);

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
