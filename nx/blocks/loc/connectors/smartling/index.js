import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';
import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';

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

    const resp = await fetch(`${endpoint}/auth-api/v2/authenticate/refresh`, opts);
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

  const resp = await fetch(`${endpoint}/auth-api/v2/authenticate`, opts);
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

    const resp = await fetch(uploadUrl, opts);
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
  const resp = await fetch(url, opts);
  if (!resp.ok) return null;
  const json = await resp.json();
  const { translationJobUid: jobUid } = json.response.data;
  return jobUid;
}

async function createBatch(endpoint, projectId, jobUid, urls) {
  const body = JSON.stringify({
    authorize: false,
    translationJobUid: jobUid,
    fileUris: urls.map((url) => url.daBasePath),
  });

  const opts = { ...BASE_OPTS, body };
  opts.headers.Authorization = `Bearer ${token}`;

  const url = `${endpoint}/job-batches-api/v2/projects/${projectId}/batches`;

  const resp = await fetch(url, opts);
  if (!resp.ok) return null;
  const json = await resp.json();
  const { batchUid } = json.response.data;
  return batchUid;
}

async function downloadFile(opts, origin, projectId, lang, url) {
  const reqUrl = new URL(`${origin}/files-api/v2/projects/${projectId}/locales/${lang.code}/file`);
  reqUrl.searchParams.append('fileUri', url.daBasePath);

  const resp = await fetch(reqUrl, opts);
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

export async function sendAllLanguages({
  org, site, title, options, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;

  const { origin, projectId } = options.service;
  const endpoint = resolveOrigin(origin, org, site);

  sendMessage({ text: `Creating job in Smartling for: ${title}.` });
  const jobUid = await createJob(endpoint, projectId, title, langs);
  if (!jobUid) return;

  // Presist to the state for future reference
  options.service.jobUid = { value: jobUid };

  // // Persist into the immediate config object - janktown, but ok for now
  // config[`${env}.jobUid`] = jobUid;

  sendMessage({ text: `Creating a batch in Smartling for: ${title}.` });
  const batchUid = await createBatch(endpoint, projectId, jobUid, urls);
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

const PROCESS_POLL_INTERVAL_MS = 2000;
const MAX_PROCESS_POLL_ATTEMPTS = 30; // ~60s before giving up on an async process

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Polls Smartling's job async-process endpoint (`getJobAsyncProcessStatus`)
 * until a submitted operation reports a terminal `processState`. Used for
 * the 202 case of `removeLocaleFromJob`, whose removal isn't guaranteed
 * complete until this reports `COMPLETED`.
 * @param {string} endpoint - The resolved Smartling API origin.
 * @param {string} projectId - The Smartling project id.
 * @param {string} jobUid - The job the process belongs to.
 * @param {string} processUid - The process to poll.
 * @returns {Promise<string>} The final `processState` ('COMPLETED' or
 *  'FAILED'); also resolves to 'FAILED' if a poll request errors or the
 *  process doesn't finish within `MAX_PROCESS_POLL_ATTEMPTS`.
 */
async function pollJobProcess(endpoint, projectId, jobUid, processUid) {
  const url = `${endpoint}/jobs-api/v3/projects/${projectId}/jobs/${jobUid}/processes/${processUid}`;
  const opts = { headers: { Authorization: `Bearer ${token}` } };

  for (let attempt = 0; attempt < MAX_PROCESS_POLL_ATTEMPTS; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetch(url, opts);
    if (!resp.ok) return 'FAILED';
    // eslint-disable-next-line no-await-in-loop
    const json = await resp.json();
    const { processState } = json?.response?.data || {};
    if (processState === 'COMPLETED' || processState === 'FAILED') return processState;
    // eslint-disable-next-line no-await-in-loop
    await wait(PROCESS_POLL_INTERVAL_MS);
  }

  return 'FAILED';
}

/**
 * Cancels a single target language by removing its locale from the
 * shared translation job (`removeLocaleFromJob`) - not Smartling's
 * job-level `cancelJob` endpoint, which would cancel every other
 * language still sharing that job, since `sendAllLanguages` sends every
 * target language as one job. Polls the returned process to completion
 * when Smartling responds 202 (async removal).
 * @param {Object} params
 * @param {Object} params.service - The service configuration; reads
 *  `origin`/`org`/`site`/`projectId`/`jobUid`.
 * @param {Object} params.lang - The language to cancel; mutated in place
 *  with `translation.status = 'cancelled'` on success.
 * @param {Function} params.sendMessage - Callback to surface a
 *  status/error message to the user.
 * @returns {Promise<{ok: boolean, skipped?: boolean}>} Whether the
 *  cancellation succeeded (or was skipped as a no-op).
 */
export async function cancelTranslation({ service, lang, sendMessage }) {
  if (!lang.translation || !service.jobUid?.value) {
    sendMessage({ text: `Skipping ${lang.name}. No translation information.` });
    return { ok: true, skipped: true };
  }

  const {
    origin, org, site, projectId, jobUid,
  } = service;
  const endpoint = resolveOrigin(origin, org, site);
  const translationJobUid = jobUid.value;

  sendMessage({ text: `Canceling ${lang.name}.` });

  const url = `${endpoint}/jobs-api/v3/projects/${projectId}/jobs/${translationJobUid}/locales/${lang.code}`;
  const opts = { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } };

  const resp = await fetch(url, opts);
  if (!resp.ok) {
    const json = await resp.json();
    sendMessage({ text: `Canceling ${lang.name} failed: ${extractErrorMessage(json)}`, type: 'error' });
    return { ok: false };
  }

  if (resp.status === 202) {
    const json = await resp.json();
    const { processUid } = json?.response?.data || {};
    const processState = processUid
      ? await pollJobProcess(endpoint, projectId, translationJobUid, processUid)
      : 'FAILED';

    if (processState !== 'COMPLETED') {
      sendMessage({ text: `Canceling ${lang.name} did not finish in time - check Smartling directly.`, type: 'error' });
      return { ok: false };
    }
  }

  lang.translation.status = 'cancelled';
  return { ok: true };
}

export async function getStatusAll({
  org, site, service, langs, urls, actions,
}) {
  const { saveState } = actions;
  const { origin, projectId, jobUid } = service;
  const endpoint = resolveOrigin(origin, org, site);

  const opts = { headers: { 'Content-Type': 'application/json' } };
  opts.headers.Authorization = `Bearer ${token}`;

  langs.forEach((lang) => { lang.translation.translated = 0; });

  for (const url of urls) {
    const resp = await fetch(`${endpoint}/jobs-api/v3/projects/${projectId}/jobs/${jobUid.value}/file/progress?fileUri=${url.daBasePath}`, opts);
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

  // 'complete'/'cancelled' are terminal - Smartling keeps reporting 100%
  // translated forever once done, so without this guard every subsequent
  // status check would revert 'complete' back to 'translated' (triggering
  // a re-save) or 'cancelled' back to 'translated' (undoing the cancel).
  for (const lang of langs.filter((l) => !['complete', 'cancelled'].includes(l.translation.status))) {
    if (lang.translation.translated === urls.length) {
      lang.translation.status = 'translated';
    }
  }

  await saveState();
}
