import { getAccessToken } from '../../utils/auth.js';

const INTEGRATION_NAME = 'deepl';

/**
 * Retrieves the DeepL API Key / token. Checks explicit service config first,
 * then delegates to shared da-etc auth util.
 * @param {object} service - The service configuration object.
 * @returns {Promise<string|null>} The API key/token or null.
 */
export async function getApiKey(service = {}) {
  const explicitKey = service.apiKey
    || service.authKey
    || service.key
    || service.token
    || service['api.key']
    || service['auth.key'];
  if (explicitKey) return explicitKey;

  return getAccessToken(INTEGRATION_NAME, service);
}

/**
 * Checks whether there is a currently valid DeepL credential (fetching one via da-etc if
 * needed).
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
