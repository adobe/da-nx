import { Queue } from '../../../../../nx2/public/utils/tree.js';
import downloadQueue from '../../utils/downloadQueue.js';
import fetchWithRetry from '../../utils/fetchWithRetry.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';
import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import { imsAuthHeader } from '../../utils/auth.js';

export { isConnected, connect } from './auth.js';

export const dnt = { addDnt };

// Tells the proxy which da-etc env to resolve the DeepL key from; it never reaches the browser.
const ENV_HEADER = 'x-translate-env';

// Region preferences for base languages with several DeepL variants (e.g. EN-US vs EN-GB).
const TARGET_VARIANT_HINTS = {
  EN: { GB: 'EN-GB', UK: 'EN-GB' }, // default: EN-US
  ES: {
    MX: 'ES-419',
    AR: 'ES-419',
    CO: 'ES-419',
    CL: 'ES-419',
    PE: 'ES-419',
    VE: 'ES-419',
    EC: 'ES-419',
    GT: 'ES-419',
    CU: 'ES-419',
    BO: 'ES-419',
    DO: 'ES-419',
    HN: 'ES-419',
    PY: 'ES-419',
    SV: 'ES-419',
    NI: 'ES-419',
    CR: 'ES-419',
    PA: 'ES-419',
    UY: 'ES-419',
    PR: 'ES-419',
  }, // default: ES
  PT: { PT: 'PT-PT' }, // default: PT-BR
  ZH: { TW: 'ZH-HANT', HK: 'ZH-HANT', MO: 'ZH-HANT' }, // default: ZH-HANS
};

/**
 * Normalizes a locale code to DeepL's accepted format.
 * When `supportedCodes` (from getSupportedLanguages) is available, the code is resolved
 * against DeepL's live supported-language list instead of a hardcoded set, so newly added
 * languages/variants work without a code change here. Falls back to a small static
 * heuristic - 2-letter codes, with a handful of known region variants - when the live list
 * couldn't be fetched (e.g. offline, proxy error).
 * @param {string} code - The BCP-47 or ISO locale code.
 * @param {boolean} [isTarget=true] - Whether this is a target language code.
 * @param {Set<string>} [supportedCodes] - Live DeepL language codes (upper-cased) for this
 * direction, from getSupportedLanguages().
 * @returns {string} The normalized DeepL language code.
 */
export function toDeepLLanguageCode(code, isTarget = true, supportedCodes = null) {
  if (!code || typeof code !== 'string') return isTarget ? 'EN-US' : 'EN';
  const cleaned = code.trim().replace(/_/g, '-');
  const upper = cleaned.toUpperCase();
  const [primary, region] = upper.split('-');

  if (supportedCodes?.size) {
    if (supportedCodes.has(upper)) return upper;

    const preferredVariant = isTarget && region && TARGET_VARIANT_HINTS[primary]?.[region];
    if (preferredVariant && supportedCodes.has(preferredVariant)) return preferredVariant;

    if (supportedCodes.has(primary)) return primary;

    // Base language supports variants DeepL didn't add above (e.g. a future region-locked
    // language) - if there's exactly one, use it; otherwise fall through to a bare guess.
    const variants = [...supportedCodes].filter((c) => c.startsWith(`${primary}-`));
    if (variants.length === 1) return variants[0];
  }

  if (isTarget) {
    if (upper === 'EN-US' || upper === 'EN-CA') return 'EN-US';
    if (upper === 'EN-GB' || upper === 'EN-UK') return 'EN-GB';
    if (upper === 'EN') return 'EN-US';
    if (upper === 'PT-BR') return 'PT-BR';
    if (upper === 'PT-PT' || upper === 'PT') return 'PT-PT';
    if (upper === 'ZH-HANS' || upper === 'ZH-CN' || upper === 'ZH-SG') return 'ZH-HANS';
    if (upper === 'ZH-HANT' || upper === 'ZH-TW' || upper === 'ZH-HK') return 'ZH-HANT';
    if (upper === 'ZH') return 'ZH';
    if (upper === 'ES-419' || upper === 'ES-LA') return 'ES-419';
    if (upper === 'ES-ES') return 'ES';
    return primary;
  }

  return primary;
}

/**
 * Builds the DA_TRANSLATE proxy origin that DeepL requests are routed through.
 * @param {object} service - The flattened per-environment service config.
 * @returns {string|null} The proxy origin, or `null` if org/site are missing.
 */
