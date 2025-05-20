import { getHasExt } from '../../utils/utils.js';

function getDaAdminPath(org, site, path) {
  const basePath = `/${org}/${site}${path}`;
  const indexedPath = basePath.endsWith('/') ? `${basePath}index` : basePath;
  const hasExt = getHasExt(indexedPath);
  return hasExt ? indexedPath : `${indexedPath}.html`;
}

export function getSyncUrls(org, site, location, urls) {
  return urls.map((url) => ({
    ...url,
    syncPath: `${location}${url.suppliedPath}`,
    source: getDaAdminPath(org, site, url.suppliedPath),
    destination: getDaAdminPath(org, site, `${location}${url.suppliedPath}`),
    hasExt: getHasExt(url.suppliedPath),
    synced: undefined,
  }));
}

export function syncPath(source, destination) {
  return { source, destination };
}
