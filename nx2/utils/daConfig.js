import { DA_ORIGIN, daFetch } from './daFetch.js';

/** Returns the primary data array from a DA config JSON response (handles multi-sheet). */
export function getFirstSheet(json) {
  if (json[':type'] !== 'multi-sheet') return json.data;
  return json[Object.keys(json)[0]]?.data;
}

/** Memoized fetches for `/{org}` and optional `/{org}/{site}` config documents. */
export const fetchDaConfigs = (() => {
  const cache = {};

  const fetchConfig = async (pathname) => {
    const resp = await daFetch(`${DA_ORIGIN}/config${pathname}/`);
    if (!resp.ok) return { error: `Error loading ${pathname}`, status: resp.status };
    return resp.json();
  };

  return ({ org, site }) => {
    cache[`/${org}`] ??= fetchConfig(`/${org}`);

    if (site) {
      cache[`/${org}/${site}`] ??= fetchConfig(`/${org}/${site}`);
    }

    const configs = [cache[`/${org}`]];
    if (site) configs.push(cache[`/${org}/${site}`]);
    return configs;
  };
})();