function resolveOrigin(service = {}) {
  const { org, site } = service;
  if (!org || !site) return null;
  return `${DA_TRANSLATE}/translate/deepl/${org}/${site}/v2`;
}

/**
 * Builds the proxy origin and IMS + env headers. The proxy resolves the DeepL key
 * server-side, so no credential is sent from the browser.
 * @param {object} service - The service configuration.
 * @returns {Promise<{error: string}|{origin: string, headers: object}>} Error or context.
 */
async function getApiContext(service) {
  const origin = resolveOrigin(service);
  if (!origin) return { error: 'DeepL is missing an org or site configuration.' };

  const ims = await imsAuthHeader();
  if (!ims.Authorization) return { error: 'Your Adobe session has expired. Sign in again to continue.' };

  return { origin, headers: { ...ims, [ENV_HEADER]: service.env ?? 'prod' } };
}

// Per-origin language lookups, shared across languages in one run.
const languagesCache = new Map();

/**
 * Fetches DeepL's supported document-translation language codes (v3 languages endpoint).
 * @param {object} apiCtx - The API context from getApiContext.
 * @returns {Promise<{source: Set<string>|null, target: Set<string>|null}>} Upper-cased
 * DeepL language codes usable as a source/target, or `null` per direction on failure.
 */
async function fetchSupportedLanguages(apiCtx) {
  const { origin, headers } = apiCtx;
  const v3Origin = origin.replace(/\/v2$/, '/v3');
  try {
    const opts = { headers };
    const resp = await fetchWithRetry(`${v3Origin}/languages?resource=translate_document`, opts);
    if (!resp.ok) return { source: null, target: null };
    const json = await resp.json().catch(() => null);
    if (!Array.isArray(json)) return { source: null, target: null };

    const source = new Set();
    const target = new Set();
    json.forEach((entry) => {
      const lang = entry.lang?.toUpperCase();
      if (!lang) return;
      if (entry.usable_as_source) source.add(lang);
      if (entry.usable_as_target) target.add(lang);
    });
    return { source, target };
  } catch {
    return { source: null, target: null };
  }
}

/**
 * Returns DeepL's live supported source/target language codes, memoized per proxy origin.
 * Failed lookups resolve to `null` per direction and are evicted so the next call retries.
 * @param {object} apiCtx - The API context from getApiContext.
 * @returns {Promise<{source: Set<string>|null, target: Set<string>|null}>}
 */
function getSupportedLanguages(apiCtx) {
  const { origin } = apiCtx;
  if (!languagesCache.has(origin)) {
    const lookup = fetchSupportedLanguages(apiCtx).then((langs) => {
      if (!langs.source || !langs.target) languagesCache.delete(origin);
      return langs;
    });
    languagesCache.set(origin, lookup);
  }
  return languagesCache.get(origin);
}

const FORMALITY_VALUES = new Set(['more', 'less', 'prefer_more', 'prefer_less']);

/**
 * Normalizes a formality option to a value DeepL accepts.
 * @param {*} value - Raw option value.
 * @returns {string|undefined} The value, or undefined for `default`/unknown values.
 */
function toFormality(value) {
  const normalized = value?.toString().trim().toLowerCase();
  return FORMALITY_VALUES.has(normalized) ? normalized : undefined;
}

/**
 * Derives a DeepL upload file name from a DA base path. Underscores are doubled before
 * folders are flattened to `_`, so distinct paths can't collide. Always ends in `.html`.
 * @param {string} daBasePath - The DA base path (e.g. "/blog/post-1").
 * @returns {string} The file name (e.g. "blog_post-1.html").
 */
