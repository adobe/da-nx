import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';
import authReady, { getAccessToken } from './auth.js';
import { getOrCreateConnectorGuid } from './connectorGuid.js';
import fetchWithRetry from '../../utils/fetchWithRetry.js';

export const dnt = { addDnt };

const CONNECTOR_NAME = 'DA Live Localization for Lionbridge';
const CONNECTOR_VERSION = '1.0.0';

// jobName / requestName are capped at 250 bytes by Lionbridge's dev guidelines.
const MAX_NAME_BYTES = 250;

// Lionbridge rate-limits at 10 (staging) / 20 (prod) requests/sec/IP. Their
// dev guidelines require retrying 429/503 with exponential backoff, honoring
// Retry-After when present. Only 429/503 (not all 5xx) are retried here, and
// with a tighter ceiling than fetchWithRetry's defaults, to match Lionbridge's
// specific guidance rather than the shared default tuning.
const RETRY_CONFIG = {
  maxRetries: 3,
  maxDelayMs: 8000,
  isRetryable: (status) => status === 429 || status === 503,
};

// Request statuses that mean translated content is ready to retrieve.
const READY_STATUSES = ['REVIEW_TRANSLATION', 'TRANSLATION_APPROVED', 'COMPLETED_NO_NEED_TO_TRANSLATE'];
const ERROR_STATUSES = ['TRANSLATION_REJECTED'];
const CANCELED_STATUSES = ['CANCELLED'];

/**
 * Determines if the user is currently authenticated to Lionbridge.
 * @param {Object} service - The service configuration.
 * @returns {Promise<boolean>} Whether a valid access token was obtained.
 */
export function isConnected(service) {
  return authReady(service);
}

/**
 * Connects to Lionbridge by obtaining an access token.
 * @param {Object} service - The service configuration.
 * @returns {Promise<boolean>} Whether the connection succeeded.
 */
export function connect(service) {
  return authReady(service);
}

// No `cancelTranslation` export: Lionbridge's dev guidelines explicitly
// prohibit connectors from letting users cancel or delete in-progress jobs
// (developers.lionbridge.com/content/v2/docs/dev_guidelines.html). The
// translate UI already hides its cancel action when a connector has no
// `cancelTranslation` export, so this is a deliberate omission, not a gap.

// --- Helpers ---

/**
 * Builds fetch options for a Lionbridge API call, including a fresh bearer
 * token.
 * @param {Object} service - The service configuration.
 * @param {string} [method] - HTTP method.
 * @param {Object|null} [body] - JSON-serializable request body, if any.
 * @param {string} [accept] - Accept header value.
 * @returns {Promise<Object>} Fetch options.
 */
async function getOpts(service, method = 'GET', body = null, accept = 'application/json') {
  const token = await getAccessToken(service);
  if (!token) throw new Error('Lionbridge authentication failed');

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: accept,
    },
  };

  if (body) opts.body = JSON.stringify(body);

  return opts;
}

/**
 * Ensures a path has an extension Lionbridge will treat as a file.
 * @param {string} path - A DA base path, with or without an extension.
 * @returns {string} The path, with `.html` appended if it had no extension.
 */
function ensureExtension(path) {
  if (path.endsWith('.html')) return path;

  // Add .html to `file-name.json` so when we get
  // the doc back, we know it was originally json
  return `${path}.html`;
}

/**
 * Derives a flat file name for Lionbridge from a DA base path.
 * @param {string} daBasePath - The source item's DA base path.
 * @returns {string} A dash-joined file name, e.g. `/foo/bar` -> `bar.html`.
 */
function fileName(daBasePath) {
  const [, ...parts] = ensureExtension(daBasePath).split('/');
  return parts.join('-') || 'index.html';
}

// Truncates to a max UTF-8 byte length without splitting a multi-byte
// codepoint (Lionbridge caps jobName/requestName at 250 bytes each).
function truncateBytes(str, maxBytes) {
  const bytes = new TextEncoder().encode(str);
  if (bytes.length <= maxBytes) return str;

  const decoder = new TextDecoder();
  let end = maxBytes;
  while (end > 0 && decoder.decode(bytes.slice(0, end)).endsWith('�')) {
    end -= 1;
  }
  return decoder.decode(bytes.slice(0, end));
}

// --- Job / request operations ---

/**
 * Creates a new Lionbridge job for a translation project.
 * @param {Object} service - The service configuration.
 * @param {string} title - The project title.
 * @param {Object} options - Project options; `project.due` sets a due date.
 * @returns {Promise<string|null>} The new job's id, or null on failure.
 */
