/**
 * API Loader - Conditionally load nx or nx2 APIs based on host mode
 *
 * Plugin mode: Uses old nx/utils/daFetch.js which supports setImsDetails(token)
 *              for SDK token injection from parent window
 * App mode: Uses nx2/utils/api.js with modern IMS flow
 */

import { isMediaLibraryPluginMode } from './utils.js';

const DA_ADMIN = 'https://admin.da.live';

let apiCache = null;

/**
 * Load appropriate API implementation based on host mode (memoized)
 * @returns {Promise<{source, fromPath, daFetch}>}
 */
async function loadApi() {
  if (apiCache) return apiCache;

  const promise = (async () => {
    if (isMediaLibraryPluginMode()) {
      // Plugin mode: use old nx with SDK token injection support
      const { daFetch: nxDaFetch } = await import('../../../utils/daFetch.js');

      return {
        source: {
          get: async ({ org, site, path }) => {
            const url = `${DA_ADMIN}/source/${org}/${site}${path}`;
            return nxDaFetch(url);
          },
          list: async ({ org, site, path }) => {
            const url = `${DA_ADMIN}/list/${org}/${site}${path || ''}`;
            const resp = await nxDaFetch(url);

            // Transform to match nx2 response format
            if (resp.ok) {
              const data = await resp.json();
              return {
                ok: true,
                status: resp.status,
                permissions: resp.permissions,
                headers: resp.headers,
                json: async () => data,
              };
            }
            return resp;
          },
          save: async ({ org, site, path, body }) => {
            const url = `${DA_ADMIN}/source/${org}/${site}${path}`;
            return nxDaFetch(url, { method: 'POST', body });
          },
        },
        fromPath: (str) => {
          const [, org, site, ...parts] = str.split('/');
          return { org, site, path: parts.length ? `/${parts.join('/')}` : '' };
        },
        // Adapt old nx daFetch(url, opts) to nx2 daFetch({ url, opts })
        daFetch: async ({ url, opts }) => nxDaFetch(url, opts),
      };
    }

    // App mode: use nx2
    // eslint-disable-next-line import/no-unresolved
    return import('../../../../nx2/utils/api.js');
  })();

  apiCache = promise;
  return promise;
}

// Export lazy-loading wrappers that match nx2 API
export const source = {
  get: async (params) => {
    const api = await loadApi();
    return api.source.get(params);
  },
  list: async (params) => {
    const api = await loadApi();
    return api.source.list(params);
  },
  save: async (params) => {
    const api = await loadApi();
    return api.source.save(params);
  },
};

export async function fromPath(str) {
  const api = await loadApi();
  return api.fromPath(str);
}

export async function daFetch(...args) {
  const api = await loadApi();
  return api.daFetch(...args);
}
