import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';
import authReady, { getAccessToken } from './auth.js';
import { getOrCreateConnectorGuid } from './connectorGuid.js';

export const dnt = { addDnt };

const CONNECTOR_NAME = 'DA Live Localization';
const CONNECTOR_VERSION = '1.0.0';

// jobName / requestName are capped at 250 bytes by Lionbridge's dev guidelines.
const MAX_NAME_BYTES = 250;

// Lionbridge rate-limits at 10 (staging) / 20 (prod) requests/sec/IP. Their
// dev guidelines require retrying 429/503 with exponential backoff, honoring
// Retry-After when present.
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8000;

// Request statuses that mean translated content is ready to retrieve.
const READY_STATUSES = ['REVIEW_TRANSLATION', 'TRANSLATION_APPROVED', 'COMPLETED_NO_NEED_TO_TRANSLATE'];
const ERROR_STATUSES = ['TRANSLATION_REJECTED'];
const CANCELED_STATUSES = ['CANCELLED'];

export function isConnected(service) {
  return authReady(service);
}

export function connect(service) {
  return authReady(service);
}

// No `cancelTranslation` export: Lionbridge's dev guidelines explicitly
// prohibit connectors from letting users cancel or delete in-progress jobs
// (developers.lionbridge.com/content/v2/docs/dev_guidelines.html). The
// translate UI already hides its cancel action when a connector has no
// `cancelTranslation` export, so this is a deliberate omission, not a gap.

// --- Helpers ---

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function fetchWithRetry(url, opts, attempt = 0) {
  const resp = await fetch(url, opts);
  if ((resp.status !== 429 && resp.status !== 503) || attempt >= MAX_RETRIES) {
    return resp;
  }

  const retryAfterSecs = Number(resp.headers.get('retry-after'));
  const delayMs = Number.isFinite(retryAfterSecs) && retryAfterSecs > 0
    ? retryAfterSecs * 1000
    : Math.min(BASE_RETRY_DELAY_MS * (2 ** attempt), MAX_RETRY_DELAY_MS);

  await wait(delayMs);
  return fetchWithRetry(url, opts, attempt + 1);
}

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

function ensureExtension(path) {
  if (path.endsWith('.html')) return path;

  // Add .html to `file-name.json` so when we get
  // the doc back, we know it was originally json
  return `${path}.html`;
}

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
  const resp = await fetchWithRetry(`${apiEndpoint}/jobs`, opts);
  if (!resp.ok) return null;

  const json = await resp.json();
  return json.jobId;
}

async function initSourceFile(service, jobId, name) {
  const { apiEndpoint } = service;
  const opts = await getOpts(service, 'POST');
  const url = `${apiEndpoint}/jobs/${jobId}/sourcefiles?fileName=${encodeURIComponent(name)}`;
  const resp = await fetchWithRetry(url, opts);
  if (!resp.ok) return null;
  return resp.json();
}

async function uploadSourceFile(fmsPostMultipartUrl, content, name) {
  const formData = new FormData();
  const file = new Blob([content], { type: 'text/html' });
  formData.append('file', file, name);

  // The upload URL is a pre-signed SAS URL — no bearer token needed or wanted.
  const resp = await fetchWithRetry(fmsPostMultipartUrl, { method: 'POST', body: formData });
  return resp.ok;
}

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
  const resp = await fetchWithRetry(`${apiEndpoint}/jobs/${jobId}/requests/add`, opts);
  if (!resp.ok) return [];

  const { _embedded: embedded } = await resp.json();
  return embedded?.requests || [];
}

async function submitJob(service, jobId) {
  const { apiEndpoint, providerId } = service;
  const opts = await getOpts(service, 'PUT', { providerId });
  const resp = await fetchWithRetry(`${apiEndpoint}/jobs/${jobId}/submit`, opts);
  return resp.ok;
}

async function approveRequest(service, jobId, requestId) {
  const { apiEndpoint } = service;
  const opts = await getOpts(service, 'PUT', { requestIds: [requestId] });
  const resp = await fetchWithRetry(`${apiEndpoint}/jobs/${jobId}/requests/approve`, opts);
  return resp.ok;
}

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

async function fetchAllRequests(service, jobId) {
  const { apiEndpoint } = service;
  const requests = [];
  let next;

  do {
    const opts = await getOpts(service);
    const url = new URL(`${apiEndpoint}/jobs/${jobId}/requests`);
    if (next) url.searchParams.set('next', next);

    // eslint-disable-next-line no-await-in-loop
    const resp = await fetchWithRetry(url, opts);
    if (!resp.ok) break;

    // eslint-disable-next-line no-await-in-loop
    const { _embedded: embedded, next: nextCursor } = await resp.json();
    requests.push(...(embedded?.requests || []));
    next = nextCursor;
  } while (next);

  return requests;
}

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
      const dlResp = await fetchWithRetry(dlUrl, dlOpts);
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
