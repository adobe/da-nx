import DaUrl from '../../utils/daUrl.js';

export function filterSyncUrls(options, langs, urls) {
  const defaultSource = options['source.language']?.location || '/';

  return langs.reduce((acc, lang) => {
    const prefix = lang.source || defaultSource;

    // If the source prefix has already been set, skip
    // the URLs since they've already been added.
    if (acc[prefix]) return acc;

    const langUrlsToSync = urls.reduce((urlsAcc, { href }) => {
      const source = new DaUrl(href);
      const { aemPath } = source.supplied;

      if (!aemPath.startsWith(prefix)) {
        const destination = source.convertPrefix(langs, prefix);
        // Push the source and destination
        urlsAcc.push({ source, destination });
      }

      return urlsAcc;
    }, []);

    // If there are URLs to sync, set them
    if (urls.length) acc[prefix] = langUrlsToSync;

    return acc;
  }, {});
}

export function syncPath(source, destination) {
  return { source, destination };
}
