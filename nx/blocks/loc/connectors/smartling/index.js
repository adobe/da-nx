import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';
import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import fetchWithRetry from '../../utils/fetchWithRetry.js';

export const dnt = { addDnt };

const REFRESH_TIME = 280000; // 4.666 minutes
const BASE_OPTS = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
};

// translate.da.live's legacy /smartling route is deprecated in favor of
// /translate/smartling/<org>/<site> - rewrite configs still pointing at the
// old origin so they keep working without a config migration.
function resolveOrigin(origin, org, site) {
  return origin === `${DA_TRANSLATE}/smartling`
    ? `${DA_TRANSLATE}/translate/smartling/${org}/${site}`
    : origin;
}

let token;
let tokenPolling;

function setTokenDetails(name, env, accessToken, refreshToken) {
  token = accessToken;
  const timestamp = Date.now();
  localStorage.setItem(`${name.toLowerCase()}.${env}.token`, JSON.stringify({ accessToken, refreshToken, expires: timestamp + REFRESH_TIME }));
}

function getTokenDetails(name, env) {
  const lsTokenDetails = localStorage.getItem(`${name.toLowerCase()}.${env}.token`);
  if (lsTokenDetails) {
    try {
      return JSON.parse(lsTokenDetails);
    } catch {
      return {};
    }
  }
  return {};
}

function refreshTheToken(name, env, endpoint) {
  tokenPolling = setInterval(async () => {
    const { refreshToken: currRefreshToken } = getTokenDetails(name, env);
    const body = JSON.stringify({ refreshToken: currRefreshToken });
    const opts = { ...BASE_OPTS, body };

    const resp = await fetchWithRetry(`${endpoint}/auth-api/v2/authenticate/refresh`, opts);
    if (!resp.ok) token = undefined;
    const json = await resp.json();

    const { accessToken, refreshToken } = json?.response?.data || {};
    if (accessToken && refreshToken) setTokenDetails(name, env, accessToken, refreshToken);
  }, REFRESH_TIME - 5000);
}

export async function isConnected(config) {
  const { name, env } = config;
  const endpoint = config[`${env}.endpoint`];
  const { expires, refreshToken, accessToken } = getTokenDetails(name, env);
  const notExpired = expires > Date.now();

  if (notExpired && !tokenPolling) {
    // Cache the token for the ES Module
    setTokenDetails(name, env, accessToken, refreshToken);

    // Kick off the refresh polling
    refreshTheToken(name, env, endpoint, refreshToken);
    return true;
  }

  return false;
}

export async function connect(service) {
  const {
    name, origin, env, userId, userSecret, org, site,
  } = service;
  const endpoint = resolveOrigin(origin, org, site);
  const userIdentifier = userId;

  const body = JSON.stringify({ userIdentifier, userSecret });

  const opts = { ...BASE_OPTS, body };

  const resp = await fetchWithRetry(`${endpoint}/auth-api/v2/authenticate`, opts);
  if (!resp.ok) return false;
  const json = await resp.json();
  const { accessToken, refreshToken } = json?.response?.data || {};
  setTokenDetails(name, env, accessToken, refreshToken);
  if (refreshToken) refreshTheToken(name, env, endpoint, refreshToken);
  return true;
}

async function uploadFiles(endpoint, projectId, jobUid, batchUid, langs, urls) {
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

    const opts = { method: 'POST', body, headers: { Authorization: `Bearer ${token}` } };

    const resp = await fetchWithRetry(uploadUrl, opts);
    const json = await resp.json();
    results.push(json.response.code);
  }

  return results;
}

