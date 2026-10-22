import { config } from './api.js';
import { getFirstSheet } from './utils.js';

// Kept here for existing importers; lives in utils.js so callers can use it without api.js.
export { getFirstSheet };

/**
 * Fetches org and (optionally) site configs, caching the in-flight/resolved
 * promises by path so repeated calls for the same org/site reuse one request
 * instead of firing duplicate fetches.
 * @param {object} params
 * @param {string} params.org - The org to fetch config for.
 * @param {string} [params.site] - The site to also fetch config for.
 * @returns {Promise[]} `[orgConfigPromise]`, or `[orgConfigPromise, siteConfigPromise]`
 *   when `site` is given; `[Promise.resolve(null)]` when `org` is missing.
 */
export const fetchDaConfigs = (() => {
  const configCache = {};

  const fetchConfig = async (org, site) => {
    const resp = await config.get({ org, site });
    const pathname = site ? `/${org}/${site}` : `/${org}`;
    if (!resp.ok) return { error: `Error loading ${pathname}`, status: resp.status };
    return resp.json();
  };

  // Failed responses are evicted so the next call retries.
  const cacheConfig = (key, org, site) => {
    configCache[key] = fetchConfig(org, site).then(
      (result) => {
        if (result.error) delete configCache[key];
        return result;
      },
      (error) => {
        delete configCache[key];
        throw error;
      },
    );
    return configCache[key];
  };

  return ({ org, site }) => {
    if (!org) return [Promise.resolve(null)];

    // Set the org config promise if it does not exist
    configCache[`/${org}`] ??= cacheConfig(`/${org}`, org);

    if (site) {
      // Set the site config promise if it does not exist
      configCache[`/${org}/${site}`] ??= cacheConfig(`/${org}/${site}`, org, site);
    }

    // return array of cached configs (org = 0, site = 1)
    const configs = [configCache[`/${org}`]];
    if (site) configs.push(configCache[`/${org}/${site}`]);

    return configs;
  };
})();

/** Config value for `key`, site overriding org. Undefined if missing or unloadable. */
export async function getConfigValue({ org, site, key }) {
  try {
    const configs = await Promise.all(fetchDaConfigs({ org, site }));
    const rows = configs.flatMap((json) => getFirstSheet(json) ?? []);
    return rows.findLast((row) => row.key === key)?.value;
  } catch {
    return undefined;
  }
}
