import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';
import authReady, { getAccessToken } from './auth.js';

export const dnt = { addDnt };

const CONNECTOR_NAME = 'DA Live Localization';
const CONNECTOR_VERSION = '1.0.0';

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

// --- Helpers ---

async function getOpts(service, method = 'GET', body = null) {
  const token = await getAccessToken(service);
  if (!token) throw new Error('Lionbridge authentication failed');

  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
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

// --- Job / request operations ---

async function createJob(service, title, options) {
  const { apiEndpoint, providerId } = service;
  const dueDate = options['project.due'];

  const body = {
    jobName: `${title} - ${Date.now()}`,
    description: `DA translation project: ${title}`,
    providerId,
    connectorName: CONNECTOR_NAME,
    connectorVersion: CONNECTOR_VERSION,
    ...(dueDate ? { dueDate } : {}),
  };

  const opts = await getOpts(service, 'POST', body);
  const resp = await fetch(`${apiEndpoint}/jobs`, opts);
  if (!resp.ok) return null;

  const json = await resp.json();
  return json.jobId;
}

async function initSourceFile(service, jobId, name) {
  const { apiEndpoint } = service;
  const opts = await getOpts(service, 'POST');
  const url = `${apiEndpoint}/jobs/${jobId}/sourcefiles?fileName=${encodeURIComponent(name)}`;
  const resp = await fetch(url, opts);
  if (!resp.ok) return null;
  return resp.json();
}

async function uploadSourceFile(fmsPostMultipartUrl, content, name) {
  const formData = new FormData();
  const file = new Blob([content], { type: 'text/html' });
  formData.append('file', file, name);

  // The upload URL is a pre-signed SAS URL — no bearer token needed or wanted.
  const resp = await fetch(fmsPostMultipartUrl, { method: 'POST', body: formData });
  return resp.ok;
}

async function addRequest({
  service, jobId, sourceLanguage, targetCodes, url, fmsFileId,
}) {
  const { apiEndpoint } = service;
  const name = fileName(url.daBasePath);

  const body = {
    fmsFileId,
    requestName: name,
    sourceNativeId: url.daBasePath,
    sourceNativeLanguageCode: sourceLanguage,
    targetNativeLanguageCodes: targetCodes,
  };

  const opts = await getOpts(service, 'POST', body);
  const resp = await fetch(`${apiEndpoint}/jobs/${jobId}/requests/add`, opts);
  if (!resp.ok) return [];

  const { _embedded: embedded } = await resp.json();
  return embedded?.requests || [];
}

async function submitJob(service, jobId) {
  const { apiEndpoint } = service;
  const opts = await getOpts(service, 'PUT', {});
  const resp = await fetch(`${apiEndpoint}/jobs/${jobId}/submit`, opts);
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
    const resp = await fetch(url, opts);
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
      const dlOpts = await getOpts(service);
      const dlResp = await fetch(dlUrl, dlOpts);
      if (!dlResp.ok) throw new Error(dlResp.status);

      const text = await dlResp.text();
      const ext = url.daBasePath.includes('.json') ? 'json' : 'html';
      url.sourceContent = await removeDnt({ org, site, html: text, ext });

      await saveFn(url);
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
