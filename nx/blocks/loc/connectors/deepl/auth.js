import { checkConnection, hasImsSession, imsAccessToken } from '../../utils/auth.js';

const INTEGRATION_NAME = 'deepl';

/**
 * Checks that an IMS session exists and da-etc reports a working DeepL key. Never triggers
 * sign-in, so it is safe to call from polling loops.
 * @param {object} service - The service config.
 * @returns {Promise<boolean>} Whether the connector is ready.
 */
export async function isConnected(service) {
  const { org, site, env = 'prod' } = service || {};
  if (!org || !site || !(await hasImsSession())) return false;
  return checkConnection(INTEGRATION_NAME, org, site, env);
}

/**
 * User-initiated connect: prompts IMS sign-in if needed, then checks the connection.
 * @param {object} service - The service config.
 * @returns {Promise<boolean>} Whether the connector is ready.
 */
export async function connect(service) {
  await imsAccessToken();
  return isConnected(service);
}