async function createJob(endpoint, projectId, title, langs) {
  const timestamp = Date.now();
  const jobName = `${title}-${timestamp}`;
  const targetLocaleIds = langs.map((lang) => lang.code);

  const body = JSON.stringify({ jobName, targetLocaleIds });
  const opts = { ...BASE_OPTS, body };
  opts.headers.Authorization = `Bearer ${token}`;

  const url = `${endpoint}/jobs-api/v3/projects/${projectId}/jobs`;
  const resp = await fetchWithRetry(url, opts);
  if (!resp.ok) return null;
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
 * @returns {Promise<string|null>} The new batch's id, or null on failure.
 */
async function createBatch(endpoint, projectId, jobUid, urls, autoAuthorize) {
  const body = JSON.stringify({
    authorize: autoAuthorize,
    translationJobUid: jobUid,
    fileUris: urls.map((url) => url.daBasePath),
  });

  const opts = { ...BASE_OPTS, body };
  opts.headers.Authorization = `Bearer ${token}`;

  const url = `${endpoint}/job-batches-api/v2/projects/${projectId}/batches`;

  const resp = await fetchWithRetry(url, opts);
  if (!resp.ok) return null;
  const json = await resp.json();
  const { batchUid } = json.response.data;
  return batchUid;
}

async function downloadFile(opts, origin, projectId, lang, url) {
  const reqUrl = new URL(`${origin}/files-api/v2/projects/${projectId}/locales/${lang.code}/file`);
  reqUrl.searchParams.append('fileUri', url.daBasePath);

  const resp = await fetchWithRetry(reqUrl, opts);
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

  const opts = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  const downloadCallback = async (url) => {
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
  const jobUid = await createJob(endpoint, projectId, title, langs);
  if (!jobUid) return;

  // Presist to the state for future reference
  options.service.jobUid = { value: jobUid };

  // // Persist into the immediate config object - janktown, but ok for now
  // config[`${env}.jobUid`] = jobUid;

  sendMessage({ text: `Creating a batch in Smartling for: ${title}.` });
  const batchUid = await createBatch(endpoint, projectId, jobUid, urls, autoAuthorize === 'yes');
  if (!batchUid) return;

  // Presist to the state for future reference
  options.service.batchUid = { value: batchUid };

  // // Persist into the immediate config object - janktown, but ok for now
  // config[`${env}.batchUid`] = batchUid;

  sendMessage({ text: `Uploading ${urls.length} items to Smartling for job: ${title}.` });
  const results = await uploadFiles(endpoint, projectId, jobUid, batchUid, langs, urls);
  const accepted = results.filter((result) => result === 'ACCEPTED').length;

  langs.forEach((lang) => {
    lang.translation ??= {};
    lang.translation.sent = accepted;
    lang.translation.status = accepted === urls.length ? 'created' : 'error';
  });

  await saveState({ options });
}

/**
 * Computes Smartling's translation progress percentage for one locale's
 * string counts, per Smartling's own documented formula (Checking File
 * Translation Status): floors the result rather than rounding — 99.9999%
 * complete must report as 99%, not 100% — and treats a fully-excluded
 * file (nothing left to translate) as 100%.
 * @param {Object} counts
 * @param {number} counts.totalStringCount - Strings in the file.
 * @param {number} counts.completedStringCount - Published strings.
 * @param {number} counts.excludedStringCount - Strings excluded from
 *  translation.
 * @returns {number} Progress percentage, 0-100.
 */
function translationProgress({ totalStringCount, completedStringCount, excludedStringCount }) {
  const denominator = totalStringCount - excludedStringCount;
  if (denominator === 0) return 100;
  return Math.floor((completedStringCount / denominator) * 100);
}

/**
 * Fetches per-locale translation status counts for a single file. Unlike
 * the job-scoped file/progress endpoint, this needs no jobUid.
 *
 * `totalStringCount` is a file-level count (the source content is the
 * same regardless of target locale) — it is not repeated per item in
 * Smartling's response, so it's returned alongside `items` rather than
 * on each one.
 * @param {string} endpoint - The resolved Smartling API origin.
 * @param {string} projectId - The Smartling project id.
 * @param {string} fileUri - The file's DA base path.
 * @returns {Promise<{totalStringCount: number, items: Object[]}>} The
 *  file's total string count and its per-locale completed/excluded
 *  counts, or zero/empty on failure.
 */
async function fetchFileStatus(endpoint, projectId, fileUri) {
  const url = new URL(`${endpoint}/files-api/v2/projects/${projectId}/file/status`);
  url.searchParams.set('fileUri', fileUri);
  const opts = { headers: { Authorization: `Bearer ${token}` } };

  const resp = await fetchWithRetry(url, opts);
  if (!resp.ok) return { totalStringCount: 0, items: [] };
  const { response } = await resp.json();
  const { totalStringCount = 0, items = [] } = response?.data || {};
  return { totalStringCount, items };
}

/**
 * Refreshes translation status for every target language of a job by
 * polling per-locale file status (Smartling's recommended
 * getFileTranslationStatusAllLocales endpoint).
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {Object} params.service - The service configuration.
 * @param {Object[]} params.langs - Target languages; mutated in place with
 *  `translation.status` ('translated' once every file is complete for
 *  that locale, otherwise Smartling's real progress percentage, e.g.
 *  '62% translated') and `translation.translated` (files complete).
 * @param {Object[]} params.urls - The urls in the project.
 * @param {Object} params.actions - `{ saveState }` callback.
 * @returns {Promise<void>}
 */
export async function getStatusAll({
  org, site, service, langs, urls, actions,
}) {
  const { saveState } = actions;
  const { origin, projectId } = service;
  const endpoint = resolveOrigin(origin, org, site);

  langs.forEach((lang) => { lang.translation.translated = 0; });

  for (const url of urls) {
    // eslint-disable-next-line no-await-in-loop
    const { totalStringCount, items } = await fetchFileStatus(endpoint, projectId, url.daBasePath);
    items.forEach((item) => {
      const lang = langs.find((projLang) => projLang.code === item.localeId);
      if (!lang) return;
      const progress = translationProgress({ totalStringCount, ...item });
      if (progress === 100) {
        lang.translation.translated += 1;
      } else {
        lang.translation.status = `${progress}% translated`;
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
