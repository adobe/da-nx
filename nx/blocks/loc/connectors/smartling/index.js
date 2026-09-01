import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';
import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import fetchWithRetry from '../../utils/fetchWithRetry.js';

export const dnt = { addDnt };

const REFRESH_BUFFER_MS = 5000; // refresh this long before the token actually expires
const FALLBACK_EXPIRES_IN_S = 280; // used only if the API response omits expiresIn
const MIN_REFRESH_DELAY_MS = 2000; // never schedule a refresh sooner than this
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
// Credentials retained so a failed refresh can fall back to a full
// re-authentication: Smartling caps a token pair's session at 12 hours
// regardless of how many times it's refreshed, so refreshes eventually
// start failing even though the original userId/userSecret still work.
let authCredentials;

/**
 * Caches the current access token in the ES module and persists both
 * tokens plus a computed expiry to localStorage.
 * @param {string} name - The connector's display name (e.g. 'Smartling').
 * @param {string} env - The environment key (e.g. 'prod').
 * @param {string} accessToken - The current access token.
 * @param {string} refreshToken - The current refresh token.
 * @param {number} [expiresInSecs] - Seconds until `accessToken` expires;
 *  falls back to `FALLBACK_EXPIRES_IN_S` if omitted.
 * @returns {void}
 */
