import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';
import fetchWithRetry from '../../utils/fetchWithRetry.js';
import {
  resolveOrigin, getToken, onUnauthorized,
  isConnected as checkConnection,
  connect as establishConnection,
} from './auth.js';

export const dnt = { addDnt };

export function isConnected(config) {
  return checkConnection(config);
}

export function connect(service) {
  return establishConnection(service);
}

const BASE_OPTS = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
};

/**
 * Extracts a human-readable message from Smartling's documented error
 * envelope. Per their Error Handling docs, every 4xx/5xx response on every
 * endpoint returns `{ response: { code, errors: [{ key, message,
 * details }] } }` - this reads the `errors` array rather than just the
 * top-level `code`, since `code` alone (e.g. `VALIDATION_ERROR`) doesn't
 * say what's actually wrong (e.g. an invalid target locale).
 * @param {Object} json - The parsed error response body.
 * @returns {string} The joined `message` from each reported error, or the
 *  response `code` if no `errors` array is present.
 */
function extractErrorMessage(json) {
  const errors = json?.response?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map((error) => error.message).join('; ');
  }
  return json?.response?.code || 'Unknown error';
}

/**
 * Uploads every url to a Smartling batch, reporting an error message per
 * file that Smartling rejects (e.g. a locale mismatch) instead of only
 * counting it as not-accepted.
 * @param {string} endpoint - The resolved Smartling API origin.
 * @param {string} projectId - The Smartling project id.
 * @param {string} batchUid - The batch to upload files into.
 * @param {Object[]} langs - Target languages to authorize each file for.
 * @param {Object[]} urls - The urls to upload.
 * @param {Function} sendMessage - Callback to surface a status/error
 *  message to the user.
 * @returns {Promise<string[]>} Each file's Smartling response `code`
 *  (`'ACCEPTED'` on success).
 */
async function uploadFiles(endpoint, projectId, batchUid, langs, urls, sendMessage) {
  const uploadUrl = `${endpoint}/job-batches-api/v2/projects/${projectId}/batches/${batchUid}/file`;

  const results = [];

  for (const url of urls) {
    const body = new FormData();
    const file = new Blob([url.content], { type: 'text/html' });

    body.append('file', file);
    body.append('fileUri', url.daBasePath);
    body.append('fileType', 'html');
    langs.forEach((lang) => {
      body.append('localeIdsToAuthorize[]', lang.code);
    });

    const opts = { method: 'POST', body, headers: { Authorization: `Bearer ${getToken()}` } };

    const resp = await fetchWithRetry(uploadUrl, opts, { onUnauthorized: onUnauthorized(opts) });
    const json = await resp.json();
    if (!resp.ok) {
      sendMessage({ text: `Upload failed for ${url.daBasePath}: ${extractErrorMessage(json)}`, type: 'error' });
    }
    results.push(json.response.code);
  }

  return results;
}

/**
 * Creates a Smartling translation job for the given target languages.
 * @param {string} endpoint - The resolved Smartling API origin.
 * @param {string} projectId - The Smartling project id.
 * @param {string} title - The project title, used to build the job name.
 * @param {Object[]} langs - Target languages; each `code` becomes a
 *  `targetLocaleId`.
 * @param {Function} sendMessage - Callback to surface a status/error
 *  message to the user.
 * @returns {Promise<string|null>} The new job's id, or null on failure.
 */
async function createJob(endpoint, projectId, title, langs, sendMessage) {
  const timestamp = Date.now();
  const jobName = `${title}-${timestamp}`;
  const targetLocaleIds = langs.map((lang) => lang.code);

  const body = JSON.stringify({ jobName, targetLocaleIds });
  const opts = { ...BASE_OPTS, body };
  opts.headers.Authorization = `Bearer ${getToken()}`;

  const url = `${endpoint}/jobs-api/v3/projects/${projectId}/jobs`;
  const resp = await fetchWithRetry(url, opts, { onUnauthorized: onUnauthorized(opts) });
  if (!resp.ok) {
    const json = await resp.json();
    sendMessage({ text: `Job creation failed: ${extractErrorMessage(json)}`, type: 'error' });
    return null;
  }
  const json = await resp.json();
  const { translationJobUid: jobUid } = json.response.data;
  return jobUid;
}

/**
 * Creates a job batch for the uploaded files.
 * @param {string} endpoint - The resolved Smartling API origin.
 * @param {string} projectId - The Smartling project id.
 * @param {string} jobUid - The job to attach the batch to.
 * @param {Object[]} urls - The urls that will be uploaded to this batch.
 * @param {boolean} autoAuthorize - Whether Smartling should immediately
 *  authorize the job for translation once the batch finishes processing,
 *  instead of requiring manual authorization in Smartling's dashboard.
 * @param {Function} sendMessage - Callback to surface a status/error
 *  message to the user.
 * @returns {Promise<string|null>} The new batch's id, or null on failure.
 */
async function createBatch(endpoint, projectId, jobUid, urls, autoAuthorize, sendMessage) {
  const body = JSON.stringify({
    authorize: autoAuthorize,
    translationJobUid: jobUid,
    fileUris: urls.map((url) => url.daBasePath),
  });

  const opts = { ...BASE_OPTS, body };
  opts.headers.Authorization = `Bearer ${getToken()}`;

  const url = `${endpoint}/job-batches-api/v2/projects/${projectId}/batches`;

  const resp = await fetchWithRetry(url, opts, { onUnauthorized: onUnauthorized(opts) });
  if (!resp.ok) {
    const json = await resp.json();
    sendMessage({ text: `Batch creation failed: ${extractErrorMessage(json)}`, type: 'error' });
    return null;
  }
  const json = await resp.json();
  const { batchUid } = json.response.data;
  return batchUid;
}

