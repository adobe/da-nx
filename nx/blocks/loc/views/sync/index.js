import { convertPath, createSnapshotPrefix, findSourceLocation } from '../../utils/utils.js';

function getFullPath(path, sourcePrefix, destPrefix) {
  return convertPath({ path, sourcePrefix, destPrefix });
}

export function getSyncUrls(org, site, location, urls, snapshot, sourceLocations = [location]) {
  const snapshotPrefix = createSnapshotPrefix(snapshot);
  return urls.map((url) => {
    if (findSourceLocation({ path: url.suppliedPath, locations: sourceLocations })) {
      const view = `${snapshotPrefix}${url.suppliedPath}`;
      return { ...url, sourceView: view, destView: view, synced: 'skipped', skipSync: true };
    }

    const {
      daBasePath,
      aemBasePath,
      daDestPath,
      aemDestPath,
      ext,
    } = getFullPath(url.suppliedPath, undefined, location);

    const opts = {
      ...url,
      sourceView: `${snapshotPrefix}${aemBasePath}`,
      destView: `${snapshotPrefix}${aemDestPath}`,
      source: `/${org}/${site}${snapshotPrefix}${daBasePath}`,
      destination: `/${org}/${site}${snapshotPrefix}${daDestPath}`,
      hasExt: ext === 'json',
    };

    return opts;
  });
}

export function syncPath(source, destination) {
  return { source, destination };
}
