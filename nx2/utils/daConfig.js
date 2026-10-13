import { config } from './api.js';
import { getFirstSheet } from './utils.js';

// Kept here for existing importers; lives in utils.js so callers can use it without api.js.
export { getFirstSheet };

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

export async function isEditorPreviewEnabled({ org, site }) {
  try {
    const configs = await Promise.all(fetchDaConfigs({ org, site }));
    const rows = configs.flatMap((json) => getFirstSheet(json) ?? []);
    const row = rows.findLast((r) => r.key === 'editor.preview');
    return String(row?.value ?? '').trim().toLowerCase() !== 'false';
  } catch {
    return true;
  }
}