async function downloadFile(opts, origin, projectId, lang, url) {
  const reqUrl = new URL(`${origin}/files-api/v2/projects/${projectId}/locales/${lang.code}/file`);
  reqUrl.searchParams.append('fileUri', url.daBasePath);

  const resp = await fetchWithRetry(reqUrl, opts, { onUnauthorized: onUnauthorized(opts) });
  return resp.text();
}

export async function saveItems({
  org,
  site,
  service,
  lang,
  urls,
  saveFn,
}) {
  const { origin, projectId } = service;
  const endpoint = resolveOrigin(origin, org, site);

  const downloadCallback = async (url) => {
    // Built per-download (not hoisted) so a background token refresh mid-batch
    // is picked up instead of every download reusing whatever token was
    // current when saveItems started.
    const opts = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken()}`,
        'Content-Type': 'application/json',
      },
    };

    const text = await downloadFile(opts, endpoint, projectId, lang, url);

    url.sourceContent = await removeDnt({ org, site, html: text, ext: url.ext });

    await saveFn(url);
  };

  const queue = new Queue(downloadCallback, 5);

  return new Promise((resolve) => {
    const throttle = setInterval(() => {
      const nextUrl = urls.find((url) => !url.inProgress);
      if (nextUrl) {
        nextUrl.inProgress = true;
        queue.push(nextUrl);
      } else {
        const finished = urls.every((url) => url.status);
        if (finished) {
          clearInterval(throttle);
          resolve(urls);
        }
      }
    }, 250);
  });
}

/**
 * Sends a translation project's urls to Smartling for every target
 * language: creates a job, creates a batch (optionally auto-authorized),
 * then uploads all urls to it.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {string} params.title - The project title.
 * @param {Object} params.options - Project options; reads/mutates
 *  `options.service`.
 * @param {Object[]} params.langs - Target languages; mutated in place with
 *  `translation` status.
 * @param {Object[]} params.urls - The urls to translate.
 * @param {Object} params.actions - `{ sendMessage, saveState }` callbacks.
 * @returns {Promise<void>}
 */
export async function sendAllLanguages({
  org, site, title, options, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;

  const { origin, projectId, autoAuthorize } = options.service;
  const endpoint = resolveOrigin(origin, org, site);

  sendMessage({ text: `Creating job in Smartling for: ${title}.` });
  const jobUid = await createJob(endpoint, projectId, title, langs, sendMessage);
  if (!jobUid) return;

  // Presist to the state for future reference
  options.service.jobUid = { value: jobUid };

  // // Persist into the immediate config object - janktown, but ok for now
  // config[`${env}.jobUid`] = jobUid;

  sendMessage({ text: `Creating a batch in Smartling for: ${title}.` });
  const batchUid = await createBatch(endpoint, projectId, jobUid, urls, autoAuthorize === 'yes', sendMessage);
  if (!batchUid) return;

  // Presist to the state for future reference
  options.service.batchUid = { value: batchUid };

  // // Persist into the immediate config object - janktown, but ok for now
  // config[`${env}.batchUid`] = batchUid;

  sendMessage({ text: `Uploading ${urls.length} items to Smartling for job: ${title}.` });
  const results = await uploadFiles(endpoint, projectId, batchUid, langs, urls, sendMessage);
  const accepted = results.filter((result) => result === 'ACCEPTED').length;

  langs.forEach((lang) => {
    lang.translation ??= {};
    lang.translation.sent = accepted;
    lang.translation.status = accepted === urls.length ? 'created' : 'error';
  });

  await saveState({ options });
}

export async function getStatusAll({
  org, site, service, langs, urls, actions,
}) {
  const { saveState } = actions;
  const { origin, projectId, jobUid } = service;
  const endpoint = resolveOrigin(origin, org, site);

  langs.forEach((lang) => { lang.translation.translated = 0; });

  for (const url of urls) {
    // Built per-url (not hoisted) so a token refresh mid-loop - whether
    // scheduled or triggered by a 401 below - is picked up by later urls.
    const opts = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` } };
    const progressUrl = `${endpoint}/jobs-api/v3/projects/${projectId}/jobs/${jobUid.value}/file/progress?fileUri=${url.daBasePath}`;
    const resp = await fetchWithRetry(progressUrl, opts, { onUnauthorized: onUnauthorized(opts) });
    const { response } = await resp.json();
    if (response.code !== 'SUCCESS') return;
    const langReports = response?.data?.contentProgressReport;
    if (!langReports) return;
    langReports.forEach((report) => {
      const { targetLocaleId, progress } = report;
      const lang = langs.find((projLang) => projLang.code === targetLocaleId);
      // Previously translated files will have a null progress object.
      if (!progress || progress.percentComplete === 100) {
        lang.translation.translated += 1;
      }
    });
  }

  for (const lang of langs) {
    if (lang.translation.translated === urls.length) {
      lang.translation.status = 'translated';
    }
  }

  await saveState();
}
