import { getSourceUrl, source } from '../../../../nx2/utils/api.js';

export function getOrgSite(mountpoint) {
  const segments = new URL(mountpoint).pathname.split('/').filter(Boolean);
  const [org, sites, site, store] = segments;
  if (segments.length === 4 && sites === 'sites' && store === 'source') return { org, site };
  return { org, site: sites };
}

export function getInitSite(config) {
  const {
    mountpoint, contentSourceType, apiUpgrade, owner, repo,
  } = config ?? {};
  const url = typeof mountpoint === 'string' ? mountpoint : mountpoint?.url;
  if (url) return getOrgSite(url);
  const sourceBus = mountpoint?.type === 'sourcebus' || contentSourceType === 'sourcebus' || apiUpgrade === true;
  return sourceBus ? { org: owner, site: repo } : {};
}

const getDocPath = (pathname) => (pathname.endsWith('/') ? `${pathname}index.html` : `${pathname}.html`);

export async function loadDocSource({ org, site, pathname }) {
  const path = getDocPath(pathname);
  const [sourceUrl, resp] = await Promise.all([
    getSourceUrl({ org, site, path }),
    source.getMetadata({ org, site, path }),
  ]);
  if (!resp.ok) return { error: `Could not load ${path}`, status: resp.status };
  return { sourceUrl, permissions: resp.permissions ?? ['read', 'write'] };
}
