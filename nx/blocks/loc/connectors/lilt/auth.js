import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import {
  checkConnection, hasImsSession, imsAccessToken, imsAuthHeader,
} from '../../utils/auth.js';

const INTEGRATION_NAME = 'lilt';
// Tells the proxy which da-etc env to resolve the Lilt key from; it never reaches the browser.
const ENV_HEADER = 'x-translate-env';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Builds the DA_TRANSLATE proxy origin for this org/site.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {string|null} The proxy origin, or null if org/site aren't known yet.
 */
export function resolveOrigin(service) {
  const { org, site } = service || {};
  if (!org || !site) return null;
  return `${DA_TRANSLATE}/translate/lilt/${org}/${site}`;
}

/**
 * Builds the IMS and env headers the proxy requires, plus any request-specific headers.
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
 * Builds the `fetchWithRetry` config for a Lilt request. Empty: the key is resolved
 * server-side, so there is no credential to refresh on a 401.
 * @returns {Object} The `fetchWithRetry` config.
 */
export function retryConfig() {
  return {};
}

/**
 * Checks that an IMS session exists and da-etc reports a working Lilt key.
 * Never triggers sign-in, so it is safe to call from polling loops.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Promise<boolean>} Whether Lilt is connected.
 */
export async function isConnected(service) {
  const { org, site, env = 'prod' } = service || {};
  if (!org || !site || !(await hasImsSession())) return false;

  return checkConnection(INTEGRATION_NAME, org, site, env);
}

/**
 * User-initiated connect: prompts IMS sign-in if needed, then checks the connection.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Promise<boolean>} Whether Lilt is connected.
 */
export async function connect(service) {
  await imsAccessToken();
  return isConnected(service);
}
