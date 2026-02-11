export function filterSyncUrls(org, site, defaultSource, langs, urls) {
  // Group URLs into langs with unique sources that need sync
  return langs.reduce((acc, lang) => {
    const source = lang.source || defaultSource;

    const syncUrls = urls.filter((url) => !url.suppliedPath.startsWith(source));

    // If there are urls to sync, and they haven't already been captured
    if (syncUrls && !acc[source]) {
      acc[source] = syncUrls.map((url) => {
        const prefixEnd = url.suppliedPath.length - url.basePath.length;
        const suppliedPrefix = url.suppliedPath.slice(0, prefixEnd);
        return {
          ...url,
          suppliedPrefix,
          destPath: url.suppliedPath.replace(suppliedPrefix, source),
        };
      });
    }

    return acc;
  }, {});

  // return filteredUrls.map((url) => {
  //   const {
  //     daBasePath,
  //     aemBasePath,
  //     daDestPath,
  //     aemDestPath,
  //     ext,
  //   } = getFullPath(url.suppliedPath, undefined, defaultSource);

  //   return {
  //     ...url,
  //     sourceView: `${snapshotPrefix}${aemBasePath}`,
  //     destView: `${snapshotPrefix}${aemDestPath}`,
  //     source: `/${org}/${site}${snapshotPrefix}${daBasePath}`,
  //     destination: `/${org}/${site}${snapshotPrefix}${daDestPath}`,
  //     hasExt: ext === 'json',
  //   };
  // });
}

export function syncPath(source, destination) {
  return { source, destination };
}
