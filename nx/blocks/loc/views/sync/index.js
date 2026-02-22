import { fetchConfig } from '../../utils/utils.js';
import DaUrl from '../../utils/daUrl.js';

/**
 * Group URLs based on requested language source locations
 * @param {*} configLangs the langs available from the site's translation config
 * @param {*} options
 * @param {*} langs
 * @param {*} urls
 * @returns
 */
export async function getUrlSources({ org, site, options, langs, urls }) {
  // Fetch *all* language data from the site
  // to determine where URLs come from.
  const config = await fetchConfig(org, site);
  const { data: langData } = config.languages;

  const defaultSource = options['source.language']?.location || '/';

  return langs.reduce((sources, lang) => {
    const prefix = lang.source || defaultSource;

    // If the source prefix has already been setup, skip
    // the URLs since they've already been added.
    if (sources[prefix]) return sources;

    const sourceUrls = urls.reduce((acc, { href }) => {
      const source = new DaUrl(href);
      const { aemPath } = source.supplied;

      if (!aemPath.startsWith(prefix)) {
        const destination = source.convertPrefix(langData, prefix);
        // Push the source and destination
        acc.push({ source, destination });
      }

      return acc;
    }, []);

    if (sourceUrls.length) sources[prefix] = sourceUrls;

    return sources;
  }, {});
}

export function syncPath(source, destination) {
  return { source, destination };
}