function setTokenDetails(name, env, accessToken, refreshToken, expiresInSecs) {
  token = accessToken;
  const timestamp = Date.now();
  const expiresInMs = (expiresInSecs ?? FALLBACK_EXPIRES_IN_S) * 1000;
  localStorage.setItem(`${name.toLowerCase()}.${env}.token`, JSON.stringify({ accessToken, refreshToken, expires: timestamp + expiresInMs }));
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

/**
 * Authenticates with Smartling using a user's identifier/secret.
 * @param {string} endpoint - The resolved Smartling API origin.
 * @param {string} userIdentifier - The Smartling user identifier.
 * @param {string} userSecret - The Smartling user secret.
 * @returns {Promise<Object|null>} The response's `accessToken`,
 *  `refreshToken`, and `expiresIn`, or null on failure.
 */
async function authenticate(endpoint, userIdentifier, userSecret) {
  const body = JSON.stringify({ userIdentifier, userSecret });
  const opts = { ...BASE_OPTS, body };

  const resp = await fetchWithRetry(`${endpoint}/auth-api/v2/authenticate`, opts);
  if (!resp.ok) return null;
  const json = await resp.json();
  return json?.response?.data || null;
}

/**
 * Refreshes the current access token, falling back to a full
 * re-authentication with the original credentials if the refresh token
 * itself has stopped working (Smartling caps a token pair's session at
 * 12 hours regardless of how many times it's refreshed). Persists the
 * new token, but leaves rescheduling the next proactive refresh to the
 * caller - used both by the proactive schedule below and reactively via
 * `onUnauthorized` when a request 401s before that schedule catches up
 * (e.g. the tab was backgrounded and its timers were throttled).
 * @returns {Promise<{accessToken: string, expiresIn: number}|null>} The
 *  new token details, or null if both the refresh and the fallback
 *  re-authentication failed.
 */
async function refreshOrReauthenticate() {
  const { name, env, endpoint, userIdentifier, userSecret } = authCredentials;
  const { refreshToken: currRefreshToken } = getTokenDetails(name, env);

  const body = JSON.stringify({ refreshToken: currRefreshToken });
  const opts = { ...BASE_OPTS, body };
  const resp = await fetchWithRetry(`${endpoint}/auth-api/v2/authenticate/refresh`, opts);
  let data = resp.ok ? (await resp.json())?.response?.data : null;

  if (!data?.accessToken) data = await authenticate(endpoint, userIdentifier, userSecret);
  if (!data?.accessToken) return null;

  const { accessToken, refreshToken, expiresIn } = data;
  setTokenDetails(name, env, accessToken, refreshToken, expiresIn);
  return { accessToken, expiresIn };
}

/**
 * Schedules a token refresh shortly before the current token expires,
 * tracking Smartling's actual reported `expiresIn` instead of assuming a
 * constant lifetime (that value shrinks as a session nears its 12-hour
 * cap). Only stops rescheduling once `refreshOrReauthenticate` fails
 * outright, so a translation job that outlives several sessions keeps
 * working without user intervention.
 * @param {number} [expiresInSecs] - Seconds until the current token
 *  expires; falls back to `FALLBACK_EXPIRES_IN_S` if omitted.
 * @returns {void}
 */
function scheduleRefresh(expiresInSecs) {
  const expiresInMs = (expiresInSecs ?? FALLBACK_EXPIRES_IN_S) * 1000;
  const delay = Math.max(expiresInMs - REFRESH_BUFFER_MS, MIN_REFRESH_DELAY_MS);

  clearTimeout(tokenPolling);
  tokenPolling = setTimeout(async () => {
    const refreshed = await refreshOrReauthenticate();
    if (!refreshed) {
      // Both refresh and re-authentication failed - stop polling rather than
      // hammering the API forever with credentials that no longer work.
      token = undefined;
      tokenPolling = undefined;
      return;
    }
    scheduleRefresh(refreshed.expiresIn);
  }, delay);
}

/**
 * Builds a `fetchWithRetry` `onUnauthorized` callback: refreshes (or
 * re-authenticates) the token, reschedules the next proactive refresh
 * against the new expiry, and rebuilds `opts` with a fresh Authorization
 * header - so a 401, e.g. from a token that expired while the tab was
 * backgrounded before the proactive refresh above could run, triggers
 * exactly one retry with a valid token instead of failing the request
 * outright.
 * @param {Object} opts - The fetch options to rebuild on success.
 * @returns {() => Promise<Object|null>} Callback for `fetchWithRetry`'s
 *  `onUnauthorized` config.
 */
function onUnauthorized(opts) {
  return async () => {
    const refreshed = await refreshOrReauthenticate();
    if (!refreshed) return null;
    scheduleRefresh(refreshed.expiresIn);
    return { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${refreshed.accessToken}` } };
  };
}

/**
 * Checks for a still-valid cached token and, if found, resumes background
 * refresh scheduling (e.g. after a page reload) instead of requiring the
 * user to reconnect.
 * @param {Object} config - The service configuration, including
 *  `userId`/`userSecret` (retained for a later refresh-failure fallback)
 *  and `origin`/`org`/`site` to resolve the API endpoint.
 * @returns {Promise<boolean>} Whether a still-valid cached token was found.
 */
export async function isConnected(config) {
  const {
    name, env, userId, userSecret, origin, org, site,
  } = config;
  const endpoint = resolveOrigin(origin, org, site);
  const { expires, accessToken } = getTokenDetails(name, env);
  const notExpired = expires > Date.now();

  if (notExpired && !tokenPolling) {
    // Cache the token for the ES Module
    token = accessToken;
    authCredentials = { name, env, endpoint, userIdentifier: userId, userSecret };

    // Kick off the refresh scheduling
    scheduleRefresh((expires - Date.now()) / 1000);
    return true;
  }

  return false;
}

/**
 * Authenticates with Smartling and starts background refresh scheduling.
 * @param {Object} service - The service configuration.
 * @param {string} service.name - The connector's display name.
 * @param {string} service.origin - The configured API origin.
 * @param {string} service.env - The environment key (e.g. 'prod').
 * @param {string} service.userId - The Smartling user identifier.
 * @param {string} service.userSecret - The Smartling user secret.
 * @param {string} service.org - The DA org.
 * @param {string} service.site - The DA site.
 * @returns {Promise<boolean>} Whether authentication succeeded.
 */
export async function connect(service) {
  const {
    name, origin, env, userId, userSecret, org, site,
  } = service;
  const endpoint = resolveOrigin(origin, org, site);

  const data = await authenticate(endpoint, userId, userSecret);
  if (!data?.accessToken) return false;

  authCredentials = { name, env, endpoint, userIdentifier: userId, userSecret };
  const { accessToken, refreshToken, expiresIn } = data;
  setTokenDetails(name, env, accessToken, refreshToken, expiresIn);
  scheduleRefresh(expiresIn);
  return true;
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

    const opts = { method: 'POST', body, headers: { Authorization: `Bearer ${token}` } };

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
  opts.headers.Authorization = `Bearer ${token}`;

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
  opts.headers.Authorization = `Bearer ${token}`;

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
        Authorization: `Bearer ${token}`,
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
    const opts = { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
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
