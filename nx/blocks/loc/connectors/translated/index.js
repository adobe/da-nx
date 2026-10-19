import { addDnt, removeDnt } from '../../dnt/dnt.js';
import fetchWithRetry from '../../utils/fetchWithRetry.js';
import downloadQueue from '../../utils/downloadQueue.js';
import {
  resolveOrigin, authHeaders, retryConfig, isConnected, connect as establishConnection,
} from './auth.js';

export const dnt = { addDnt };

export { isConnected };

const TERMINAL_LANG_STATUSES = ['complete', 'cancelled'];
const MAX_REQUESTS_PER_CALL = 5000;
const STATUS_PAGE_SIZE = 1000;
const MAX_CONTENT_ID_LENGTH = 255;
const DEFAULT_SOURCE_LANGUAGE = 'en-US';
const LANGUAGES_DOC_URL = 'https://api.translated.com/v2#tag/Symbol/operation/symbol-languages';
const MAX_TITLE_LENGTH = 100;
const CANCELLABLE_STATUSES = ['upload', 'wc raw', 'ingested', 'bucketing'];
const PROGRESS = { created: 0, 'in progress': 1, translated: 2 };

const VENDOR_STATUS = {
  preprocessing: 'created',
  upload: 'created',
  'wc raw': 'created',
  ingested: 'created',
  bucketing: 'created',
  unconfirmed: 'created',
  'machine translation': 'in progress',
  analyzing: 'in progress',
  quote: 'in progress',
  'in progress': 'in progress',
  completed: 'in progress',
  delivered: 'translated',
  invoiced: 'translated',
  failed: 'error',
  'failed delivery': 'error',
  cancelled: 'cancelled',
};

/**
 * Reads a config value that may be a plain string or a config-sheet `{ value }` object.
 * @param {*} raw - The raw config value.
 * @returns {string|undefined} The string value.
 */
function readValue(raw) {
  return typeof raw === 'object' ? raw?.value : raw;
}

/**
 * Reads a connector-persisted JSON map from the service, tolerating missing or bad data.
 * @param {Object} service - The service config.
 * @param {string} key - The persisted key (stored as `{ value: JSON-string }`).
 * @returns {Object} The parsed map, or `{}`.
 */
function readMap(service, key) {
  try {
    return JSON.parse(readValue(service?.[key]) || '{}');
  } catch {
    return {};
  }
}

/**
 * Extracts a readable message from a Translated error body (`{ error, code, message }`).
 * @param {Object} json - The parsed error body.
 * @returns {string} The message, or a fallback.
 */
function errorMessage(json) {
  return json?.message || 'Unknown error';
}

/**
 * Calls Translated through the proxy and parses JSON.
 * @param {Object} service - The service config.
 * @param {string} path - The API path, without origin.
 * @param {Object} [opts] - Fetch options; `headers` are merged with the auth headers.
 * @returns {Promise<{json?: *, error?: string, status: number}>} The parsed result.
 */
async function vendorFetch(service, path, opts = {}) {
  const { headers, ...rest } = opts;
  const reqOpts = { ...rest, headers: await authHeaders(service, headers) };
  const resp = await fetchWithRetry(
    `${resolveOrigin(service)}${path}`,
    reqOpts,
    retryConfig(service, reqOpts),
  );
  const json = await resp.json().catch(() => null);
  if (!resp.ok) return { error: errorMessage(json), status: resp.status };
  return { json, status: resp.status };
}

/**
 * Posts a JSON body to Translated.
 * @param {Object} service - The service config.
 * @param {string} path - The API path, without origin.
 * @param {*} body - The JSON-serializable body.
 * @param {Object} [headers] - Extra headers, such as `x-idempotency-id`.
 * @returns {Promise<{json?: *, error?: string, status: number}>} The parsed result.
 */
