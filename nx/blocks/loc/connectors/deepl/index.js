import { Queue } from '../../../../../nx2/public/utils/tree.js';
import downloadQueue from '../../utils/downloadQueue.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';
import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import { getAccessToken, imsAuthHeader } from '../../utils/auth.js';
import authReady from './auth.js';

const INTEGRATION_NAME = 'deepl';

export const dnt = { addDnt };

const STATUS_POLL_MS = 1000;
const STATUS_POLL_MAX = 30;
// Carries DeepL's own key. The Authorization header itself is reserved for the IMS token
// DA_TRANSLATE requires to gate access to the proxy (see imsAuthHeader) - DeepL's
// credential can't travel there too without colliding with it.
const CREDENTIAL_HEADER = 'x-deepl-authorization';

// Only needed to disambiguate a locale's region when DeepL supports more than one variant
// for that base language (e.g. EN-US vs EN-GB) - which variant is "right" for a given
// region is a product decision DeepL's language list can't answer on its own. Any base
// language DeepL supports with a single (or no) variant needs no entry here at all: it's
// resolved directly from the live supported-language set in toDeepLLanguageCode.
const TARGET_VARIANT_HINTS = {
  EN: { GB: 'EN-GB', UK: 'EN-GB' }, // default: EN-US
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
    return primary;
  }

  return primary;
}

/**
 * Builds the DA_TRANSLATE proxy origin DeepL requests are routed through, so the browser
 * never calls DeepL's API directly (avoids CORS and keeps a single, DA-controlled network
 * path for the connector). DeepL has no self-hosted/enterprise-instance variant (unlike
 * GlobalLink), so there's no per-site endpoint to resolve here - the proxy derives the
 * free-vs-pro upstream host itself from the key's `:fx` suffix.
 * @param {object} service - The flattened per-environment service config.
 * @returns {string|null} The proxy origin, or `null` if org/site are missing.
 */
function resolveOrigin(service = {}) {
  const { org, site } = service;
  if (!org || !site) return null;
  return `${DA_TRANSLATE}/translate/deepl/${org}/${site}/v2`;
}

/**
 * Builds the IMS-auth + DeepL-credential headers used for authenticated DeepL API calls
 * routed through the DA_TRANSLATE proxy.
 * @param {object} service - The service configuration.
 * @returns {Promise<{headers: object, origin: string}|null>}
 */
async function getApiContext(service) {
  const apiKey = await getAccessToken(INTEGRATION_NAME, service);
  const origin = resolveOrigin(service);
  if (!apiKey || !origin) return null;

  const cleanKey = apiKey.trim();
  const headers = {
    ...(await imsAuthHeader()),
    [CREDENTIAL_HEADER]: `DeepL-Auth-Key ${cleanKey}`,
  };

  return { apiKey: cleanKey, origin, headers };
}

// Per-origin cache of in-flight/resolved language lookups, so multiple languages in the
// same translation run share one pair of requests instead of one per language.
const languagesCache = new Map();

/**
 * Fetches DeepL's currently supported language codes for document translation via the
 * v3 languages endpoint, per https://developers.deepl.com/docs/languages/using-the-languages-api
 * (the v2 equivalent this replaces is deprecated). Used to resolve locale codes against
 * DeepL's live list rather than a hardcoded one, so newly added languages/variants (e.g. a
 * future EN or ZH sibling) work without a code change.
 * @param {object} apiCtx - The API context from getApiContext.
 * @returns {Promise<{source: Set<string>|null, target: Set<string>|null}>} Upper-cased
 * DeepL language codes usable as a source/target, or `null` per direction on failure.
 */
