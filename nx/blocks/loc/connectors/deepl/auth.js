import { daFetch } from '../../../../../nx2/utils/api.js';
import { DA_ETC } from '../../../../../nx2/utils/utils.js';

const TOKEN_BUFFER_MS = 300000; // 5 min buffer

/**
 * Builds the localStorage key used to cache a site's DeepL API key or token.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The selected environment.
 * @returns {string} The localStorage key.
 */
function tokenKey(org, site, env) {
  return `deepl.${org}.${site}.${env}.key`;
}

/**
 * Reads cached key details from localStorage.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The selected environment.
 * @returns {{apiKey?: string, expires?: number}}
 */
function getKeyDetails(org, site, env) {
  const stored = localStorage.getItem(tokenKey(org, site, env));
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

/**
 * Persists an API key/token to localStorage.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The selected environment.
 * @param {string} apiKey - The DeepL API key.
 * @param {number} [expires] - Optional expiry timestamp.
 */
function setKeyDetails(org, site, env, apiKey, expires) {
  localStorage.setItem(
    tokenKey(org, site, env),
    JSON.stringify({ apiKey, expires }),
  );
}

/**
 * Retrieves the DeepL API Key. Checks in order:
 * 1. Explicit service config (apiKey / authKey / token)
 * 2. Cached value in localStorage
 * 3. da-etc backend integration endpoint
 * @param {object} service - The service configuration object.
 * @returns {Promise<string|null>} The API key or null.
 */
export async function getApiKey(service = {}) {
  const explicitKey = service.apiKey
    || service.authKey
    || service.key
    || service.token
    || service['api.key']
    || service['auth.key'];
  if (explicitKey) return explicitKey;

  const { org, site, env = 'prod' } = service;
  if (org && site) {
    const { apiKey: cached, expires } = getKeyDetails(org, site, env);
    if (cached && (!expires || expires > Date.now())) return cached;

    const opts = { method: 'POST' };
    const url = `${DA_ETC}/${org}/sites/${site}/integrations/deepl/login?env=${env}`;

    const resp = await daFetch({ url, opts }).catch(() => null);
    if (resp?.ok) {
      const json = await resp.json().catch(() => ({}));
      const key = json.apiKey || json.api_key || json.access_token || json.token;
      if (key) {
        const expiresIn = Number(json.expires_in) || 0;
        const expiry = expiresIn ? Date.now() + (expiresIn * 1000) - TOKEN_BUFFER_MS : undefined;
        setKeyDetails(org, site, env, key, expiry);
        return key;
      }
    }
  }

  return null;
}

/**
 * Checks whether a usable DeepL authentication credential is available.
 * @param {object} service - The service config.
 * @returns {Promise<boolean>}
 */
export default async function authReady(service) {
  const apiKey = await getApiKey(service);
  return !!apiKey;
}

export function isConnected(service) {
  return authReady(service);
}

export function connect(service) {
  return authReady(service);
}
