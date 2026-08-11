import { daFetch } from '../../../../../nx2/utils/api.js';
import { DA_ETC } from '../../../../../nx2/utils/utils.js';

// DA_ETC_ENVS has no 'stage' entry, so DA_ETC resolves to undefined in a
// dev-classified host (e.g. localhost without a ?da-etc= override) — fall
// back to the known-good production origin in that case.
const LOGIN_ORIGIN = DA_ETC || 'https://da-etc.adobeaem.workers.dev';
const TOKEN_BUFFER = 300000; // 5 min buffer before expiry

/**
 * Builds the localStorage key a token is cached under.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The Lionbridge environment (e.g. 'prod').
 * @returns {string} The cache key.
 */
function tokenKey(org, site, env) {
  return `lionbridge.${org}.${site}.${env}.token`;
}

/**
 * Reads a cached token, if any.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The Lionbridge environment (e.g. 'prod').
 * @returns {{accessToken?: string, expires?: number}} The cached details,
 *  or `{}` if none are stored.
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
 * Caches a token and its expiry.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The Lionbridge environment (e.g. 'prod').
 * @param {string} accessToken - The token to cache.
 * @param {number} expires - Epoch ms after which the token should be
 *  treated as expired.
 * @returns {void}
 */
function setTokenDetails(org, site, env, accessToken, expires) {
  localStorage.setItem(
    tokenKey(org, site, env),
    JSON.stringify({ accessToken, expires }),
  );
}

/**
 * Returns a valid Lionbridge access token, reusing a cached one if it
 * hasn't expired, otherwise logging in via da-etc.
 * @param {Object} service - The service configuration; reads `org`,
 *  `site`, and `env` (defaults to 'prod').
 * @returns {Promise<string|null>} The access token, or null on failure.
 */
export async function getAccessToken(service) {
  const { org, site, env = 'prod' } = service;

  const { accessToken: cached, expires: cachedExpires } = getTokenDetails(org, site, env);
  if (cached && cachedExpires > Date.now()) return cached;

  const opts = { method: 'POST' };

  const url = `${LOGIN_ORIGIN}/${org}/sites/${site}/integrations/lionbridge/login?env=${env}`;
  const resp = await daFetch({ url, opts });
  if (!resp.ok) return null;

  const { access_token: accessToken, expires_in: expiresIn } = await resp.json();
  if (!accessToken) return null;

  const expires = Date.now() + (expiresIn * 1000) - TOKEN_BUFFER;
  setTokenDetails(org, site, env, accessToken, expires);

  return accessToken;
}

/**
 * Determines if the service is authenticated to Lionbridge.
 * @param {Object} service - The service configuration.
 * @returns {Promise<boolean>} Whether a valid access token was obtained.
 */
export default async function authReady(service) {
  const accessToken = await getAccessToken(service);
  return !!accessToken;
}
