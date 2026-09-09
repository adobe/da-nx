import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import fetchWithRetry from '../../utils/fetchWithRetry.js';
import { login, getCachedToken, setCachedToken } from '../../utils/auth.js';

// See docs/loc-smartling-auth.md for the token lifecycle this module implements.

const INTEGRATION_NAME = 'smartling';
const FALLBACK_EXPIRES_IN_S = 280; // used only if the API response omits expiresIn
const REFRESH_BUFFER_MS = 5000; // refresh this long before the token actually expires
const MIN_REFRESH_DELAY_MS = 2000; // never schedule a refresh sooner than this
export const BASE_OPTS = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
};

/**
 * Rewrites the deprecated legacy /smartling origin to the current route.
 * @param {string} origin - The configured API origin.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @returns {string} The resolved origin.
 */
export function resolveOrigin(origin, org, site) {
  return origin === `${DA_TRANSLATE}/smartling`
    ? `${DA_TRANSLATE}/translate/smartling/${org}/${site}`
    : origin;
}

let tokenPolling;
let authContext;

/**
 * Reads the currently cached access token, if any.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @returns {string|undefined} The cached access token, if any.
 */
export function getToken(org, site, env) {
  return getCachedToken(INTEGRATION_NAME, org, site, env).accessToken;
}

/**
 * Exchanges the org/site's Smartling credentials, held by da-etc, for a
 * fresh access/refresh token pair.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @returns {Promise<Object|null>} The response's `accessToken`,
 *  `refreshToken`, and `expiresIn`, or null on failure.
 */
async function authenticate(org, site, env) {
  const json = await login(INTEGRATION_NAME, org, site, env);
  return json?.response?.data || null;
}

/**
 * Persists the current access/refresh token pair plus a computed expiry to
 * localStorage.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @param {string} accessToken - The current access token.
 * @param {string} refreshToken - The current refresh token.
 * @param {number} [expiresInSecs] - Seconds until `accessToken` expires;
 *  falls back to `FALLBACK_EXPIRES_IN_S` if omitted.
 * @returns {void}
 */
function setTokenDetails(org, site, env, accessToken, refreshToken, expiresInSecs) {
  const timestamp = Date.now();
  const expiresInMs = (expiresInSecs ?? FALLBACK_EXPIRES_IN_S) * 1000;
  const expires = timestamp + expiresInMs;
  setCachedToken(INTEGRATION_NAME, org, site, env, { accessToken, refreshToken, expires });
}

/**
 * Refreshes the current access token, falling back to a full
 * re-authentication via da-etc if the refresh token itself has stopped
 * working. Persists the new token; leaves rescheduling the next proactive
 * refresh to the caller.
 * @returns {Promise<{accessToken: string, expiresIn: number}|null>} The
 *  new token details, or null if both the refresh and the fallback
 *  re-authentication failed.
 */
async function refreshOrReauthenticate() {
  const { endpoint, org, site, env } = authContext;
  const { refreshToken: currRefreshToken } = getCachedToken(INTEGRATION_NAME, org, site, env);

  const body = JSON.stringify({ refreshToken: currRefreshToken });
  const opts = { ...BASE_OPTS, body };
  const resp = await fetchWithRetry(`${endpoint}/auth-api/v2/authenticate/refresh`, opts);
  let data = resp.ok ? (await resp.json())?.response?.data : null;

  if (!data?.accessToken) data = await authenticate(org, site, env);
  if (!data?.accessToken) return null;

  const { accessToken, refreshToken, expiresIn } = data;
  setTokenDetails(org, site, env, accessToken, refreshToken, expiresIn);
  return { accessToken, expiresIn };
}

/**
 * Schedules a token refresh shortly before the current token expires.
 * @param {number} [expiresInSecs] - Seconds until the current token
 *  expires; falls back to `FALLBACK_EXPIRES_IN_S` if omitted.
 * @returns {void}
 */
function scheduleRefresh(expiresInSecs) {
  const expiresInMs = (expiresInSecs ?? FALLBACK_EXPIRES_IN_S) * 1000;
  const delay = Math.max(expiresInMs - REFRESH_BUFFER_MS, MIN_REFRESH_DELAY_MS);

  clearTimeout(tokenPolling);
  tokenPolling = setTimeout(async () => {
    const refreshed = await refreshOrReauthenticate();
    if (!refreshed) {
      tokenPolling = undefined;
      return;
    }
    scheduleRefresh(refreshed.expiresIn);
  }, delay);
}

/**
 * Builds a `fetchWithRetry` `onUnauthorized` callback: refreshes (or
 * re-authenticates) the token, reschedules the next proactive refresh, and
 * rebuilds `opts` with a fresh Authorization header.
 * @param {Object} opts - The fetch options to rebuild on success.
 * @returns {() => Promise<Object|null>} Callback for `fetchWithRetry`'s
 *  `onUnauthorized` config.
 */
export function onUnauthorized(opts) {
  return async () => {
    const refreshed = await refreshOrReauthenticate();
    if (!refreshed) return null;
    scheduleRefresh(refreshed.expiresIn);
    return { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${refreshed.accessToken}` } };
  };
}

/**
 * Ensures a connected session: reuses a still-valid cached token if one
 * exists, otherwise authenticates via da-etc.
 * @param {Object} config - The service configuration.
 * @param {string} config.origin - The configured API origin.
 * @param {string} config.env - The environment key (e.g. 'prod').
 * @param {string} config.org - The DA org.
 * @param {string} config.site - The DA site.
 * @returns {Promise<boolean>} Whether a connected session is available.
 */
async function ensureConnected(config) {
  const {
    origin, org, site, env,
  } = config;
  const endpoint = resolveOrigin(origin, org, site);
  const { expires } = getCachedToken(INTEGRATION_NAME, org, site, env);
  const notExpired = expires > Date.now();

  if (notExpired) {
    authContext = {
      endpoint, org, site, env,
    };
    // Guards against stacking timers on repeated calls.
    if (!tokenPolling) scheduleRefresh((expires - Date.now()) / 1000);
    return true;
  }

  const data = await authenticate(org, site, env);
  if (!data?.accessToken) return false;

  authContext = {
    endpoint, org, site, env,
  };
  const { accessToken, refreshToken, expiresIn } = data;
  setTokenDetails(org, site, env, accessToken, refreshToken, expiresIn);
  scheduleRefresh(expiresIn);
  return true;
}

export function isConnected(config) {
  return ensureConnected(config);
}

export function connect(service) {
  return ensureConnected(service);
}
