import { daFetch } from '../../../../nx2/utils/api.js';
import { DA_ETC } from '../../../../nx2/utils/utils.js';

// DA_ETC_ENVS has no 'stage' entry, so DA_ETC resolves to undefined in a
// dev-classified host (e.g. localhost without a ?da-etc= override) - fall
// back to the known-good production origin in that case.
export const LOGIN_ORIGIN = DA_ETC || 'https://da-etc.adobeaem.workers.dev';

const TOKEN_BUFFER = 300000; // 5 min buffer before expiry

/**
 * Builds the localStorage key a token is cached under.
 * @param {string} name - Cache-key prefix identifying the connector
 *  (e.g. 'trados', 'lionbridge').
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The connector environment (e.g. 'prod').
 * @returns {string} The cache key.
 */
function tokenKey(name, org, site, env) {
  return `${name}.${org}.${site}.${env}.token`;
}

/**
 * Reads a cached token, if any.
 * @param {string} name - Cache-key prefix identifying the connector.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The connector environment (e.g. 'prod').
 * @returns {{accessToken?: string, expires?: number}} The cached details,
 *  or `{}` if none are stored.
 */
function getTokenDetails(name, org, site, env) {
  const stored = localStorage.getItem(tokenKey(name, org, site, env));
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

/**
 * Caches a token and its expiry.
 * @param {string} name - Cache-key prefix identifying the connector.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The connector environment (e.g. 'prod').
 * @param {string} accessToken - The token to cache.
 * @param {number} expires - Epoch ms after which the token should be
 *  treated as expired.
 * @returns {void}
 */
function setTokenDetails(name, org, site, env, accessToken, expires) {
  localStorage.setItem(
    tokenKey(name, org, site, env),
    JSON.stringify({ accessToken, expires }),
  );
}

/**
 * Builds the da-etc login URL for a connector integration. da-etc reads
 * `env` from the query string generically for every integration
 * (`intRoute` in da-etc's own routes/ints.js defaults it server-side to
 * 'prod' only when omitted), so this always sends it explicitly rather
 * than relying on that default.
 * @param {string} name - The da-etc integration name (e.g. 'trados').
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The connector environment.
 * @returns {string} The login URL.
 */
function loginUrl(name, org, site, env) {
  return `${LOGIN_ORIGIN}/${org}/sites/${site}/integrations/${name}/login?env=${env}`;
}

/**
 * Returns a valid access token for a da-etc-backed connector login flow,
 * reusing a cached one if it hasn't expired, otherwise logging in.
 * Trados and Lionbridge both authenticate this way - the integration
 * name is the only real difference between them, and it's already
 * needed as the cache-key prefix, so callers don't need to supply
 * anything else connector-specific.
 * @param {string} name - Cache-key prefix and da-etc integration name
 *  (e.g. 'trados', 'lionbridge').
 * @param {Object} service - The service configuration; reads `org`,
 *  `site`, and `env` (defaults to 'prod').
 * @returns {Promise<string|null>} The access token, or null on failure.
 */
export async function getAccessToken(name, service) {
  const { org, site, env = 'prod' } = service;

  const { accessToken: cached, expires: cachedExpires } = getTokenDetails(name, org, site, env);
  if (cached && cachedExpires > Date.now()) return cached;

  const opts = { method: 'POST' };
  const resp = await daFetch({ url: loginUrl(name, org, site, env), opts });
  if (!resp.ok) return null;

  const { access_token: accessToken, expires_in: expiresIn } = await resp.json();
  if (!accessToken) return null;

  const expires = Date.now() + (expiresIn * 1000) - TOKEN_BUFFER;
  setTokenDetails(name, org, site, env, accessToken, expires);

  return accessToken;
}

/**
 * Determines if a da-etc-backed connector is currently authenticated.
 * @param {string} name - Cache-key prefix and da-etc integration name
 *  (e.g. 'trados', 'lionbridge').
 * @param {Object} service - The service configuration.
 * @returns {Promise<boolean>} Whether a valid access token was obtained.
 */
export default async function authReady(name, service) {
  const accessToken = await getAccessToken(name, service);
  return !!accessToken;
}
