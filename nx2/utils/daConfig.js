import { config } from './api.js';

/** Returns the primary data array from a DA config JSON response (handles multi-sheet). */
export function getFirstSheet(json) {
  if (json[':type'] !== 'multi-sheet') return json.data;
  return json[json[':names']?.[0]]?.data;
}

/** Returns the named sheet's data array from a DA config JSON response (handles multi-sheet). */
export function getSheetByName(json, name) {
  if (json[':type'] !== 'multi-sheet') {
    return json[':sheetname'] === name ? json.data : undefined;
  }
  return json[name]?.data;
}

/** Memoized fetches for `/{org}` and optional `/{org}/{site}` config documents. */
export const fetchDaConfigs = (() => {
  const cache = {};

  const fetchConfig = async (key, org, site) => {
    const resp = await config.get({ org, site });
    if (!resp.ok) return { error: `Error loading ${key}`, status: resp.status };
    return resp.json();
  };

  const cacheConfig = (key, org, site) => {
    cache[key] = fetchConfig(key, org, site).then((result) => {
      if (result.error) delete cache[key];
      return result;
    });
    return cache[key];
  };

  return ({ org, site }) => {
    const orgKey = `/${org}`;
    const siteKey = site ? `/${org}/${site}` : null;

    const configs = [cache[orgKey] ?? cacheConfig(orgKey, org, undefined)];
    if (siteKey) configs.push(cache[siteKey] ?? cacheConfig(siteKey, org, site));
    return configs;
  };
})();
