import { source } from '../../../../../nx2/utils/api.js';

const CONFIG_PATH = '.da/translate.json';

/**
 * Fetches a site's raw `.da/translate.json` config document.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @returns {Promise<Object|null>} The parsed multi-sheet document, or null
 *  on failure.
 */
async function fetchRawConfig(org, site) {
  const resp = await source.get({ org, site, path: CONFIG_PATH });
  if (!resp.ok) return null;
  return resp.json();
}

/**
 * Writes a site's raw `.da/translate.json` config document back to DA.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {Object} json - The full document to write.
 * @returns {Promise<Response>} The raw fetch response.
 */
async function saveRawConfig(org, site, json) {
  return source.save({ org, site, path: CONFIG_PATH, body: JSON.stringify(json) });
}

/**
 * Returns this org/site/env's persistent Lionbridge connector GUID,
 * generating and persisting one to `.da/translate.json` on first use.
 *
 * Per Lionbridge's dev guidelines, a connector "installation" must be
 * identified by a GUID generated once and never regenerated. DA has no
 * installation step, so an org/site/env combination stands in for one:
 * the GUID is stored as `translation.service.{env}.connectorGuid` in the
 * site's config sheet (non-secret, alongside `apiEndpoint`/`providerId`),
 * so it is already present on `service` for every subsequent load and this
 * function only writes once. A concurrent first-use race between two
 * sessions could in theory produce two GUIDs — acceptable here since
 * Lionbridge only uses it for connector fingerprinting/support, not as a
 * security boundary.
 * @param {Object} service - Connector service config; mutated in place with
 *  `connectorGuid` once resolved.
 * @returns {Promise<string|null>} the GUID, or null if it could not be
 *  read or persisted.
 */
export async function getOrCreateConnectorGuid(service) {
  if (service.connectorGuid) return service.connectorGuid;

  const { org, site, env = 'prod' } = service;
  const key = `translation.service.${env}.connectorGuid`;

  const json = await fetchRawConfig(org, site);
  if (!json?.config?.data) return null;

  const existing = json.config.data.find((row) => row.key === key);
  if (existing?.value) {
    service.connectorGuid = existing.value;
    return existing.value;
  }

  const guid = crypto.randomUUID();
  json.config.data.push({ key, value: guid });
  json.config.total = json.config.data.length;
  json.config.limit = json.config.data.length;

  const saved = await saveRawConfig(org, site, json);
  if (!saved.ok) return null;

  service.connectorGuid = guid;
  return guid;
}