async function createJob(service, title, options) {
  const { apiEndpoint } = service;
  const dueDate = options['project.due'];
  const guid = await getOrCreateConnectorGuid(service);

  const body = {
    jobName: truncateBytes(`${title} - ${Date.now()}`, MAX_NAME_BYTES),
    description: `DA translation project: ${title}`,
    connectorName: guid ? `${guid} ${CONNECTOR_NAME}` : CONNECTOR_NAME,
    connectorVersion: CONNECTOR_VERSION,
    ...(dueDate ? { dueDate } : {}),
  };

  const opts = await getOpts(service, 'POST', body);
  const resp = await fetchWithRetry(`${apiEndpoint}/jobs`, opts, RETRY_CONFIG);
  if (!resp.ok) return null;

  const json = await resp.json();
  return json.jobId;
}

/**
 * Registers a source file with Lionbridge and gets back an upload URL.
 * @param {Object} service - The service configuration.
 * @param {string} jobId - The job to attach the source file to.
 * @param {string} name - The file name.
 * @returns {Promise<Object|null>} `{ fmsPostMultipartUrl, fmsFileId }`, or
 *  null on failure.
 */
async function initSourceFile(service, jobId, name) {
  const { apiEndpoint } = service;
  const opts = await getOpts(service, 'POST');
  const url = `${apiEndpoint}/jobs/${jobId}/sourcefiles?fileName=${encodeURIComponent(name)}`;
  const resp = await fetchWithRetry(url, opts, RETRY_CONFIG);
  if (!resp.ok) return null;
  return resp.json();
}

/**
 * Uploads source content to Lionbridge's pre-signed SAS URL.
 * @param {string} fmsPostMultipartUrl - The pre-signed upload URL from
 *  `initSourceFile`.
 * @param {string} content - The source file content.
 * @param {string} name - The file name.
 * @returns {Promise<boolean>} Whether the upload succeeded.
 */
async function uploadSourceFile(fmsPostMultipartUrl, content, name) {
  const formData = new FormData();
  const file = new Blob([content], { type: 'text/html' });
  formData.append('file', file, name);

  // The upload URL is a pre-signed SAS URL — no bearer token needed or wanted.
  const resp = await fetchWithRetry(fmsPostMultipartUrl, { method: 'POST', body: formData }, RETRY_CONFIG);
  return resp.ok;
}

/**
 * Adds a translation request for an uploaded source file to a job.
 * @param {Object} params
 * @param {Object} params.service - The service configuration.
 * @param {string} params.jobId - The target job.
 * @param {string} params.sourceLanguage - The source language code.
 * @param {string[]} params.targetCodes - Target language codes.
 * @param {Object} params.url - The DA url entry the request is for.
 * @param {string} params.fmsFileId - The uploaded source file's id.
 * @returns {Promise<Object[]>} The created requests (one per target
 *  language), or an empty array on failure.
 */
async function addRequest({
  service, jobId, sourceLanguage, targetCodes, url, fmsFileId,
}) {
  const { apiEndpoint } = service;
  const name = fileName(url.daBasePath);

  const body = {
    fmsFileId,
    requestName: truncateBytes(name, MAX_NAME_BYTES),
    sourceNativeId: url.daBasePath,
    sourceNativeLanguageCode: sourceLanguage,
    targetNativeLanguageCodes: targetCodes,
  };

  const opts = await getOpts(service, 'POST', body);
  const resp = await fetchWithRetry(`${apiEndpoint}/jobs/${jobId}/requests/add`, opts, RETRY_CONFIG);
  if (!resp.ok) return [];

  const { _embedded: embedded } = await resp.json();
  return embedded?.requests || [];
}

/**
 * Submits a job for translation. providerId must be sent here — Lionbridge
 * silently ignores it on job creation but requires it here.
 * @param {Object} service - The service configuration.
 * @param {string} jobId - The job to submit.
 * @returns {Promise<boolean>} Whether the submit succeeded.
 */
async function submitJob(service, jobId) {
  const { apiEndpoint, providerId } = service;
  const opts = await getOpts(service, 'PUT', { providerId });
  const resp = await fetchWithRetry(`${apiEndpoint}/jobs/${jobId}/submit`, opts, RETRY_CONFIG);
  return resp.ok;
}

/**
 * Approves a translated request, moving it from REVIEW_TRANSLATION to
 * TRANSLATION_APPROVED in Lionbridge's review workflow.
 * @param {Object} service - The service configuration.
 * @param {string} jobId - The job the request belongs to.
 * @param {string} requestId - The request to approve.
 * @returns {Promise<boolean>} Whether the approval succeeded.
 */
