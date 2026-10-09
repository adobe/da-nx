import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import { checkConnection, imsAccessToken, imsAuthHeader } from '../../utils/auth.js';

const INTEGRATION_NAME = 'lilt';
// Tells the DA_TRANSLATE proxy which da-etc environment bucket to resolve the Lilt API
// key from - the key itself is a static, non-expiring secret, so (unlike every other
// connector here) it's resolved server-side per request rather than ever reaching the
// browser. See docs/lilt-connector.md.
const ENV_HEADER = 'x-translate-env';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Builds the DA_TRANSLATE proxy origin for this org/site. Unlike GlobalLink (whose real
 * endpoint is per-site configurable, requiring an `x-globallink-origin` header so the proxy
 * knows where to forward), Lilt only ever has one upstream (`https://api.lilt.com`), so no
 * origin header is needed here.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {string|null} The proxy origin, or null if org/site aren't known yet.
 */
export function resolveOrigin(service) {
  const { org, site } = service || {};
  if (!org || !site) return null;
  return `${DA_TRANSLATE}/translate/lilt/${org}/${site}`;
}

/**
 * Builds the full header set for a Lilt request: the IMS header the DA_TRANSLATE proxy
 * requires, the env header it uses to resolve the Lilt API key server-side, plus any
 * request-specific headers.
 * @param {Object} service - The flattened per-environment service config.
 * @param {Object} [extraHeaders] - Additional headers to merge in (e.g. JSON vs octet-stream).
 * @returns {Promise<Object>} The merged headers.
 */
export async function authHeaders(service, extraHeaders = JSON_HEADERS) {
  const { env = 'prod' } = service || {};
  return {
    ...(await imsAuthHeader()),
    [ENV_HEADER]: env,
    ...extraHeaders,
  };
}

/**
 * Builds the `fetchWithRetry` config for a Lilt request. There's nothing to recover from
 * on a 401 here - the Lilt API key is resolved server-side by DA_TRANSLATE on every
 * request, so the browser has no stale credential of its own to refresh - so this is a
 * no-op, leaving 401s to pass through like any other non-retryable response.
 * @returns {Object} The `fetchWithRetry` config.
 */
export function retryConfig() {
  return {};
}

/**
 * Checks whether Lilt is connected: da-etc reports a working Lilt API key for this
 * org/site/env, and the IMS access token (required by the DA_TRANSLATE proxy) is present.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Promise<boolean>} Whether Lilt is connected.
 */
export async function isConnected(service) {
  const { org, site, env = 'prod' } = service || {};
  if (!org || !site) return false;

  const [liltReady, imsToken] = await Promise.all([
    checkConnection(INTEGRATION_NAME, org, site, env),
    imsAccessToken(),
  ]);
  return liltReady && !!imsToken;
}

export function connect(service) {
  return isConnected(service);
}
