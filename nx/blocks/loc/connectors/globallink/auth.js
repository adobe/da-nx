import { daFetch } from '../../../../../nx2/utils/api.js';
import { DA_ETC } from '../../../../../nx2/utils/utils.js';

const TOKEN_BUFFER_MS = 300000; // 5 min buffer before expiry

/**
 * Builds the localStorage key used to cache a site's GlobalLink access token.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The selected environment.
 * @returns {string} The localStorage key.
 */
function tokenKey(org, site, env) {
  return `globallink.${org}.${site}.${env}.token`;
}

/**
 * Reads the cached access token for a site/environment from localStorage.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The selected environment.
 * @returns {{accessToken?: string, expires?: number}} The cached token details, or an
 * empty object if none are stored or the stored value is invalid JSON.
 */
function getTokenDetails(org, site, env) {
  const stored = localStorage.getItem(tokenKey(org, site, env));
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

/**
 * Persists an access token for a site/environment to localStorage.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The selected environment.
 * @param {string} accessToken - The GlobalLink access token.
 * @param {number} expires - The epoch millisecond timestamp the token should be
 * treated as expired by (already adjusted by {@link TOKEN_BUFFER_MS}).
 * @returns {void}
 */
function setTokenDetails(org, site, env, accessToken, expires) {
  localStorage.setItem(
    tokenKey(org, site, env),
    JSON.stringify({ accessToken, expires }),
  );
}

/**
 * Fetches (and caches) a GlobalLink access token. The OAuth exchange itself happens
 * server-side in da-etc — the client secret and the GlobalLink user's password never
 * reach the browser; this only ever sends the browser's own DA session auth.
 * @param {object} service - The flattened per-environment service config.
 * @param {string} service.org - The DA org.
 * @param {string} service.site - The DA site.
 * @param {string} [service.env] - The selected environment (defaults to `'prod'`).
 * @returns {Promise<string|null>} The access token, or `null` if login failed.
 */
export async function getAccessToken(service) {
  const { org, site, env = 'prod' } = service;

  const { accessToken: cached, expires: cachedExpires } = getTokenDetails(org, site, env);
  if (cached && cachedExpires > Date.now()) return cached;

  const opts = { method: 'POST' };
  const url = `${DA_ETC}/${org}/sites/${site}/integrations/globallink/login?env=${env}`;

  const resp = await daFetch({ url, opts });
  if (!resp.ok) return null;

  const { access_token: accessToken, expires_in: expiresIn } = await resp.json();
  if (!accessToken) return null;

  const expires = Date.now() + ((Number(expiresIn) || 0) * 1000) - TOKEN_BUFFER_MS;
  setTokenDetails(org, site, env, accessToken, expires);

  return accessToken;
}

/**
 * Checks whether a usable GlobalLink access token is available, fetching one via
 * da-etc if needed.
 * @param {object} service - The flattened per-environment service config.
 * @returns {Promise<boolean>} Whether a valid access token is available.
 */
export default async function authReady(service) {
  const accessToken = await getAccessToken(service);
  return !!accessToken;
}
