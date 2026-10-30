import { getAccessToken, imsAccessToken } from '../../utils/auth.js';

const INTEGRATION_NAME = 'deepl';

/**
 * Checks whether there is a currently valid DeepL credential (fetching one via da-etc if
 * needed) and a valid IMS session (DA_TRANSLATE requires both - every call routes through
 * its proxy).
 * @param {object} service - The service config.
 * @returns {Promise<boolean>}
 */
export default async function authReady(service) {
  const [apiKey, imsToken] = await Promise.all([
    getAccessToken(INTEGRATION_NAME, service),
    imsAccessToken(),
  ]);
  return !!apiKey && !!imsToken;
}

export function isConnected(service) {
  return authReady(service);
}

export function connect(service) {
  return authReady(service);
}
