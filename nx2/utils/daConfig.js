import { DA_ADMIN } from './utils.js';
import { daFetch } from './api.js';

/** Returns the primary data array from a DA config JSON response (handles multi-sheet). */
export function getFirstSheet(json) {
  if (json[':type'] !== 'multi-sheet') return json.data;
  return json[Object.keys(json)[0]]?.data;
}

/** Memoized fetches for `/{org}` and optional `/{org}/{site}` config documents. */
export const fetchDaConfigs = (() => {
  const cache = {};

  const fetchConfig = async (pathname) => {
    const resp = await daFetch({ url: `${DA_ADMIN}/config${pathname}/` });
    if (!resp.ok) return { error: `Error loading ${pathname}`, status: resp.status };
    return resp.json();
  };

  const cacheConfig = (key) => {
    cache[key] = fetchConfig(key).then((result) => {
      if (result.error) delete cache[key];
      return result;
    });
    return cache[key];
  };

  return ({ org, site }) => {
    const orgKey = `/${org}`;
    const siteKey = site ? `/${org}/${site}` : null;

    const configs = [cache[orgKey] ?? cacheConfig(orgKey)];
    if (siteKey) configs.push(cache[siteKey] ?? cacheConfig(siteKey));
    return configs;
  };
})();
