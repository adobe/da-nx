import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import fetchWithRetry from '../../utils/fetchWithRetry.js';
import { login, getCachedToken, setCachedToken } from '../../utils/auth.js';

const INTEGRATION_NAME = 'smartling';
const FALLBACK_EXPIRES_IN_S = 280; // used only if the API response omits expiresIn
const REFRESH_BUFFER_MS = 5000; // refresh this long before the token actually expires
const MIN_REFRESH_DELAY_MS = 2000; // never schedule a refresh sooner than this
const BASE_OPTS = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
};

// translate.da.live's legacy /smartling route is deprecated in favor of
// /translate/smartling/<org>/<site> - rewrite configs still pointing at the
// old origin so they keep working without a config migration.
export function resolveOrigin(origin, org, site) {
  return origin === `${DA_TRANSLATE}/smartling`
    ? `${DA_TRANSLATE}/translate/smartling/${org}/${site}`
    : origin;
}

let tokenPolling;
// Retained so a failed refresh can fall back to a full re-authentication via
// da-etc: Smartling caps a token pair's session at 12 hours regardless of how
// many times it's refreshed, so refreshes eventually start failing even
// though da-etc's held credentials still work.
let authContext;

/**
 * Reads the currently cached access token, if any - the single source of
 * truth for what's valid right now, kept current by the proactive refresh
 * schedule and by `onUnauthorized`'s reactive recovery.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @returns {string|undefined} The cached access token, if any.
 */
export function getToken(org, site, env) {
  return getCachedToken(INTEGRATION_NAME, org, site, env).accessToken;
}

/**
 * Exchanges the org/site's Smartling credentials - held server-side by
 * da-etc, never sent to the browser - for a fresh access/refresh token pair.
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
 * working (Smartling caps a token pair's session at 12 hours regardless of
 * how many times it's refreshed). Persists the new token, but leaves
 * rescheduling the next proactive refresh to the caller - used both by the
 * proactive schedule below and reactively via `onUnauthorized` when a
 * request 401s before that schedule catches up (e.g. the tab was
 * backgrounded and its timers were throttled).
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
 * Schedules a token refresh shortly before the current token expires,
 * tracking Smartling's actual reported `expiresIn` instead of assuming a
 * constant lifetime (that value shrinks as a session nears its 12-hour
 * cap). Only stops rescheduling once `refreshOrReauthenticate` fails
 * outright, so a translation job that outlives several sessions keeps
 * working without user intervention.
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
      // Both refresh and re-authentication failed - stop polling rather than
      // hammering the API forever with credentials that no longer work.
      tokenPolling = undefined;
      return;
    }
    scheduleRefresh(refreshed.expiresIn);
  }, delay);
}

/**
 * Builds a `fetchWithRetry` `onUnauthorized` callback: refreshes (or
 * re-authenticates) the token, reschedules the next proactive refresh
 * against the new expiry, and rebuilds `opts` with a fresh Authorization
 * header - so a 401, e.g. from a token that expired while the tab was
 * backgrounded before the proactive refresh above could run, triggers
 * exactly one retry with a valid token instead of failing the request
 * outright.
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
 * exists (resuming background refresh scheduling, e.g. after a page
 * reload), otherwise authenticates via da-etc - which holds the org/site's
 * Smartling credentials server-side and only ever returns a short-lived
 * access/refresh token pair, so no secret reaches the browser. Matches
 * Trados/Lionbridge's `authReady`: connecting is transparent, with no
 * separate manual step required.
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
    // Only (re)arm the schedule if it isn't already running, so repeated
    // calls against an already-connected session don't stack timers.
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
