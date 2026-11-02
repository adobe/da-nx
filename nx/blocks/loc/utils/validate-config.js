import { daFetch } from '../../../../nx2/utils/api.js';
import { normalizeLocation } from './utils.js';

const VALID_ACTIONS = ['translate', 'copy', 'rollout', 'skip'];
const DEFAULT_ENV = 'prod';
const SKIPPED_ENV_KEYS = ['name', 'all', 'key'];
const KEY_PATH = 'translation.service.key.path';

// Blocks path traversal in the dynamic connector import.
const CONNECTOR_NAME = /^[a-z0-9-]+$/;

const hasValue = (value) => String(value ?? '').trim() !== '';
const splitList = (value) => String(value ?? '').split(',').map((v) => v.trim()).filter(Boolean);

/**
 * Joins items into readable prose: "a", "a and b", "a, b, and c".
 * @param {string[]} items - Items to join.
 * @returns {string} Joined text.
 */
function joinList(items) {
  if (items.length < 3) return items.join(' and ');
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`;
}

/**
 * Converts a service display name to its connector directory name.
 * @param {string} name - Service name, e.g. "Global Link".
 * @returns {string} Connector directory name.
 */
export function getConnectorName(name) {
  return String(name ?? '').trim().toLowerCase().replaceAll(' ', '-');
}

/**
 * Flattens key/value rows into a map. Tolerates malformed rows.
 * @param {object[]} data - Sheet rows.
 * @returns {Object<string, string>} Key/value map.
 */
function rowsToMap(data) {
  const rows = Array.isArray(data) ? data : [];
  return rows.reduce((acc, row) => {
    if (row?.key) acc[String(row.key).trim()] = row.value;
    return acc;
  }, {});
}

/**
 * Flattens config sheet rows into a key/value map. Tolerates malformed rows.
 * @param {object} sheets - Config sheets.
 * @returns {Object<string, string>} Config map.
 */
function toConfigMap(sheets) {
  return rowsToMap(sheets?.config?.data);
}

/**
 * Groups "translation.service.{env}.{prop}" entries by env.
 * @param {Object<string, string>} map - Flattened key/value map.
 * @returns {Object<string, Object<string, string>>} Values per env.
 */
function toEnvs(map) {
  return Object.keys(map).reduce((envs, key) => {
    const match = key.match(/^translation\.service\.([^.]+)\.(.+)$/);
    if (!match || SKIPPED_ENV_KEYS.includes(match[1])) return envs;
    const [, env, prop] = match;
    envs[env] ??= {};
    envs[env][prop] = map[key];
    return envs;
  }, {});
}

/**
 * Checks that a service has a known connector and its required values.
 * @param {object} params
 * @param {string} params.name - Service name.
 * @param {Object<string, string>} [params.values] - Values for the selected env.
 * @param {string} [params.env] - Selected env, used in messages.
 * @param {boolean} [params.credentials] - Also check credential keys (config + key sheet values).
 * @returns {Promise<string[]>} Error messages.
 */
export async function validateServiceValues({
  name,
  values = {},
  env = DEFAULT_ENV,
  credentials = false,
}) {
  if (!hasValue(name)) return ['Translation service is not set. Add "translation.service.name" to the translate config.'];
  const connector = getConnectorName(name);
  const mod = CONNECTOR_NAME.test(connector)
    ? await import(`../connectors/${connector}/index.js`).catch(() => undefined)
    : undefined;
  if (!Array.isArray(mod?.requiredKeys)) {
    return [`Unknown translation service "${name}". Check "translation.service.name" in the translate config.`];
  }
  const missing = (keys) => keys.filter((key) => ![key].flat().some((k) => hasValue(values[k])));
  const label = (key) => [key].flat().map((k) => `translation.service.${env}.${k}`).join('" or "');
  const credentialKeys = credentials && Array.isArray(mod.requiredCredentialKeys)
    ? mod.requiredCredentialKeys : [];
  const absent = [...missing(mod.requiredKeys), ...missing(credentialKeys)];
  if (!absent.length) return [];
  return [`Translation service "${name}" is missing ${joinList(absent.map((key) => `"${label(key)}"`))}.`];
}

/**
 * Reads the key sheet referenced by "translation.service.key.path".
 * @param {string} keyPath - Key sheet URL.
 * @returns {Promise<{ map?: Object<string, string>, error?: string }>} Key map, or an error.
 */
async function fetchKeySheet(keyPath) {
  const fail = (detail) => ({ error: `Unable to read the service key sheet "${keyPath}" (${detail}). Check "${KEY_PATH}" and your access to it.` });
  try {
    const resp = await daFetch({ url: keyPath });
    if (!resp?.ok) return fail(`status ${resp?.status ?? 'unknown'}`);
    const json = await resp.json();
    return { map: rowsToMap(json?.data) };
  } catch {
    return fail('request failed or response is not valid JSON');
  }
}

/**
 * Validates the service config (name, env, required connector values, and key sheet).
 * @param {Object<string, string>} config - Flattened config map.
 * @returns {Promise<string[]>} Error messages.
 */
async function validateConnector(config) {
  const name = config['translation.service.name'];
  const envs = toEnvs(config);
  const keyPath = String(config[KEY_PATH] ?? '').trim();

  const envList = splitList(config['translation.service.all.env']);
  const env = envList[0] ?? DEFAULT_ENV;
  const errors = [];

  if (hasValue(name) && Object.keys(envs).length && envList.length) {
    const missing = envList.filter((e) => !SKIPPED_ENV_KEYS.includes(e) && !envs[e]);
    missing.forEach((e) => errors.push(`Environment "${e}" in "translation.service.all.env" has no "translation.service.${e}.*" values.`));
  }

  let keyValues = {};
  let keyReadable = true;
  if (keyPath) {
    const { map, error } = await fetchKeySheet(keyPath);
    keyReadable = !error;
    if (error) errors.push(error);
    else keyValues = toEnvs(map)[env] ?? {};
  }

  // The key sheet takes precedence over the config sheet, as at runtime.
  const values = { ...envs[env], ...keyValues };
  const serviceErrors = await validateServiceValues({
    name,
    values,
    env,
    credentials: keyReadable,
  });
  return [...errors, ...serviceErrors];
}

/**
 * Validates one language row's own fields (not cross-row checks).
 * @param {object} row - Language row.
 * @param {string} label - Row label, e.g. `Language "French"`.
 * @returns {string[]} Error messages.
 */
function validateRow(row, label) {
  const errors = [];
  const actions = splitList(row.actions);
  const missing = [
    !hasValue(row.name) && 'name',
    !hasValue(row.code) && 'code',
    !hasValue(row.location) && 'location',
    !actions.length && 'actions',
  ].filter(Boolean);
  if (missing.length) errors.push(`${label} is missing ${joinList(missing.map((f) => `"${f}"`))}.`);

  if (hasValue(row.location) && !String(row.location).trim().startsWith('/')) {
    errors.push(`${label} has location "${row.location}" that does not start with "/".`);
  }

  if (hasValue(row.source) && !String(row.source).trim().startsWith('/')) {
    errors.push(`${label} has source "${row.source}" that does not start with "/".`);
  }

  const unknown = actions.filter((a) => !VALID_ACTIONS.includes(a.toLowerCase()));
  if (unknown.length) {
    const noun = unknown.length > 1 ? 'actions' : 'action';
    errors.push(`${label} has unknown ${noun} ${joinList(unknown.map((a) => `"${a}"`))}. Valid actions: ${VALID_ACTIONS.join(', ')}.`);
  }
  return errors;
}

/**
 * Reports values shared by more than one row, one message per value.
 * @param {Map<string, { value: string, who: string[] }>} groups - Rows grouped by normalized value.
 * @param {string} field - Field name, e.g. "code".
 * @returns {string[]} Error messages.
 */
function reportDuplicates(groups, field) {
  return [...groups.values()]
    .filter(({ who }) => who.length > 1)
    .map(({ value, who }) => `Languages ${joinList(who)} share ${field} "${value}".`);
}

/**
 * Validates the language rows.
 * @param {object[]} rows - Language sheet rows.
 * @param {Object<string, string>} config - Flattened config map.
 * @returns {string[]} Error messages.
 */
function validateLanguages(rows, config) {
  if (!rows.length) return ['No languages are configured. Add rows to the "languages" sheet of the translate config.'];

  const errors = [];
  const names = new Set(rows.map((row) => String(row?.name ?? '').trim().toLowerCase()).filter(Boolean));
  // The options view matches "source language" by exact name, so this does too.
  const exactNames = new Set(rows.map((row) => row?.name).filter(Boolean));
  const groups = { code: new Map(), location: new Map() };
  const group = (field, key, value, who) => {
    const entry = groups[field].get(key) ?? { value, who: [] };
    entry.who.push(who);
    groups[field].set(key, entry);
  };

  rows.forEach((row, idx) => {
    const label = hasValue(row?.name) ? `Language "${String(row.name).trim()}"` : `Language row ${idx + 1}`;
    if (!row || typeof row !== 'object') {
      errors.push(`${label} is not valid.`);
      return;
    }
    errors.push(...validateRow(row, label));

    const sourceLang = row['source language'];
    if (hasValue(sourceLang)) {
      if (!exactNames.has(sourceLang)) {
        errors.push(`${label} has source language "${sourceLang}", which is not a configured language.`);
      } else if (sourceLang === row.name) {
        errors.push(`${label} has itself as its source language.`);
      }
    }

    const who = hasValue(row.name) ? `"${String(row.name).trim()}"` : `row ${idx + 1}`;
    if (hasValue(row.code)) group('code', String(row.code).trim().toLowerCase(), String(row.code).trim(), who);
    if (hasValue(row.location)) {
      group('location', normalizeLocation(row.location).toLowerCase(), String(row.location).trim(), who);
    }
  });

  errors.push(...reportDuplicates(groups.code, 'code'), ...reportDuplicates(groups.location, 'location'));

  const defaultSource = String(config['source.language'] ?? '').trim();
  if (defaultSource && !names.has(defaultSource.toLowerCase())) {
    errors.push(`"source.language" is "${defaultSource}", which is not a configured language.`);
  }
  return errors;
}

/**
 * Validates the translate config sheets. Never throws.
 * @param {object} sheets - Config sheets from `fetchConfig`.
 * @returns {Promise<{ errors: string[] }>} Human-readable errors; empty when valid.
 */
export async function validateConfig(sheets) {
  if (!sheets || sheets.error || !(sheets.config || sheets.languages)) {
    return { errors: ['No translate config available. Add a ".da/translate.json" config to the site or org.'] };
  }
  const config = toConfigMap(sheets);
  const rows = Array.isArray(sheets.languages?.data) ? sheets.languages.data : [];
  return { errors: [...validateLanguages(rows, config), ...await validateConnector(config)] };
}

/**
 * Builds the error message shown in the loc actions bar.
 * @param {string[]} errors - Validation errors.
 * @returns {{ type: string, text: string, items?: string[] }} Message; several errors add `items`.
 */
export function configErrorMessage(errors) {
  if (errors.length === 1) return { type: 'error', text: errors[0] };
  return { type: 'error', text: `Translate config has ${errors.length} issues:`, items: errors };
}

/**
 * Validates a persisted project service (`options.service`).
 * @param {object} service - Service with `name` plus its env values.
 * @returns {Promise<{ errors: string[] }>} Human-readable errors; empty when valid.
 */
export async function validateService(service) {
  const { name, env, ...values } = service ?? {};
  return { errors: await validateServiceValues({ name, values, env }) };
}