async function fetchSupportedLanguages(apiCtx) {
  const { origin, headers } = apiCtx;
  const v3Origin = origin.replace(/\/v2$/, '/v3');
  try {
    const resp = await fetch(`${v3Origin}/languages?resource=translate_document`, { headers });
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
 * Falls back to `null` per direction (rather than throwing) so callers can fall back to
 * toDeepLLanguageCode's static heuristic when the live list isn't available.
 * @param {object} apiCtx - The API context from getApiContext.
 * @returns {Promise<{source: Set<string>|null, target: Set<string>|null}>}
 */
function getSupportedLanguages(apiCtx) {
  const { origin } = apiCtx;
  if (!languagesCache.has(origin)) {
    languagesCache.set(origin, fetchSupportedLanguages(apiCtx));
  }
  return languagesCache.get(origin);
}

/**
 * Derives a clean file name for DeepL document translation.
 * @param {string} daBasePath - The DA base path.
 * @returns {string} Safe file name.
 */
function toFileName(daBasePath) {
  const trimmed = (daBasePath || '/document').replace(/^\//, '');
  const safe = trimmed.replace(/[\\/]/g, '__') || 'document';
  return /\.[a-z0-9]+$/i.test(safe) ? safe : `${safe}.html`;
}

/**
 * Uploads a document to DeepL Document Translation API.
 * @param {object} apiCtx - The API context containing origin, apiKey and headers.
 * @param {object} conf - Upload parameters.
 * @returns {Promise<{documentId: string, documentKey: string}|null>}
 */
async function uploadDocument(
  apiCtx,
  { content, daBasePath, sourceLang, targetLang, options = {} },
) {
  const { origin, apiKey, headers } = apiCtx;
  const formData = new FormData();
  const fileName = toFileName(daBasePath);
  const blob = new Blob([content], { type: 'text/html' });

  formData.append('auth_key', apiKey);
  formData.append('file', blob, fileName);
  formData.append('target_lang', targetLang);
  if (sourceLang) {
    formData.append('source_lang', sourceLang);
  }
  formData.append('tag_handling', 'html');
  formData.append('outline_detection', '0');

  const formality = options['translation.service.custom.option.formality']
    || options.formality
    || options.service?.formality;
  if (formality && formality !== 'default') {
    formData.append('formality', formality);
  }

  const glossaryId = options['translation.service.custom.option.glossary_id']
    || options.glossary_id
    || options.service?.glossaryId;
  if (glossaryId) {
    formData.append('glossary_id', glossaryId);
  }

  const resp = await fetch(`${origin}/document`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!resp.ok) return null;
  const json = await resp.json().catch(() => null);
  if (!json?.document_id || !json?.document_key) return null;

  return {
    documentId: json.document_id,
    documentKey: json.document_key,
  };
}

/**
 * Checks the status of a DeepL document translation.
 * @param {object} apiCtx - The API context.
 * @param {string} documentId - The DeepL document ID.
 * @param {string} documentKey - The DeepL document key.
 * @returns {Promise<{status: string, secondsRemaining?: number, errorMessage?: string}|null>}
 */
async function checkDocumentStatus(apiCtx, documentId, documentKey) {
  const { origin, apiKey, headers } = apiCtx;
  const formData = new FormData();
  formData.append('auth_key', apiKey);
  formData.append('document_key', documentKey);

  const resp = await fetch(`${origin}/document/${documentId}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!resp.ok) return null;
  return resp.json().catch(() => null);
}

/**
 * Downloads the completed document from DeepL.
 * @param {object} apiCtx - The API context.
 * @param {string} documentId - The DeepL document ID.
 * @param {string} documentKey - The DeepL document key.
 * @returns {Promise<string|null>} The translated HTML content.
 */
async function downloadDocumentResult(apiCtx, documentId, documentKey) {
  const { origin, apiKey, headers } = apiCtx;
  const formData = new FormData();
  formData.append('auth_key', apiKey);
  formData.append('document_key', documentKey);

  const resp = await fetch(`${origin}/document/${documentId}/result`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!resp.ok) return null;
  return resp.text();
}

/**
 * Checks whether DeepL authentication is ready.
 * @param {object} service - The service config.
 * @returns {Promise<boolean>}
 */
export function isConnected(service) {
  return authReady(service);
}

/**
 * Connects to DeepL.
 * @param {object} service - The service config.
 * @returns {Promise<boolean>}
 */
export function connect(service) {
  return authReady(service);
}

/**
 * Sends all documents across all target languages to DeepL for document translation.
 * @param {object} conf - Configuration object.
 * @param {string} conf.title - Project title.
 * @param {object} conf.service - Service config.
 * @param {object} conf.options - Project options.
 * @param {object[]} conf.langs - Target languages.
 * @param {object[]} conf.urls - DA URLs with HTML content.
 * @param {object} conf.actions - UI action callbacks.
 */
export async function sendAllLanguages({
  title, service, options, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;

  const apiCtx = await getApiContext(service);
  if (!apiCtx) {
    sendMessage({ text: 'Not connected to DeepL. Check API key configuration.', type: 'error' });
    return;
  }

  const { source: supportedSource, target: supportedTarget } = await getSupportedLanguages(
    apiCtx,
  );

  const rawSourceCode = options?.['source.language']?.code || service.sourceLanguage || 'en';
  const sourceLang = toDeepLLanguageCode(rawSourceCode, false, supportedSource);

  sendMessage({ text: `Sending ${urls.length} items to DeepL for translation.` });

  for (const lang of langs) {
    const targetLang = toDeepLLanguageCode(lang.code, true, supportedTarget);
    lang.translation ??= {};
    lang.translation.documents = {};
    let uploadedCount = 0;

    sendMessage({ text: `Uploading documents for ${lang.name} (${targetLang})...` });

    const uploadWorker = async (url) => {
      const doc = await uploadDocument(apiCtx, {
        content: url.content,
        daBasePath: url.daBasePath,
        sourceLang,
        targetLang,
        options,
      });

      if (doc) {
        lang.translation.documents[url.daBasePath] = {
          documentId: doc.documentId,
          documentKey: doc.documentKey,
          status: 'queued',
        };
        uploadedCount += 1;
      } else {
        lang.translation.documents[url.daBasePath] = {
          status: 'error',
        };
      }
    };

    const queue = new Queue(uploadWorker, 5);
    await Promise.allSettled(urls.map((url) => queue.push(url)));

    lang.translation.sent = uploadedCount;

    // Submission is complete once documents are queued on DeepL - actual
    // translation progress is tracked separately by getStatusAll, matching
    // the other connectors (they don't block sendAllLanguages on completion).
    lang.translation.status = uploadedCount === urls.length ? 'created' : 'error';
    if (uploadedCount !== urls.length) {
      sendMessage({
        text: `Uploaded ${uploadedCount}/${urls.length} documents for ${lang.name}.`,
        type: 'error',
      });
    }
  }

  sendMessage({ text: `DeepL translation completed for project: ${title}.` });
  await saveState({ options });
}

/**
 * Checks the translation status of all documents on DeepL.
 * @param {object} conf - Status check configuration.
 */
export async function getStatusAll({ service, langs, urls, actions }) {
  const { sendMessage, saveState } = actions;

  const apiCtx = await getApiContext(service);
  if (!apiCtx) {
    sendMessage({ text: 'Not connected to DeepL.', type: 'error' });
    return;
  }

  // 'complete'/'cancelled' are terminal - DeepL keeps reporting documents
  // as 'done' forever once finished, so without this guard every subsequent
  // status check would revert 'complete' back to 'translated' (triggering
  // a re-save) or 'cancelled' back to 'translated' (undoing the cancel).
  const activeLangs = langs.filter((l) => !['complete', 'cancelled'].includes(l.translation?.status));

  for (const lang of activeLangs) {
    const documents = lang.translation?.documents;
    if (documents) {
      let doneCount = 0;
      let errorCount = 0;

      const checkWorker = async (url) => {
        const docRecord = documents[url.daBasePath];
        if (!docRecord?.documentId || !docRecord?.documentKey) {
          if (docRecord?.status === 'done') doneCount += 1;
          return;
        }

        if (docRecord.status === 'done') {
          doneCount += 1;
          return;
        }

        const statusRes = await checkDocumentStatus(
          apiCtx,
          docRecord.documentId,
          docRecord.documentKey,
        );
        if (statusRes) {
          docRecord.status = statusRes.status;
          if (statusRes.status === 'done') {
            doneCount += 1;
          } else if (statusRes.status === 'error') {
            errorCount += 1;
            docRecord.errorMessage = statusRes.error_message;
          }
        }
      };

      const queue = new Queue(checkWorker, 5);
      await Promise.allSettled(urls.map((url) => queue.push(url)));

      lang.translation.translated = doneCount;

      if (errorCount > 0) {
        lang.translation.status = 'error';
      } else if (doneCount === urls.length) {
        lang.translation.status = 'translated';
      }
    }
  }

  sendMessage();
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
  const apiCtx = await getApiContext(service);
  if (!apiCtx) return urls;

  const documents = lang.translation?.documents || {};

  const downloadCallback = async (url) => {
    const docRecord = documents[url.daBasePath];
    if (!docRecord?.documentId || !docRecord?.documentKey) {
      url.status = 'error';
      return;
    }

    try {
      let isDone = docRecord.status === 'done';
      if (!isDone) {
        for (let i = 0; i < STATUS_POLL_MAX; i += 1) {
          const statusRes = await checkDocumentStatus(
            apiCtx,
            docRecord.documentId,
            docRecord.documentKey,
          );
          if (statusRes?.status === 'done') {
            isDone = true;
            break;
          }
          if (statusRes?.status === 'error') break;
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => { setTimeout(resolve, STATUS_POLL_MS); });
        }
      }

      if (!isDone) {
        url.status = 'error';
        return;
      }

      const translatedHtml = await downloadDocumentResult(
        apiCtx,
        docRecord.documentId,
        docRecord.documentKey,
      );
      if (!translatedHtml) {
        url.status = 'error';
        return;
      }

      url.sourceContent = await removeDnt({ org, site, html: translatedHtml, ext: url.ext });
      await saveFn(url);
      url.status = 'success';
      if (sendMessage) {
        const remaining = urls.filter((u) => !u.status).length;
        sendMessage({ text: `${remaining} items left to save for ${lang.name}.` });
      }
    } catch {
      url.status = 'error';
    }
  };

  return downloadQueue(urls, downloadCallback);
}

/**
 * Cancels or skips DeepL translation for a language.
 * DeepL document translation is typically near real-time, so this cleans up project state.
 * @param {object} conf - Cancel configuration.
 * @returns {Promise<{ok: boolean}>}
 */
export async function cancelTranslation({ lang, sendMessage }) {
  if (sendMessage) {
    sendMessage({ text: `Resetting DeepL translation state for ${lang.name}.` });
  }
  if (lang.translation) {
    lang.translation.status = 'cancelled';
    delete lang.translation.documents;
  }
  return { ok: true };
}
