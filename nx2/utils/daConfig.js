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
 *   when `site` is given (org config always comes from DA admin, even for hlx6 sites);
 *   `[Promise.resolve(null)]` when `org` is missing.
 */
export const fetchDaConfigs = (() => {
  const configCache = {};

  // Network/CORS (TypeError) and JSON (SyntaxError) failures resolve to
  // { error, status } rather than rejecting, so a failing org config can't drop
  // a valid site config in callers that Promise.all both. Other errors propagate.
  const isLoadError = (e) => e instanceof TypeError || e instanceof SyntaxError;

  const fetchConfig = async (org, site) => {
    const pathname = site ? `/${org}/${site}` : `/${org}`;
    const error = `Error loading ${pathname}`;
    let resp;
    try {
      resp = await config.get({ org, site });
    } catch (e) {
      if (isLoadError(e)) return { error, status: 0 };
      throw e;
    }
    if (!resp.ok) return { error, status: resp.status };
    try {
      return await resp.json();
    } catch (e) {
      if (isLoadError(e)) return { error, status: resp.status };
      throw e;
    }
  };

  // Failed responses are evicted so the next call retries.
  const cacheConfig = (key, org, site) => {
    configCache[key] = fetchConfig(org, site).then(
      (result) => {
        if (result?.error) delete configCache[key];
        return result;
      },
      (e) => {
        delete configCache[key];
        throw e;
      },
    );
    return configCache[key];
  };

  // Orgs have no hlx6 migration yet, so org config always comes from DA admin,
  // even when the site itself is hlx6.
  const fetchOrgConfig = (org) => {
    configCache[`/${org}`] ??= cacheConfig(`/${org}`, org);
    return configCache[`/${org}`];
  };

  return ({ org, site }) => {
    if (!org) return [Promise.resolve(null)];

    const orgConfig = fetchOrgConfig(org);

    if (site) {
      // Set the site config promise if it does not exist
      configCache[`/${org}/${site}`] ??= cacheConfig(`/${org}/${site}`, org, site);
    }

    // return array of cached configs (org = 0, site = 1)
    const configs = [orgConfig];
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
