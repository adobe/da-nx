import { Queue } from '../../../../../nx2/public/utils/tree.js';
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

/**
 * Normalizes a locale code to DeepL's accepted format.
 * DeepL source languages use 2-letter codes (e.g. EN, DE, FR, IT, ES).
 * DeepL target languages allow specific variants (EN-US, EN-GB, PT-BR, PT-PT, ZH-HANS, ZH-HANT)
 * and 2-letter codes for others.
 * @param {string} code - The BCP-47 or ISO locale code.
 * @param {boolean} [isTarget=true] - Whether this is a target language code.
 * @returns {string} The normalized DeepL language code.
 */
export function toDeepLLanguageCode(code, isTarget = true) {
  if (!code || typeof code !== 'string') return isTarget ? 'EN-US' : 'EN';
  const cleaned = code.trim().replace(/_/g, '-');
  const upper = cleaned.toUpperCase();

  if (isTarget) {
    if (upper === 'EN-US' || upper === 'EN-CA') return 'EN-US';
    if (upper === 'EN-GB' || upper === 'EN-UK') return 'EN-GB';
    if (upper === 'EN') return 'EN-US';
    if (upper === 'PT-BR') return 'PT-BR';
    if (upper === 'PT-PT' || upper === 'PT') return 'PT-PT';
    if (upper === 'ZH-HANS' || upper === 'ZH-CN' || upper === 'ZH-SG') return 'ZH-HANS';
    if (upper === 'ZH-HANT' || upper === 'ZH-TW' || upper === 'ZH-HK') return 'ZH-HANT';
    if (upper === 'ZH') return 'ZH';
    const [primary] = upper.split('-');
    return primary;
  }

  const [primary] = upper.split('-');
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
    langs.forEach((lang) => {
      lang.translation ??= {};
      lang.translation.status = 'error';
    });
    return;
  }

  const rawSourceCode = options?.['source.language']?.code || service.sourceLanguage || 'en';
  const sourceLang = toDeepLLanguageCode(rawSourceCode, false);

  sendMessage({ text: `Sending ${urls.length} items to DeepL for translation.` });

  for (const lang of langs) {
    const targetLang = toDeepLLanguageCode(lang.code, true);
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

    if (uploadedCount !== urls.length) {
      lang.translation.status = 'error';
      sendMessage({
        text: `Uploaded ${uploadedCount}/${urls.length} documents for ${lang.name}.`,
        type: 'error',
      });
    } else {
      sendMessage({ text: `Waiting for DeepL to translate ${lang.name}...` });

      let doneCount = 0;
      const checkWorker = async (url) => {
        const docRecord = lang.translation.documents[url.daBasePath];
        if (!docRecord?.documentId || !docRecord?.documentKey) return;

        for (let i = 0; i < STATUS_POLL_MAX; i += 1) {
          const statusRes = await checkDocumentStatus(
            apiCtx,
            docRecord.documentId,
            docRecord.documentKey,
          );
          if (statusRes?.status === 'done') {
            docRecord.status = 'done';
            doneCount += 1;
            break;
          }
          if (statusRes?.status === 'error') {
            docRecord.status = 'error';
            docRecord.errorMessage = statusRes.error_message;
            break;
          }
          // eslint-disable-next-line no-await-in-loop
          await new Promise((resolve) => { setTimeout(resolve, STATUS_POLL_MS); });
        }
      };

      const statusQueue = new Queue(checkWorker, 5);
      await Promise.allSettled(urls.map((url) => statusQueue.push(url)));

      lang.translation.translated = doneCount;
      lang.translation.status = doneCount === urls.length ? 'translated' : 'error';
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

  for (const lang of langs) {
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

  const queue = new Queue(downloadCallback, 5);

  return new Promise((resolve) => {
    const throttle = setInterval(() => {
      const nextUrl = urls.find((url) => !url.inProgress);
      if (nextUrl) {
        nextUrl.inProgress = true;
        queue.push(nextUrl);
      } else if (urls.every((url) => url.status)) {
        clearInterval(throttle);
        resolve(urls);
      }
    }, 250);
  });
}

/**
 * Cancels or skips DeepL translation for a language.
 * DeepL document translation is typically near real-time, so this cleans up project state.
 * @param {object} conf - Cancel configuration.
 * @returns {Promise<{ok: boolean, skipped?: boolean}>}
 */
export async function cancelTranslation({ lang, sendMessage }) {
  if (sendMessage) {
    sendMessage({ text: `Resetting DeepL translation state for ${lang.name}.` });
  }
  if (lang.translation) {
    lang.translation.status = 'cancelled';
  }
  return { ok: true };
}