function toFileName(daBasePath) {
  const trimmed = (daBasePath || '/document').replace(/^\//, '');
  const flat = trimmed.split(/[\\/]/).map((s) => s.replace(/_/g, '__')).join('_') || 'document';
  return /\.html$/i.test(flat) ? flat : `${flat}.html`;
}

/**
 * Uploads a document to DeepL Document Translation API.
 * @param {object} apiCtx - The API context containing origin and headers.
 * @param {object} conf - Upload parameters.
 * @param {string} conf.content - HTML content to translate.
 * @param {string} conf.daBasePath - DA path of the source document.
 * @param {string} [conf.sourceLang] - DeepL source language code.
 * @param {string} conf.targetLang - DeepL target language code.
 * @param {object} [conf.options] - Optional formality and glossary_id.
 * @returns {Promise<{documentId: string, documentKey: string}|{error: string, status: number}>}
 */
async function uploadDocument(
  apiCtx,
  { content, daBasePath, sourceLang, targetLang, options = {} },
) {
  const { origin, headers } = apiCtx;
  const formData = new FormData();
  const fileName = toFileName(daBasePath);
  const blob = new Blob([content], { type: 'text/html' });

  formData.append('file', blob, fileName);
  formData.append('target_lang', targetLang);
  if (sourceLang) {
    formData.append('source_lang', sourceLang);
  }
  formData.append('tag_handling', 'html');
  formData.append('outline_detection', '0');

  const formality = toFormality(options['translation.service.custom.option.formality']
    || options.formality
    || options.service?.formality);
  if (formality) {
    formData.append('formality', formality);
  }

  const glossaryId = options['translation.service.custom.option.glossary_id']
    || options.glossary_id
    || options.service?.glossaryId;
  if (glossaryId) {
    formData.append('glossary_id', glossaryId);
  }

  const opts = { method: 'POST', headers, body: formData };
  const resp = await fetchWithRetry(`${origin}/document`, opts);

  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    return { error: json?.message || json?.detail, status: resp.status };
  }
  if (!json?.document_id || !json?.document_key) {
    return { error: 'Missing document id or key in response', status: resp.status };
  }

  return {
    documentId: json.document_id,
    documentKey: json.document_key,
  };
}

/**
 * POSTs the document key to a DeepL document endpoint and parses the response.
 * @param {object} params
 * @param {object} params.apiCtx - The API context.
 * @param {string} params.path - Endpoint path under the API origin.
 * @param {string} params.documentKey - The DeepL document key.
 * @param {'json'|'text'} params.as - Response body format.
 * @returns {Promise<{json?: object, text?: string, error?: string, status?: number}>}
 */
async function postDocumentKey({ apiCtx, path, documentKey, as }) {
  const { origin, headers } = apiCtx;
  const formData = new FormData();
  formData.append('document_key', documentKey);

  try {
    const opts = { method: 'POST', headers, body: formData };
    const resp = await fetchWithRetry(`${origin}${path}`, opts);
    if (!resp.ok) return { error: `DeepL returned ${resp.status}`, status: resp.status };
    if (as === 'text') return { text: await resp.text() };
    const json = await resp.json().catch(() => null);
    return json ? { json } : { error: 'Invalid response from DeepL', status: resp.status };
  } catch (e) {
    return { error: e.message || 'Request to DeepL failed' };
  }
}

/**
 * Checks the status of a DeepL document translation.
 * @param {object} params
 * @param {object} params.apiCtx - The API context.
 * @param {string} params.documentId - The DeepL document ID.
 * @param {string} params.documentKey - The DeepL document key.
 * @returns {Promise<{json?: {status: string, errorMessage?: string}, error?: string}>}
 */
function checkDocumentStatus({ apiCtx, documentId, documentKey }) {
  return postDocumentKey({
    apiCtx, path: `/document/${documentId}`, documentKey, as: 'json',
  });
}

/**
 * Downloads the completed document from DeepL.
 * @param {object} params
 * @param {object} params.apiCtx - The API context.
 * @param {string} params.documentId - The DeepL document ID.
 * @param {string} params.documentKey - The DeepL document key.
 * @returns {Promise<{text?: string, error?: string}>} The translated HTML content.
 */
function downloadDocumentResult({ apiCtx, documentId, documentKey }) {
  return postDocumentKey({
    apiCtx, path: `/document/${documentId}/result`, documentKey, as: 'text',
  });
}

/**
 * Sends all documents across all target languages to DeepL for document translation.
 * @param {object} conf - Configuration object.
 * @param {object} conf.service - Service config.
 * @param {object} conf.options - Project options.
 * @param {object[]} conf.langs - Target languages.
 * @param {object[]} conf.urls - DA URLs with HTML content.
 * @param {object} conf.actions - UI action callbacks.
 */
