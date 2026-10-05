import { daFetch, loadIms, handleSignIn } from '../../../../nx2/utils/api.js';
import { DA_ETC } from '../../../../nx2/utils/utils.js';

// DA_ETC_ENVS has no 'stage' entry, so DA_ETC resolves to undefined in a
// dev-classified host (e.g. localhost without a ?da-etc= override) - fall
// back to the known-good production origin in that case.
export const LOGIN_ORIGIN = DA_ETC || 'https://da-etc.adobeaem.workers.dev';

const TOKEN_BUFFER = 300000; // 5 min buffer before expiry

/**
 * Builds the sessionStorage key a token is cached under.
 * @param {string} name - Cache-key prefix identifying the connector
 *  (e.g. 'trados', 'lionbridge', 'smartling').
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @returns {string} The localStorage key.
 */
function tokenKey(name, org, site, env) {
  return `${name}.${org}.${site}.${env}.token`;
}

/**
 * Reads and JSON-parses a connector's cached token entry, tolerating
 * missing or corrupt values.
 * @param {string} name - The da-etc integration name (e.g. 'trados', 'smartling').
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @returns {Object} The parsed value, or `{}` if missing/invalid.
 */
export function getCachedToken(name, org, site, env) {
  const stored = sessionStorage.getItem(tokenKey(name, org, site, env));
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

/**
 * JSON-serializes and persists a connector's token details to sessionStorage.
 * @param {string} name - The da-etc integration name (e.g. 'trados', 'smartling').
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @param {Object} value - The value to persist.
 * @returns {void}
 */
export function setCachedToken(name, org, site, env, value) {
  sessionStorage.setItem(tokenKey(name, org, site, env), JSON.stringify(value));
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
 * Exchanges a DA org/site's third-party service credentials - held
 * server-side by da-etc, never sent to the browser - for a fresh token via
 * da-etc's `/integrations/<name>/login` endpoint. The caller's own DA/IMS
 * session (attached by `daFetch`) is what authorizes the exchange, so no
 * secret ever reaches the browser. Returns the raw parsed response rather
 * than a normalized shape, since that varies by integration (Trados and
 * Lionbridge return a flat OAuth `access_token`/`expires_in` pair; Smartling
 * nests its own `accessToken`/`refreshToken`/`expiresIn` shape under
 * `response.data`).
 * @param {string} name - The da-etc integration name (e.g. 'trados', 'smartling').
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @returns {Promise<Object|null>} The parsed response body, or null on failure.
 */
export async function login(name, org, site, env) {
  const resp = await daFetch({ url: loginUrl(name, org, site, env), opts: { method: 'POST' } });
  if (!resp.ok) return null;
  return resp.json();
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
 * @param {Object} [options]
 * @param {boolean} [options.force] - Skip the cache and log in again even
 *  if a cached token hasn't reached its own expiry - for reactively
 *  recovering from a 401 the server considers stale (e.g. a revoked
 *  token, or clock skew) that the client's own check didn't catch.
 * @returns {Promise<string|null>} The access token, or null on failure.
 */
export async function getAccessToken(name, service, { force = false } = {}) {
  const { org, site, env = 'prod' } = service;

  if (!force) {
    const { accessToken: cached, expires: cachedExpires } = getCachedToken(name, org, site, env);
    if (cached && cachedExpires > Date.now()) return cached;
  }

  const data = await login(name, org, site, env);
  const { access_token: accessToken, expires_in: expiresIn } = data || {};
  if (!accessToken) return null;

  const expires = Date.now() + (expiresIn * 1000) - TOKEN_BUFFER;
  setCachedToken(name, org, site, env, { accessToken, expires });

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

/**
 * Checks whether an IMS session is currently available, without triggering the sign-in
 * flow if not - unlike {@link imsAccessToken}, safe to call repeatedly (e.g. from inside a
 * polling loop) without repeatedly invoking `handleSignIn()`.
 * @returns {Promise<boolean>} Whether a usable IMS access token is available.
 */
export async function hasImsSession() {
  const { accessToken } = await loadIms();
  return !!accessToken;
}

/**
 * Resolves the current IMS access token, mirroring how `daFetch` authenticates calls to
 * DA_TRANSLATE elsewhere (e.g. the Google connector). Connectors whose DA_TRANSLATE proxy
 * requires IMS auth (e.g. GlobalLink) use this instead of building their own IMS session
 * handling. Triggers the sign-in flow if no IMS session is available.
 * @returns {Promise<string|null>} The token, or `null` if no IMS session is available.
 */
export async function imsAccessToken() {
  const { accessToken } = await loadIms();
  if (!accessToken) {
    handleSignIn();
    return null;
  }
  return accessToken.token;
}

/**
 * Builds the Authorization header a DA_TRANSLATE proxy requires to gate access to a
 * connector's endpoint.
 * @returns {Promise<{Authorization?: string}>} The header to merge into the request, or
 * `{}` if no IMS token could be obtained.
 */
export async function imsAuthHeader() {
  const token = await imsAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
