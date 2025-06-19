import { convertPath } from '../../utils/utils.js';

function getFullPath(path, sourcePrefix, destPrefix) {
  return convertPath({ path, sourcePrefix, destPrefix });
}

export function getSyncUrls(org, site, location, urls) {
  return urls.map((url) => {
    const {
      daBasePath,
      aemBasePath,
      daDestPath,
      aemDestPath,
      ext,
    } = getFullPath(url.suppliedPath, undefined, location);

    const opts = {
      ...url,
      sourceView: aemBasePath,
      destView: aemDestPath,
      source: `/${org}/${site}${daBasePath}`,
      destination: `/${org}/${site}${daDestPath}`,
      hasExt: ext === 'json',
    };

    return opts;
  });
}

export function syncPath(source, destination) {
  return { source, destination };
}