export async function sendAllLanguages({
  service, options, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;

  const apiCtx = await getApiContext(service);
  if (apiCtx.error) {
    sendMessage({ text: apiCtx.error, type: 'error' });
    return;
  }

  const { source: supportedSource, target: supportedTarget } = await getSupportedLanguages(
    apiCtx,
  );

  const rawSourceCode = options?.['source.language']?.code || service.sourceLanguage || 'en';
  const sourceLang = toDeepLLanguageCode(rawSourceCode, false, supportedSource);

  const unsupported = [
    supportedSource && !supportedSource.has(sourceLang) && `source ${rawSourceCode}`,
    ...langs
      .filter((l) => supportedTarget
        && !supportedTarget.has(toDeepLLanguageCode(l.code, true, supportedTarget)))
      .map((l) => `${l.name} (${l.code})`),
  ].filter(Boolean);
  if (unsupported.length) {
    sendMessage({ text: `DeepL does not support: ${unsupported.join(', ')}.`, type: 'error' });
    return;
  }

  sendMessage({ text: `Sending ${urls.length} items to DeepL for translation.` });

  for (const lang of langs) {
    const targetLang = toDeepLLanguageCode(lang.code, true, supportedTarget);
    lang.translation ??= {};
    lang.translation.documents ??= {};
    const { documents } = lang.translation;

    sendMessage({ text: `Uploading documents for ${lang.name} (${targetLang})...` });

    const uploadWorker = async (url) => {
      if (documents[url.daBasePath]?.documentId) return;

      const doc = await uploadDocument(apiCtx, {
        content: url.content,
        daBasePath: url.daBasePath,
        sourceLang,
        targetLang,
        options,
      }).catch((e) => ({ error: e.message, status: 0 }));

      documents[url.daBasePath] = doc.documentId
        ? { documentId: doc.documentId, documentKey: doc.documentKey, status: 'queued' }
        : { status: 'error', error: doc.error, httpStatus: doc.status };
    };

    const queue = new Queue(uploadWorker, 5);
    await Promise.allSettled(urls.map((url) => queue.push(url)));

    const failed = urls.filter((url) => !documents[url.daBasePath]?.documentId);
    lang.translation.sent = urls.length - failed.length;
    lang.translation.status = failed.length ? 'error' : 'created';

    if (failed.length) {
      const details = failed.map((url) => {
        const { error, httpStatus } = documents[url.daBasePath] || {};
        const reason = [httpStatus && `HTTP ${httpStatus}`, error].filter(Boolean).join(' ');
        return `${url.daBasePath} (${reason || 'upload failed'})`;
      }).join(', ');
      sendMessage({
        text: `Failed to upload ${failed.length}/${urls.length} documents for ${lang.name}: ${details}.`,
        type: 'error',
      });
    }
  }

  if (!langs.some((l) => l.translation.status === 'error')) sendMessage();
  await saveState({ options });
}

/**
 * Checks the translation status of all documents on DeepL.
 * @param {object} conf - Status check configuration.
 * @param {object} conf.service - Service config used to resolve the API context.
 * @param {Array<object>} conf.langs - Languages whose translation state is updated in place.
 * @param {Array<{daBasePath: string}>} conf.urls - Documents to check.
 * @param {object} conf.actions - Host callbacks.
 * @param {Function} conf.actions.sendMessage - Shows a status message.
 * @param {Function} conf.actions.saveState - Persists lang state.
 * @returns {Promise<void>}
 */
export async function getStatusAll({ service, langs, urls, actions }) {
  const { sendMessage, saveState } = actions;

  const apiCtx = await getApiContext(service);
  if (apiCtx.error) {
    sendMessage({ text: apiCtx.error, type: 'error' });
    return;
  }

  // 'complete'/'cancelled' are terminal; DeepL keeps reporting 'done', which would revert them.
  const activeLangs = langs.filter((l) => !['complete', 'cancelled'].includes(l.translation?.status));
  const failures = [];

  for (const lang of activeLangs) {
    const documents = lang.translation?.documents;
    if (documents) {
      const checkWorker = async (url) => {
        const docRecord = documents[url.daBasePath];
        if (!docRecord?.documentId || !docRecord?.documentKey) return;
        if (['done', 'error'].includes(docRecord.status)) return;

        const { documentId, documentKey } = docRecord;
        const { json } = await checkDocumentStatus({ apiCtx, documentId, documentKey });
        if (!json) return;
        docRecord.status = json.status;
        if (json.status === 'error') docRecord.errorMessage = json.error_message;
      };

      const queue = new Queue(checkWorker, 5);
      await Promise.allSettled(urls.map((url) => queue.push(url)));

      const countWithStatus = (status) => urls
        .filter((url) => documents[url.daBasePath]?.status === status).length;
      const doneCount = countWithStatus('done');
      const errorCount = countWithStatus('error');

      lang.translation.translated = doneCount;

      const hasStarted = doneCount > 0
        || Object.values(documents).some((d) => d.status === 'translating');

      if (errorCount > 0) {
        lang.translation.status = 'error';
      } else if (doneCount === urls.length) {
        lang.translation.status = 'translated';
      } else if (hasStarted && ['created', 'in progress'].includes(lang.translation.status)) {
        lang.translation.status = 'in progress';
      }

      const failedDocs = urls
        .map((url) => ({ path: url.daBasePath, ...documents[url.daBasePath] }))
        .filter((d) => d.status === 'error');
      if (failedDocs.length) {
        const details = failedDocs
          .map((d) => `${d.path} (${d.errorMessage || 'translation failed'})`)
          .join(', ');
        failures.push(`${lang.name || lang.code}: ${details}`);
      }
    }
  }

  if (failures.length) {
    sendMessage({ text: `DeepL failed to translate: ${failures.join('; ')}.`, type: 'error' });
  } else {
    sendMessage();
  }
  await saveState();
}

/**
 * Downloads translated documents from DeepL, cleans DNT markers, and invokes saveFn.
 * @param {object} conf - Save items configuration.
 * @returns {Promise<object[]>}
 */
export async function saveItems({
  org, site, service, lang, urls, saveFn, sendMessage,
}) {
  const fail = (url, reason) => {
    url.status = 'error';
    url.error = reason;
  };

  const apiCtx = await getApiContext(service);
  if (apiCtx.error) {
    sendMessage?.({ text: apiCtx.error, type: 'error' });
    urls.forEach((url) => fail(url, apiCtx.error));
    return urls;
  }

  const documents = lang.translation?.documents || {};

  const downloadCallback = async (url) => {
    const docRecord = documents[url.daBasePath];
    if (!docRecord?.documentId || !docRecord?.documentKey) {
      fail(url, 'no DeepL document');
      return;
    }

    try {
      const { documentId, documentKey } = docRecord;
      const isDone = docRecord.status === 'done'
        || (await checkDocumentStatus({ apiCtx, documentId, documentKey })).json?.status === 'done';

      if (!isDone) {
        fail(url, 'translation not finished');
        return;
      }

      const { text: translatedHtml } = await downloadDocumentResult({
        apiCtx, documentId, documentKey,
      });
      if (!translatedHtml) {
        fail(url, 'download failed');
        return;
      }

      url.sourceContent = await removeDnt({ org, site, html: translatedHtml, ext: url.ext });
      await saveFn(url);
      if (url.status !== 'success') {
        fail(url, 'save failed');
        return;
      }
      if (sendMessage) {
        const remaining = urls.filter((u) => !u.status).length;
        sendMessage({ text: `${remaining} items left to save for ${lang.name}.` });
      }
    } catch (e) {
      fail(url, e.message || 'unexpected error');
    }
  };

  const saved = await downloadQueue(urls, downloadCallback);
  const failed = saved.filter((u) => u.status === 'error');
  if (failed.length) {
    const list = failed.map((u) => `${u.daBasePath} (${u.error || 'unknown error'})`).join('; ');
    sendMessage?.({
      text: `Failed to save ${failed.length}/${saved.length} items for ${lang.name}: ${list}.`,
      type: 'error',
    });
  }
  return saved;
}

const FINISHED_STATUSES = new Set(['translated', 'complete']);

/**
 * Abandons a language's translation locally. DeepL has no document cancel API,
 * so in-flight documents keep running (and may bill) but their results are discarded.
 * @param {object} conf - Cancel configuration.
 * @param {object} conf.lang - Language entry.
 * @param {Function} [conf.sendMessage] - Host message callback.
 * @returns {Promise<{ok: boolean, skipped?: boolean}>}
 */
export async function cancelTranslation({ lang, sendMessage }) {
  if (!lang.translation || FINISHED_STATUSES.has(lang.translation.status)) {
    return { ok: true, skipped: true };
  }
  sendMessage?.({
    text: `DeepL can't cancel in-flight documents. Abandoning ${lang.name}; results will be discarded.`,
  });
  lang.translation.status = 'cancelled';
  delete lang.translation.documents;
  return { ok: true };
}
