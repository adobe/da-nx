const DA_ORIGIN = 'https://admin.da.live';

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
  const resp = await fetch(url, opts);
  if (resp.status === 401) {
    const { loadIms, handleSignIn } = await import('./ims.js');
    await loadIms();
    handleSignIn();
  }
  return resp;
};

export async function saveToDa(text, url) {
  const daPath = `/${url.org}/${url.repo}${url.pathname}`;
  const daHref = `https://da.live/edit#${daPath}`;

  let innerHtml = text;

  if (url.originRepo && url.originOrg) {
    const origin = `https://main--${url.originRepo}--${url.originOrg}.hlx.live`;
    innerHtml = text
      .replaceAll('./media', `${origin}/media`)
      .replaceAll('href="/', `href="${origin}/`);
  }

  const full = `
    <body>
      <header></header>
      <main>${innerHtml}</main>
      <footer></footer>
    </body>
  `;
  const blob = new Blob([full], { type: 'text/html' });
  const formData = new FormData();
  formData.append('data', blob);
  const opts = { method: 'PUT', body: formData };
  try {
    const daResp = await daFetch(`${DA_ORIGIN}/source${daPath}.html`, opts);
    return { daHref, daStatus: daResp.status, daResp, ok: daResp.ok };
  } catch {
    console.log(`Couldn't save ${url.daUrl}`);
    return null;
  }
}
