function getHasExt(path) {
  const name = path.split('/').pop();
  return name.split('.').length > 1;
}

function getDaAdminPath(org, site, path) {
  const basePath = `/${org}/${site}${path}`;

  const hasExt = getHasExt(path);
  return hasExt ? basePath : `${basePath}.html`;
}

export function getSyncUrls(org, site, location, urls) {
  return urls.map((url) => ({
    ...url,
    syncPath: `${location}${url.suppliedPath}`,
    source: getDaAdminPath(org, site, url.suppliedPath),
    destination: getDaAdminPath(org, site, `${location}${url.suppliedPath}`),
    hasExt: getHasExt(url.suppliedPath),
  }));
}

export function syncPath(source, destination) {
  return { source, destination };
}
