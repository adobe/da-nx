import { daFetch, getSourceUrl, isHlx6 } from '../../../../nx2/utils/api.js';

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
  const hlx6 = owner && repo && await isHlx6(owner, repo).catch(() => false);
  return hlx6 ? { org: owner, site: repo } : {};
}

const getDocPath = (pathname) => (pathname.endsWith('/') ? `${pathname}index.html` : `${pathname}.html`);

export async function loadDocSource({ org, site, pathname }) {
  const path = getDocPath(pathname);
  const sourceUrl = await getSourceUrl({ org, site, path });
  const resp = await daFetch({ url: sourceUrl, opts: { method: 'HEAD' } });
  if (!resp.ok) return { error: `Could not load ${path}`, status: resp.status };
  return { sourceUrl, permissions: resp.permissions ?? ['read', 'write'] };
}
