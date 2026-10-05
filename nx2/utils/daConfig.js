import { config } from './api.js';

export const getSheetByIndex = (json, index = 0) => {
  if (json[':type'] !== 'multi-sheet') {
    return json.data;
  }
  return json[Object.keys(json)[index]]?.data;
};

export const getSheetByName = (json, name) => {
  if (json[':type'] !== 'multi-sheet') {
    return json[':sheetname'] === name ? json.data : undefined;
  }
  return json[name]?.data;
};

export const getFirstSheet = (json) => getSheetByIndex(json, 0);

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

  // Unlike da-live, failed responses are evicted so the next call retries.
  const cacheConfig = (key, org, site) => {
    configCache[key] = fetchConfig(org, site).then((result) => {
      if (result.error) delete configCache[key];
      return result;
    });
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