async function approveRequest(service, jobId, requestId) {
  const { apiEndpoint } = service;
  const opts = await getOpts(service, 'PUT', { requestIds: [requestId] });
  const resp = await fetchWithRetry(`${apiEndpoint}/jobs/${jobId}/requests/approve`, opts, RETRY_CONFIG);
  return resp.ok;
}

/**
 * Uploads a single DA url to Lionbridge: registers the source file, uploads
 * its content, and adds a translation request for it.
 * @param {Object} service - The service configuration.
 * @param {string} jobId - The target job.
 * @param {string} sourceLanguage - The source language code.
 * @param {string[]} targetCodes - Target language codes.
 * @param {Object} url - The DA url entry to upload; mutated with
 *  `requestIds` on success.
 * @returns {Promise<boolean>} Whether the upload succeeded.
 */
async function uploadUrl(service, jobId, sourceLanguage, targetCodes, url) {
  const name = fileName(url.daBasePath);

  const fms = await initSourceFile(service, jobId, name);
  if (!fms) return false;

  const uploaded = await uploadSourceFile(fms.fmsPostMultipartUrl, url.content, name);
  if (!uploaded) return false;

  const requests = await addRequest({
    service, jobId, sourceLanguage, targetCodes, url, fmsFileId: fms.fmsFileId,
  });
  if (!requests.length) return false;

  url.requestIds = requests.reduce((acc, request) => {
    acc[request.targetNativeLanguageCode] = request.requestId;
    return acc;
  }, {});

  return true;
}

// --- Exports ---

/**
 * Sends a translation project's urls to Lionbridge for every target
 * language: creates a job, uploads all urls, then submits the job.
 * @param {Object} params
 * @param {string} params.title - The project title.
 * @param {Object} params.service - The service configuration.
 * @param {Object} params.options - Project options (e.g. `project.due`,
 *  `source.language`).
 * @param {Object[]} params.langs - Target languages; mutated in place with
 *  `translation` status.
 * @param {Object[]} params.urls - The urls to translate.
 * @param {Object} params.actions - `{ sendMessage, saveState }` callbacks.
 * @returns {Promise<void>}
 */