function vendorPost(service, path, body, headers = {}) {
  return vendorFetch(service, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

/**
 * Fetches the language codes Translated accepts for `/translate`.
 * @param {Object} service - The service config.
 * @returns {Promise<Set<string>|undefined>} The codes, or undefined if the lookup failed.
 */
async function fetchLanguageCodes(service) {
  const { json } = await vendorFetch(service, '/v2/symbol/languages');
  if (!Array.isArray(json)) return undefined;
  return new Set(json.map((language) => language.key));
}

/**
 * Fetches every request matching a `/status` filter, paging until exhausted.
 * @param {Object} service - The service config.
 * @param {Object} filter - The `/status` body (e.g. `{ id_order, target_language }`).
 * @returns {Promise<{requests?: Object[], error?: string}>} The requests, or an error.
 */
async function fetchRequests(service, filter) {
  const requests = [];
  for (let offset = 0; ; offset += STATUS_PAGE_SIZE) {
    // eslint-disable-next-line no-await-in-loop
    const { json, error } = await vendorPost(service, '/v2/status', {
      ...filter, limit: STATUS_PAGE_SIZE, offset,
    });
    if (error) return { error };
    if (!Array.isArray(json)) return { error: 'Unexpected status response' };
    requests.push(...json);
    if (json.length < STATUS_PAGE_SIZE) return { requests };
  }
}

/**
 * Builds the vendor `id_content`: the project title plus the source path, so the same page
 * in another project is never treated as a resend (which would cancel the earlier request).
 * @param {Object} conf
 * @param {string} [conf.title] - The project title.
 * @param {string} conf.path - The source `daBasePath`.
 * @returns {string} `<title>:<path>`.
 */
function toContentId({ title, path }) {
  const prefix = (title || 'project').replace(/[:/]/g, '-').slice(0, MAX_TITLE_LENGTH);
  return `${prefix}:${path}`;
}

/**
 * Recovers the source path from an `id_content`; ids without a title prefix pass through.
 * @param {string} contentId - The vendor `id_content`.
 * @returns {string} The source `daBasePath`.
 */
function toPath(contentId) {
  const split = contentId?.indexOf(':/') ?? -1;
  return split < 0 ? contentId : contentId.slice(split + 1);
}

/**
 * Keeps the newest request (highest id) per source path, so resends supersede earlier ones.
 * @param {Object[]} requests - Requests for one target language.
 * @returns {Object} `daBasePath -> request`.
 */
function latestByContent(requests) {
  return requests.reduce((acc, request) => {
    const path = toPath(request.id_content);
    const current = acc[path];
    if (!current || request.id > current.id) acc[path] = request;
    return acc;
  }, {});
}

/**
 * Filters a project's requests down to one target language (case-insensitive).
 * @param {Object[]} requests - Requests from `/status`.
 * @param {string} code - The target language code.
 * @returns {Object[]} The matching requests.
 */
function forLang(requests, code) {
  return requests.filter((r) => r.target_language?.toLowerCase() === code.toLowerCase());
}

/**
 * Rolls per-url request states up into one language status. Any failure or partial
 * cancellation is an error; otherwise the language is as far along as its slowest url.
 * @param {Object[]} requests - The latest request per url for one language.
 * @param {number} expected - The number of urls sent.
 * @returns {{status: string, translated: number}} The language status and delivered count.
 */
function rollUpStatus(requests, expected) {
  const states = requests.map((r) => VENDOR_STATUS[r.status]);
  if (states.some((state) => state === 'error')) return { status: 'error', translated: 0 };
  const cancelled = states.filter((state) => state === 'cancelled').length;
  if (cancelled) {
    return { status: cancelled === expected ? 'cancelled' : 'error', translated: 0 };
  }
  const known = states.filter((state) => state in PROGRESS);
  const translated = known.filter((state) => state === 'translated').length;
  if (known.length < expected) return { status: 'created', translated };
  const lowest = Math.min(...known.map((state) => PROGRESS[state]));
  const status = Object.keys(PROGRESS).find((key) => PROGRESS[key] === lowest);
  return { status, translated };
}

/**
 * Connects to Translated, surfacing an error message if it fails.
 * @param {Object} service - The service config.
 * @param {Function} [sendMessage] - Reports an error message.
 * @returns {Promise<boolean>} Whether the connection works.
 */
export async function connect(service, sendMessage) {
  const connected = await establishConnection(service);
  if (!connected) sendMessage?.({ text: 'Connection to Translated failed.', type: 'error' });
  return connected;
}

export const serviceOptions = [
  {
    key: 'serviceType',
    label: 'Service Type',
    fetch: async (service) => {
      const { json } = await vendorFetch(service, '/v2/symbol/service-type-names');
      if (!Array.isArray(json)) return [];
      return json
        .filter((type) => type.human_enabled || type.machine_enabled)
        .map((type) => ({ value: type.name, label: type.name }));
    },
  },
];

/**
 * Sends every page for every language in one `/translate` call, so the submission succeeds
 * or fails as a whole. Does not poll for completion.
 * @param {Object} conf
 * @param {string} conf.title - The project title.
 * @param {Object} conf.service - The service config; reads `serviceType`.
 * @param {Object} conf.options - The options sheet; `options.service` persists connector state.
 *  `source.language` is optional and defaults to `en-US`.
 * @param {Object[]} conf.langs - Target languages, mutated (`.translation`) on success only.
 * @param {Object[]} conf.urls - Source urls (`daBasePath`, `content`, `ext`).
 * @param {Object} conf.actions - `{ sendMessage, saveState }`.
 * @returns {Promise<void>}
 */
export async function sendAllLanguages({
  title, service, options, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;

  if (!(await isConnected(service))) {
    sendMessage({ text: 'Not connected to Translated.', type: 'error' });
    return;
  }

  const serviceType = readValue(service.serviceType);
  if (!serviceType) {
    sendMessage({ text: 'Select a Translated service type in the project options.', type: 'error' });
    return;
  }

  if (urls.length * langs.length > MAX_REQUESTS_PER_CALL) {
    sendMessage({ text: `Translated accepts at most ${MAX_REQUESTS_PER_CALL} requests per submission (pages x languages).`, type: 'error' });
    return;
  }

  const sourceLanguage = options['source.language']?.code || DEFAULT_SOURCE_LANGUAGE;
  const accepted = await fetchLanguageCodes(service);
  const unsupported = accepted
    ? [...new Set([sourceLanguage, ...langs.map((lang) => lang.code)])]
      .filter((code) => !accepted.has(code))
    : [];
  if (unsupported.length) {
    sendMessage({ text: `Translated does not support these language codes: ${unsupported.join(', ')}. See ${LANGUAGES_DOC_URL}.`, type: 'error' });
    return;
  }

  const orderId = `${title || 'project'}-${Date.now()}`.slice(0, 255);
  const orders = urls.map((url) => ({
    id_content: toContentId({ title, path: url.daBasePath }),
    id_order: orderId,
    content: url.content,
    content_type: url.ext === 'json' ? 'application/json' : 'text/html',
    source_language: sourceLanguage,
    target_languages: langs.map((lang) => lang.code),
    service_type: serviceType,
  }));

  const tooLong = orders.find((order) => order.id_content.length > MAX_CONTENT_ID_LENGTH);
  if (tooLong) {
    sendMessage({ text: `Translated limits page paths to ${MAX_CONTENT_ID_LENGTH} characters including the title: ${toPath(tooLong.id_content)}`, type: 'error' });
    return;
  }

  sendMessage({ text: `Sending ${urls.length} items to Translated.` });
  const { json, error } = await vendorPost(service, '/v2/translate', orders, {
    'x-idempotency-id': crypto.randomUUID(),
  });
  if (error || !Array.isArray(json)) {
    sendMessage({ text: `Translated submission failed: ${error || 'Unexpected response'}`, type: 'error' });
    return;
  }

  const orderIds = { ...readMap(service, 'orderIds') };
  langs.forEach((lang) => {
    orderIds[lang.code] = orderId;
    lang.translation ??= {};
    lang.translation.status = 'created';
    lang.translation.sent = urls.length;
  });
  options.service.orderIds = { value: JSON.stringify(orderIds) };

  sendMessage();
  await saveState({ options });
}

/**
 * Polls Translated for every language that is not terminal.
 * @param {Object} conf
 * @param {Object} conf.service - The service config.
 * @param {Object[]} conf.langs - Languages to poll, mutated.
 * @param {Object[]} conf.urls - Source urls (only `.length` is used).
 * @param {Object} conf.actions - `{ sendMessage, saveState }`.
 * @returns {Promise<void>}
 */
export async function getStatusAll({
  service, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;
  const active = langs.filter((lang) => !TERMINAL_LANG_STATUSES.includes(lang.translation?.status));
  if (!active.length) return;

  if (!(await isConnected(service))) {
    sendMessage({ text: 'Not connected to Translated.', type: 'error' });
    return;
  }

  sendMessage({ text: 'Checking Translated status.' });
  const orderIds = readMap(service, 'orderIds');
  const projects = [...new Set(active.map((lang) => orderIds[lang.code]).filter(Boolean))];

  await Promise.all(projects.map(async (orderId) => {
    const { requests } = await fetchRequests(service, { id_order: orderId });
    if (!requests) return;
    active.filter((lang) => orderIds[lang.code] === orderId).forEach((lang) => {
      const latest = Object.values(latestByContent(forLang(requests, lang.code)));
      if (!latest.length) return;
      const { status, translated } = rollUpStatus(latest, urls.length);
      lang.translation ??= {};
      lang.translation.status = status;
      lang.translation.translated = translated;
    });
  }));

  sendMessage();
  await saveState();
}

/**
 * Downloads and saves translated content for one language.
 * @param {Object} conf
 * @param {string} conf.org - The Experience Workspace org.
 * @param {string} conf.site - The Experience Workspace site.
 * @param {Object} conf.service - The service config.
 * @param {Object} conf.lang - The language being saved.
 * @param {Object[]} conf.urls - Urls to save; each gets `.status`.
 * @param {Function} conf.saveFn - Saves a url; sets `url.status = 'success'`.
 * @returns {Promise<Object[]>} The same urls.
 */
export async function saveItems({
  org, site, service, lang, urls, saveFn,
}) {
  const orderId = readMap(service, 'orderIds')[lang.code];
  if (!orderId) return urls;

  const { requests } = await fetchRequests(service, {
    id_order: orderId,
    target_language: lang.code,
    fetch_content: true,
  });
  const byContent = latestByContent(forLang(requests || [], lang.code));

  const download = async (url) => {
    const request = byContent[url.daBasePath];
    if (VENDOR_STATUS[request?.status] !== 'translated' || !request.translated_content) {
      url.status = 'error';
      return;
    }
    try {
      url.sourceContent = await removeDnt({
        org, site, html: request.translated_content, ext: url.ext,
      });
      await saveFn(url);
    } catch {
      url.status = 'error';
    }
  };

  await downloadQueue(urls, download);
  return urls;
}

/**
 * Cancels one language. Translated cancels only requests that have not started
 * translating, and all-or-nothing, so a language already past that point is rejected.
 * @param {Object} conf
 * @param {Object} conf.service - The service config.
 * @param {Object} conf.lang - The language to cancel; set to `cancelled` on success.
 * @param {Function} conf.sendMessage - Reports a status or error message.
 * @returns {Promise<{ok: boolean, skipped?: boolean}>} The outcome.
 */
export async function cancelTranslation({ service, lang, sendMessage }) {
  const orderId = readMap(service, 'orderIds')[lang.code];
  if (!lang.translation || !orderId || TERMINAL_LANG_STATUSES.includes(lang.translation.status)) {
    sendMessage({ text: `Skipping ${lang.name}. Nothing to cancel.` });
    return { ok: true, skipped: true };
  }

  sendMessage({ text: `Canceling ${lang.name}.` });
  const { requests, error } = await fetchRequests(service, {
    id_order: orderId,
    target_language: lang.code,
  });
  if (error) {
    sendMessage({ text: `Canceling ${lang.name} failed: ${error}`, type: 'error' });
    return { ok: false };
  }

  const latest = Object.values(latestByContent(forLang(requests, lang.code)));
  if (latest.some((request) => !CANCELLABLE_STATUSES.includes(request.status))) {
    sendMessage({ text: `Canceling ${lang.name} failed: Translated has already started translating.`, type: 'error' });
    return { ok: false };
  }

  const { error: cancelError } = await vendorPost(service, '/v2/translate/cancel', {
    id: latest.map((request) => request.id),
  });
  if (cancelError) {
    sendMessage({ text: `Canceling ${lang.name} failed: ${cancelError}`, type: 'error' });
    return { ok: false };
  }

  lang.translation.status = 'cancelled';
  return { ok: true };
}
