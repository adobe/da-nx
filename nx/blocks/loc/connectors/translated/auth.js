import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import { checkConnection, imsAccessToken, imsAuthHeader } from '../../utils/auth.js';

const INTEGRATION_NAME = 'translated';
// Selects the da-etc environment bucket the proxy resolves the Translated API key from.
const ENV_HEADER = 'x-translate-env';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

/**
 * Builds the DA_TRANSLATE proxy origin for this org/site. Translated has one fixed
 * upstream, so no origin header is needed.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {string|null} The proxy origin, or null if org/site aren't known yet.
 */
export function resolveOrigin(service) {
  const { org, site } = service || {};
  if (!org || !site) return null;
  return `${DA_TRANSLATE}/translate/${INTEGRATION_NAME}/${org}/${site}`;
}

/**
 * Builds the header set for a Translated request: the IMS header the proxy requires and the
 * env header it uses to resolve the API key server-side. The key never reaches the browser.
 * @param {Object} service - The flattened per-environment service config.
 * @param {Object} [extraHeaders] - Additional headers to merge in.
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
 * Builds the `fetchWithRetry` config. A no-op: the key is resolved server-side on every
 * request, so there is no browser credential to refresh on a 401.
 * @returns {Object} The `fetchWithRetry` config.
 */
export function retryConfig() {
  return {};
}

/**
 * Checks whether Translated is connected: da-etc reports an API key for this org/site/env
 * and an IMS access token (required by the proxy) is present.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Promise<boolean>} Whether Translated is connected.
 */
export async function isConnected(service) {
  const { org, site, env = 'prod' } = service || {};
  if (!org || !site) return false;

  const [ready, imsToken] = await Promise.all([
    checkConnection(INTEGRATION_NAME, org, site, env),
    imsAccessToken(),
  ]);
  return ready && !!imsToken;
}

/**
 * Establishes the connection; identical to {@link isConnected} for a static key.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Promise<boolean>} Whether Translated is connected.
 */
export function connect(service) {
  return isConnected(service);
}
