import fetchWithRetry from '../../utils/fetchWithRetry.js';

export const BASE_OPTS = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
};

const PROXY_URL = 'https://da-etc.adobeaem.workers.dev/cors?url=';

/**
 * Fetches through da-etc's CORS proxy - Trados's API doesn't allow direct
 * browser CORS - retrying transient failures and, when `config.
 * onUnauthorized` is set, reactively refreshing an expired token on a 401.
 * @param {string} url - The upstream Trados API url (unproxied).
 * @param {Object} opts - Fetch options.
 * @param {Object} [config] - Forwarded to `fetchWithRetry` (e.g.
 *  `onUnauthorized`).
 * @returns {Promise<Response>} The final response (ok or not).
 */
export function corsFetch(url, opts, config) {
  const proxyUrl = `${PROXY_URL}${encodeURIComponent(url)}`;
  return fetchWithRetry(proxyUrl, opts, config);
}
