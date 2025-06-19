import { Queue } from '../../../../public/utils/tree.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';

export const dnt = { addDnt };

const REFRESH_TIME = 280000; // 4.666 minutes
const BASE_OPTS = {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
};

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
  const { name, origin, env, userId, userSecret } = service;
  const userIdentifier = userId;

  const body = JSON.stringify({ userIdentifier, userSecret });

  const opts = { ...BASE_OPTS, body };

  const resp = await fetch(`${origin}/auth-api/v2/authenticate`, opts);
  if (!resp.ok) return false;
  const json = await resp.json();
  const { accessToken, refreshToken } = json?.response?.data || {};
  setTokenDetails(name, env, accessToken, refreshToken);
  if (refreshToken) refreshTheToken(name, env, origin, refreshToken);
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
  saveToDa,
}) {
  const { origin, projectId } = service;

  const opts = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  const downloadCallback = async (url) => {
    const text = await downloadFile(opts, origin, projectId, lang, url);

    url.sourceContent = await removeDnt({ org, site, html: text, ext: url.ext });

    await saveToDa(url);
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

export async function sendAllLanguages({ title, options, langs, urls, actions }) {
  const { sendMessage, saveState } = actions;

  const { origin, projectId } = options.service;

  sendMessage({ text: `Creating job in Smartling for: ${title}.` });
  const jobUid = await createJob(origin, projectId, title, langs);
  if (!jobUid) return;

  // Presist to the state for future reference
  options.service.jobUid = { value: jobUid };

  // // Persist into the immediate config object - janktown, but ok for now
  // config[`${env}.jobUid`] = jobUid;

  sendMessage({ text: `Creating a batch in Smartling for: ${title}.` });
  const batchUid = await createBatch(origin, projectId, jobUid, urls);
  if (!batchUid) return;

  // Presist to the state for future reference
  options.service.batchUid = { value: batchUid };

  // // Persist into the immediate config object - janktown, but ok for now
  // config[`${env}.batchUid`] = batchUid;

  sendMessage({ text: `Uploading ${urls.length} items to Smartling for job: ${title}.` });
  const results = await uploadFiles(origin, projectId, jobUid, batchUid, langs, urls);
  const accepted = results.filter((result) => result === 'ACCEPTED').length;

  langs.forEach((lang) => {
    lang.translation ??= {};
    lang.translation.sent = accepted;
    lang.translation.status = accepted === urls.length ? 'created' : 'error';
  });

  saveState({ options });
}

export async function getStatusAll({ service, langs, urls, actions }) {
  const { saveState } = actions;
  const { origin, projectId, jobUid } = service;

  const opts = { headers: { 'Content-Type': 'application/json' } };
  opts.headers.Authorization = `Bearer ${token}`;

  langs.forEach((lang) => { lang.translation.translated = 0; });

  for (const url of urls) {
    const resp = await fetch(`${origin}/jobs-api/v3/projects/${projectId}/jobs/${jobUid.value}/file/progress?fileUri=${url.daBasePath}`, opts);
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
