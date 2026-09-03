import { daFetch } from '../../../../nx2/utils/api.js';
import { DA_ETC } from '../../../../nx2/utils/utils.js';

/**
 * Exchanges a DA org/site's third-party service credentials - held
 * server-side by da-etc, never sent to the browser - for a fresh token via
 * da-etc's `/integrations/<service>/login` endpoint. The caller's own DA/IMS
 * session (attached by `daFetch`) is what authorizes the exchange, so no
 * secret ever reaches the browser.
 * @param {string} service - The da-etc integration name (e.g. 'trados', 'smartling').
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} [env] - The environment key (e.g. 'prod'); sent as a query param if given.
 * @returns {Promise<Object|null>} The parsed response body, or null on failure.
 */
export async function loginViaDaEtc(service, org, site, env) {
  const url = new URL(`${DA_ETC}/${org}/sites/${site}/integrations/${service}/login`);
  if (env) url.searchParams.set('env', env);

  const resp = await daFetch({ url: url.toString(), opts: { method: 'POST' } });
  if (!resp.ok) return null;
  return resp.json();
}

/**
 * Builds the localStorage key a connector caches its da-etc-issued token
 * under, scoped per org/site/env so different sites don't collide.
 * @param {string} service - The da-etc integration name (e.g. 'trados', 'smartling').
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @returns {string} The localStorage key.
 */
function tokenKey(service, org, site, env) {
  return `${service}.${org}.${site}.${env}.token`;
}

/**
 * Reads and JSON-parses a connector's cached token entry, tolerating
 * missing or corrupt values.
 * @param {string} service - The da-etc integration name (e.g. 'trados', 'smartling').
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @returns {Object} The parsed value, or `{}` if missing/invalid.
 */
export function getCachedToken(service, org, site, env) {
  const stored = localStorage.getItem(tokenKey(service, org, site, env));
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

/**
 * JSON-serializes and persists a connector's token details to localStorage.
 * @param {string} service - The da-etc integration name (e.g. 'trados', 'smartling').
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @param {Object} value - The value to persist.
 * @returns {void}
 */
export function setCachedToken(service, org, site, env, value) {
  localStorage.setItem(tokenKey(service, org, site, env), JSON.stringify(value));
}