export async function sendAllLanguages({
  title, service, options, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;

  const localesStr = langs.map((lang) => lang.code).join(', ');
  const sourceLanguage = options['source.language']?.code || 'en-US';
  const targetCodes = langs.map((lang) => lang.code);

  sendMessage({ text: `Creating Lionbridge job for: ${localesStr}.` });
  const jobId = await createJob(service, title, options);
  if (!jobId) {
    sendMessage({ text: 'Error creating Lionbridge job.', type: 'error' });
    return;
  }

  // Persist for status / download
  service.jobId = { value: jobId };

  sendMessage({ text: `Uploading ${urls.length} files to Lionbridge.` });
  let uploaded = 0;
  for (const url of urls) {
    const ok = await uploadUrl(service, jobId, sourceLanguage, targetCodes, url);
    if (ok) uploaded += 1;
  }

  sendMessage({ text: 'Submitting Lionbridge job.' });
  const submitted = await submitJob(service, jobId);

  langs.forEach((lang) => {
    lang.translation ??= {};
    lang.translation.jobId = jobId;
    lang.translation.sent = uploaded;
    lang.translation.status = submitted && uploaded === urls.length ? 'created' : 'error';
  });

  // Clean urls for persistence
  const cleanUrls = urls.map(({
    basePath, suppliedPath, checked, requestIds,
  }) => ({
    basePath, suppliedPath, checked, requestIds,
  }));

  await saveState({ options, urls: cleanUrls });
  sendMessage();
}

/**
 * Computes the aggregate translation status for one language from a job's
 * requests.
 * @param {Object[]} requests - All requests for the job (any language).
 * @param {string} langCode - The language to compute status for.
 * @param {number} fileCount - The total number of files expected for this
 *  language.
 * @returns {{status: string, translated: number}} `status` is one of
 *  'error', 'canceled', 'translated', or 'in progress'.
 */
export function statusFor(requests, langCode, fileCount) {
  const langRequests = requests.filter((request) => request.targetNativeLanguageCode === langCode);

  if (langRequests.some((request) => ERROR_STATUSES.includes(request.statusCode))) {
    return { status: 'error', translated: 0 };
  }
  if (langRequests.some((request) => CANCELED_STATUSES.includes(request.statusCode))) {
    return { status: 'canceled', translated: 0 };
  }

  const translated = langRequests
    .filter((request) => READY_STATUSES.includes(request.statusCode)).length;
  if (translated === fileCount) return { status: 'translated', translated };

  return { status: 'in progress', translated };
}

/**
 * Fetches every request for a job, paginating via the `next` cursor.
 * @param {Object} service - The service configuration.
 * @param {string} jobId - The job to fetch requests for.
 * @returns {Promise<Object[]>} All requests across all pages.
 */
async function fetchAllRequests(service, jobId) {
  const { apiEndpoint } = service;
  const requests = [];
  let next;

  do {
    const opts = await getOpts(service);
    const url = new URL(`${apiEndpoint}/jobs/${jobId}/requests`);
    if (next) url.searchParams.set('next', next);

    // eslint-disable-next-line no-await-in-loop
    const resp = await fetchWithRetry(url, opts, RETRY_CONFIG);
    if (!resp.ok) break;

    // eslint-disable-next-line no-await-in-loop
    const { _embedded: embedded, next: nextCursor } = await resp.json();
    requests.push(...(embedded?.requests || []));
    next = nextCursor;
  } while (next);

  return requests;
}

/**
 * Refreshes translation status for every target language of a job.
 * @param {Object} params
 * @param {Object} params.service - The service configuration.
 * @param {Object[]} params.langs - Target languages; mutated in place with
 *  `translation.status`/`translation.translated`.
 * @param {Object[]} params.urls - The urls in the project.
 * @param {Object} params.actions - `{ sendMessage, saveState }` callbacks.
 * @returns {Promise<void>}
 */
export async function getStatusAll({ service, langs, urls, actions }) {
  const { sendMessage, saveState } = actions;

  const jobId = langs[0]?.translation?.jobId;
  if (!jobId) return;

  const localesStr = langs.map((lang) => lang.code).join(', ');
  sendMessage({ text: `Getting status for ${localesStr}` });

  const requests = await fetchAllRequests(service, jobId);
  if (!requests.length) return;

  langs.forEach((lang) => {
    lang.translation ??= {};
    const { status, translated } = statusFor(requests, lang.code, urls.length);
    lang.translation.status = status;
    lang.translation.translated = translated;
  });

  sendMessage();
  await saveState();
}

/**
 * Downloads and saves translated content for a completed language,
 * approving each request in Lionbridge afterward.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {Object} params.service - The service configuration.
 * @param {Object} params.lang - The language to save; reads
 *  `lang.translation.jobId`.
 * @param {Object[]} params.urls - The urls to download; mutated in place
 *  with `sourceContent`/`status`.
 * @param {Function} params.saveFn - Called with each url once its
 *  translated content is ready to persist.
 * @returns {Promise<Object[]>} The same `urls`, once all have a `status`.
 */
export async function saveItems({
  org, site, service, lang, urls, saveFn,
}) {
  const { apiEndpoint } = service;
  const jobId = lang?.translation?.jobId;
  if (!jobId) return urls;

  const downloadCallback = async (url) => {
    const requestId = url.requestIds?.[lang.code];

    if (!requestId) {
      url.status = 'error';
      return;
    }

    try {
      const dlUrl = `${apiEndpoint}/jobs/${jobId}/requests/${requestId}/retrievefile`;
      // retrievefile returns the raw file, not JSON. application/octet-stream
      // is Lionbridge's documented Accept for file retrieval (avoids base64).
      const dlOpts = await getOpts(service, 'GET', null, 'application/octet-stream');
      const dlResp = await fetchWithRetry(dlUrl, dlOpts, RETRY_CONFIG);
      if (!dlResp.ok) throw new Error(dlResp.status);

      const text = await dlResp.text();
      const ext = url.daBasePath.includes('.json') ? 'json' : 'html';
      url.sourceContent = await removeDnt({ org, site, html: text, ext });

      await saveFn(url);

      // Best-effort: close out the request in Lionbridge's review workflow
      // (REVIEW_TRANSLATION -> TRANSLATION_APPROVED). Failure here doesn't
      // affect the already-successful download/save.
      try {
        await approveRequest(service, jobId, requestId);
      } catch {
        // Ignore — approval is a courtesy call, not required for DA's own flow.
      }
    } catch {
      url.status = 'error';
    }
  };

  const queue = new Queue(downloadCallback, 5);

  return new Promise((resolve) => {
    const throttle = setInterval(() => {
      const nextUrl = urls.find((u) => !u.inProgress);
      if (nextUrl) {
        nextUrl.inProgress = true;
        queue.push(nextUrl);
      } else if (urls.every((u) => u.status)) {
        clearInterval(throttle);
        resolve(urls);
      }
    }, 250);
  });
}
