import { daFetch, isHlx6, source } from '../../../../nx2/utils/api.js';
import { AEM_API, DA_ADMIN } from '../../../../nx2/utils/utils.js';

export async function checkSite(org, site) {
  try {
    return await isHlx6(org, site);
  } catch {
    return false;
  }
}

export function getOrgSite(mountpoint) {
  const segments = new URL(mountpoint).pathname.split('/').filter(Boolean);
  const [org, sites, site, store] = segments;
  if (segments.length === 4 && sites === 'sites' && store === 'source') return { org, site };
  return { org, site: sites };
}

export async function getInitSite(config) {
  const { mountpoint, owner, repo } = config ?? {};
  const url = typeof mountpoint === 'string' ? mountpoint : mountpoint?.url;
  if (url) return getOrgSite(url);
  const hlx6 = owner && repo && await checkSite(owner, repo);
  return hlx6 ? { org: owner, site: repo } : {};
}

const getDocPath = (pathname) => (pathname.endsWith('/') ? `${pathname}index.html` : `${pathname}.html`);

export async function loadDocSource({ org, site, pathname }) {
  const path = getDocPath(pathname);
  const sourceUrl = await checkSite(org, site)
    ? `${AEM_API}/${org}/sites/${site}/source${path}`
    : `${DA_ADMIN}/source/${org}/${site}${path}`;
  const resp = await daFetch({ url: sourceUrl, opts: { method: 'HEAD' } });
  if (!resp.ok) return { error: `Could not load ${path}`, status: resp.status };
  return { sourceUrl, permissions: resp.permissions ?? ['read', 'write'] };
}

export async function uploadImage({ org, site, path, body }) {
  if (await checkSite(org, site)) return source.uploadMedia({ org, site, path, body });
  const formData = new FormData();
  formData.append('data', body);
  return daFetch({ url: `${DA_ADMIN}/source/${org}/${site}${path}`, opts: { method: 'POST', body: formData } });
}
