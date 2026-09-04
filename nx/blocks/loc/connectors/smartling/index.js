import { addDnt, removeDnt } from '../../dnt/dnt.js';
import downloadQueue from '../../utils/downloadQueue.js';
import fetchWithRetry from '../../utils/fetchWithRetry.js';
import {
  resolveOrigin, getToken, onUnauthorized,
  isConnected as checkConnection, connect as establishConnection,
} from './auth.js';

export const dnt = { addDnt };

const BASE_OPTS = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
};

export function isConnected(config) {
  return checkConnection(config);
}

/**
 * Authenticates with Smartling via da-etc, surfacing an error message if it
 * fails.
 * @param {Object} service - The service configuration.
 * @param {Function} [sendMessage] - Callback to surface an error message
 *  to the user if authentication fails.
 * @returns {Promise<boolean>} Whether authentication succeeded.
 */
export async function connect(service, sendMessage) {
  const connected = await establishConnection(service);
  if (!connected) sendMessage?.({ text: 'Connection to Smartling failed.', type: 'error' });
  return connected;
}

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
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
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
async function uploadFiles(
  org,
  site,
  env,
  endpoint,
  projectId,
  batchUid,
  langs,
  urls,
  sendMessage,
) {
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

    const opts = { method: 'POST', body, headers: { Authorization: `Bearer ${getToken(org, site, env)}` } };

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
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @param {string} endpoint - The resolved Smartling API origin.
 * @param {string} projectId - The Smartling project id.
 * @param {string} title - The project title, used to build the job name.
 * @param {Object[]} langs - Target languages; each `code` becomes a
 *  `targetLocaleId`.
 * @param {Function} sendMessage - Callback to surface a status/error
 *  message to the user.
 * @returns {Promise<string|null>} The new job's id, or null on failure.
 */
async function createJob(org, site, env, endpoint, projectId, title, langs, sendMessage) {
  const timestamp = Date.now();
  const jobName = `${title}-${timestamp}`;
  const targetLocaleIds = langs.map((lang) => lang.code);

  const body = JSON.stringify({ jobName, targetLocaleIds });
  const opts = { ...BASE_OPTS, body };
  opts.headers.Authorization = `Bearer ${getToken(org, site, env)}`;

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
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
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
async function createBatch(
  org,
  site,
  env,
  endpoint,
  projectId,
  jobUid,
  urls,
  autoAuthorize,
  sendMessage,
) {
  const body = JSON.stringify({
    authorize: autoAuthorize,
    translationJobUid: jobUid,
    fileUris: urls.map((url) => url.daBasePath),
  });

  const opts = { ...BASE_OPTS, body };
  opts.headers.Authorization = `Bearer ${getToken(org, site, env)}`;

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

/**
 * Downloads a single locale's translated file content.
 * @param {Object} opts - Fetch options, including the `Authorization`
 *  header.
 * @param {string} origin - The resolved Smartling API origin.
 * @param {string} projectId - The Smartling project id.
 * @param {Object} lang - The target language; reads `lang.code`.
 * @param {Object} url - The url to download; reads `url.daBasePath`.
 * @returns {Promise<string|null>} The file's translated content, or null
 *  on failure.
 */
async function downloadFile(opts, origin, projectId, lang, url) {
  const reqUrl = new URL(`${origin}/files-api/v2/projects/${projectId}/locales/${lang.code}/file`);
  reqUrl.searchParams.append('fileUri', url.daBasePath);

  const resp = await fetchWithRetry(reqUrl, opts, { onUnauthorized: onUnauthorized(opts) });
  if (!resp.ok) return null;
  return resp.text();
}

/**
 * Downloads and saves every url's translated content for one target
 * language, reporting an error message per file that fails to download
 * instead of saving empty/incorrect content.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {Object} params.service - The service configuration.
 * @param {Object} params.lang - The target language being saved.
 * @param {Object[]} params.urls - The urls to download; mutated in place
 *  with `sourceContent` and `status` (`'error'` on a failed download,
 *  otherwise set by `saveFn`).
 * @param {Function} params.saveFn - Callback to persist a downloaded
 *  url's content.
 * @param {Function} params.sendMessage - Callback to surface a status/
 *  error message to the user.
 * @returns {Promise<Object[]>} The urls, each mutated in place.
 */
export async function saveItems({
  org,
  site,
  service,
  lang,
  urls,
  saveFn,
  sendMessage,
}) {
  const { origin, projectId, env } = service;
  const endpoint = resolveOrigin(origin, org, site);

  const downloadCallback = async (url) => {
    // Built per-download (not hoisted) so a background token refresh mid-batch
    // is picked up instead of every download reusing whatever token was
    // current when saveItems started.
    const opts = {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getToken(org, site, env)}`,
        'Content-Type': 'application/json',
      },
    };

    const text = await downloadFile(opts, endpoint, projectId, lang, url);

    if (text === null) {
      sendMessage({ text: `Download failed for ${url.daBasePath}.`, type: 'error' });
      url.status = 'error';
      return;
    }

    url.sourceContent = await removeDnt({ org, site, html: text, ext: url.ext });

    try {
      await saveFn(url);
    } catch {
      url.status = 'error';
    }
  };

  return downloadQueue(urls, downloadCallback);
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

  const { origin, projectId, autoAuthorize, env } = options.service;
  const endpoint = resolveOrigin(origin, org, site);

  sendMessage({ text: `Creating job in Smartling for: ${title}.` });
  const jobUid = await createJob(org, site, env, endpoint, projectId, title, langs, sendMessage);
  if (!jobUid) {
    sendMessage({ text: `Job creation failed for: ${title}.`, type: 'error' });
    return;
  }

  // Presist to the state for future reference
  options.service.jobUid = { value: jobUid };

  // // Persist into the immediate config object - janktown, but ok for now
  // config[`${env}.jobUid`] = jobUid;

  sendMessage({ text: `Creating a batch in Smartling for: ${title}.` });
  const batchUid = await createBatch(
    org,
    site,
    env,
    endpoint,
    projectId,
    jobUid,
    urls,
    autoAuthorize === 'yes',
    sendMessage,
  );
  if (!batchUid) {
    sendMessage({ text: `Batch creation failed for: ${title}.`, type: 'error' });
    return;
  }

  // Persist to the state for future reference
  options.service.batchUid = { value: batchUid };

  // // Persist into the immediate config object - janktown, but ok for now
  // config[`${env}.batchUid`] = batchUid;

  sendMessage({ text: `Uploading ${urls.length} items to Smartling for job: ${title}.` });
  const results = await uploadFiles(
    org,
    site,
    env,
    endpoint,
    projectId,
    batchUid,
    langs,
    urls,
    sendMessage,
  );
  const accepted = results.filter((result) => result === 'ACCEPTED').length;

  langs.forEach((lang) => {
    lang.translation ??= {};
    lang.translation.sent = accepted;
    lang.translation.status = accepted === urls.length ? 'created' : 'error';
  });

  await saveState({ options });
}

/**
 * Fetches Smartling's per-locale progress for a job.
 * @param {string} org - The DA org.
 * @param {string} site - The DA site.
 * @param {string} env - The environment key (e.g. 'prod').
 * @param {string} endpoint - The resolved Smartling API origin.
 * @param {string} projectId - The Smartling project id.
 * @param {string} jobUid - The job to check progress for.
 * @returns {Promise<Object[]|null>} Each locale's `{ targetLocaleId,
 *  percentComplete }`, or null on failure. `percentComplete` is reported
 *  as 100 when Smartling has no content at all for that locale in this
 *  job (its own `progress` field is `null`, not a 0% in-progress state) -
 *  matching the "No content for translation" status Smartling's dashboard
 *  shows for it.
 */
async function fetchJobProgress(org, site, env, endpoint, projectId, jobUid) {
  const url = `${endpoint}/jobs-api/v3/projects/${projectId}/jobs/${jobUid}/progress`;
  const opts = { headers: { Authorization: `Bearer ${getToken(org, site, env)}` } };

  const resp = await fetchWithRetry(url, opts, { onUnauthorized: onUnauthorized(opts) });
  if (!resp.ok) return null;
  const { response } = await resp.json();
  const { contentProgressReport = [] } = response?.data || {};
  return contentProgressReport.map(({ targetLocaleId, progress }) => ({
    targetLocaleId,
    percentComplete: progress === null ? 100 : (progress?.percentComplete ?? 0),
  }));
}

/**
 * Refreshes translation status for every target language of a job via
 * Smartling's getJobProgress endpoint.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {Object} params.service - The service configuration; reads
 *  `jobUid.value` (set by `sendAllLanguages`).
 * @param {Object[]} params.langs - Target languages; mutated in place with
 *  `translation.status` ('translated' once Smartling reports 100% for
 *  that locale, otherwise Smartling's real progress percentage, e.g.
 *  '62% translated') and `translation.translated` (`urls.length` once
 *  translated, otherwise `0` - this endpoint reports one job-wide
 *  percentage per locale, not a per-file breakdown). A lang already at
 *  `'complete'` or `'cancelled'` is left untouched - both are terminal,
 *  and Smartling keeps reporting 100% indefinitely, which would otherwise
 *  look "newly finished" on every subsequent check. If every lang is
 *  already terminal, skips the API call entirely.
 * @param {Object[]} params.urls - The urls in the project.
 * @param {Object} params.actions - `{ saveState, sendMessage }` callbacks;
 *  `sendMessage` surfaces an error if no job has been created yet, or if
 *  the progress request itself fails.
 * @returns {Promise<void>}
 */
export async function getStatusAll({
  org, site, service, langs, urls, actions,
}) {
  const { saveState, sendMessage } = actions;
  const {
    origin, projectId, jobUid, env,
  } = service;
  const endpoint = resolveOrigin(origin, org, site);

  if (!jobUid?.value) {
    sendMessage({ text: 'Cannot check status: no Smartling job has been created yet.', type: 'error' });
    return;
  }

  // 'complete'/'cancelled' are terminal - Smartling keeps reporting 100%
  // translated forever once done, so without this guard every subsequent
  // status check would revert 'complete' back to 'translated' (triggering
  // a re-save) or 'cancelled' back to 'translated' (undoing the cancel).
  const activeLangs = langs.filter((l) => !['complete', 'cancelled'].includes(l.translation.status));
  if (!activeLangs.length) return;

  const progressByLocale = await fetchJobProgress(
    org,
    site,
    env,
    endpoint,
    projectId,
    jobUid.value,
  );
  if (!progressByLocale) {
    sendMessage({ text: 'Checking status failed: could not reach Smartling.', type: 'error' });
    return;
  }

  for (const lang of activeLangs) {
    const entry = progressByLocale.find((p) => p.targetLocaleId === lang.code);
    const percentComplete = entry?.percentComplete ?? 0;

    if (percentComplete === 100) {
      lang.translation.translated = urls.length;
      lang.translation.status = 'translated';
    } else {
      lang.translation.translated = 0;
      lang.translation.status = `${percentComplete}% translated`;
    }
  }

  await saveState();
}
