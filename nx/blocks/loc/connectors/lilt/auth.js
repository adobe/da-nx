import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import authReady, {
  getAccessToken as getCachedAccessToken, imsAccessToken, imsAuthHeader,
} from '../../utils/auth.js';

const INTEGRATION_NAME = 'lilt';
const CREDENTIAL_HEADER = 'x-lilt-authorization';
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
 * Wraps a raw Lilt API key in the header Lilt expects (no `Bearer` prefix, unlike most
 * OAuth-style connectors).
 * @param {string} token - The raw Lilt API key.
 * @returns {Object} The header to merge into a request.
 */
function credentialHeader(token) {
  return { [CREDENTIAL_HEADER]: token };
}

/**
 * Builds the full header set for a Lilt request: the IMS header the DA_TRANSLATE proxy
 * requires, plus Lilt's own credential header, plus any request-specific headers.
 * @param {Object} service - The flattened per-environment service config.
 * @param {Object} [extraHeaders] - Additional headers to merge in (e.g. JSON vs octet-stream).
 * @returns {Promise<Object>} The merged headers.
 */
export async function authHeaders(service, extraHeaders = JSON_HEADERS) {
  const token = await getCachedAccessToken(INTEGRATION_NAME, service);
  return {
    ...(await imsAuthHeader()),
    ...credentialHeader(token),
    ...extraHeaders,
  };
}

/**
 * Builds a `fetchWithRetry` `onUnauthorized` callback: force-refreshes the cached Lilt API
 * key and rebuilds `opts.headers` with it, so a 401 (e.g. a revoked key) is recovered from
 * once rather than repeating the same stale request.
 * @param {Object} service - The flattened per-environment service config.
 * @param {Object} opts - The fetch options to rebuild headers for.
 * @returns {() => Promise<Object|null>} The `onUnauthorized` callback.
 */
export function onUnauthorized(service, opts) {
  return async () => {
    const token = await getCachedAccessToken(INTEGRATION_NAME, service, { force: true });
    if (!token) return null;
    return { ...opts, headers: { ...opts.headers, ...credentialHeader(token) } };
  };
}

/**
 * Builds the `fetchWithRetry` config for a Lilt request.
 * @param {Object} service - The flattened per-environment service config.
 * @param {Object} opts - The fetch options for the request being retried.
 * @returns {Object} The `fetchWithRetry` config.
 */
export function retryConfig(service, opts) {
  return { onUnauthorized: onUnauthorized(service, opts) };
}

/**
 * Checks whether Lilt is connected: the cached Lilt API key is ready, and the IMS access
 * token (required by the DA_TRANSLATE proxy) is present.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Promise<boolean>} Whether Lilt is connected.
 */
export async function isConnected(service) {
  const [liltReady, imsToken] = await Promise.all([
    authReady(INTEGRATION_NAME, service),
    imsAccessToken(),
  ]);
  return liltReady && !!imsToken;
}

export function connect(service) {
  return isConnected(service);
}
