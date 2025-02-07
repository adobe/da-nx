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

export async function connect(config) {
  const { name, env } = config;
  const endpoint = config[`${env}.endpoint`];
  const userIdentifier = config[`${env}.userId`];
  const userSecret = config[`${env}.userSecret`];

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
    body.append('fileUri', url.basePath);
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
    fileUris: urls.map((url) => url.basePath),
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

export async function getItems(config, lang, urls) {
  const { env } = config;
  const endpoint = config[`${env}.endpoint`];
  const projectId = config[`${env}.projectId`];

  const opts = {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };

  const items = [];
  for (const url of urls) {
    const reqUrl = new URL(`${endpoint}/files-api/v2/projects/${projectId}/locales/${lang.code}/file`);
    reqUrl.searchParams.append('fileUri', url.basePath);

    const resp = await fetch(reqUrl, opts);
    const blob = await resp.blob();
    // const dom = parser.parseFromString(text, 'text/html');
    // const bodyEl = dom.body;

    items.push({ ...url, blob });
  }
  return items;
}

export async function sendAllLanguages(title, config, langs, urls, actions, state) {
  const { setStatus, saveState } = actions;
  const { env } = config;
  const endpoint = config[`${env}.endpoint`];
  const projectId = config[`${env}.projectId`];

  setStatus(`Creating job in Smartling for: ${title}.`);
  const jobUid = await createJob(endpoint, projectId, title, langs);
  if (!jobUid) return;

  // Presist to the state for future reference
  state.config[`translation.service.${env}.jobUid`] = { value: jobUid };

  // Persist into the immediate config object - janktown, but ok for now
  config[`${env}.jobUid`] = jobUid;

  setStatus(`Creating a batch in Smartling for: ${title}.`);
  const batchUid = await createBatch(endpoint, projectId, jobUid, urls);
  if (!batchUid) return;

  // Presist to the state for future reference
  state.config[`translation.service.${env}.batchUid`] = { value: batchUid };

  // Persist into the immediate config object - janktown, but ok for now
  config[`${env}.batchUid`] = batchUid;

  setStatus(`Uploading ${urls.length} items to Smartling for job: ${title}.`);
  const results = await uploadFiles(endpoint, projectId, jobUid, batchUid, langs, urls);
  const accepted = results.filter((result) => result === 'ACCEPTED').length;

  langs.forEach((lang) => {
    lang.translation.sent = accepted;
    lang.translation.status = accepted === urls.length ? 'created' : 'error';
  });

  setStatus();
  saveState();
}

export async function getStatusAll(title, config, langs, urls, actions) {
  const { setStatus, saveState } = actions;
  const { env } = config;
  const endpoint = config[`${env}.endpoint`];
  const projectId = config[`${env}.projectId`];
  const jobUid = config[`${env}.jobUid`];

  const opts = { headers: { 'Content-Type': 'application/json' } };
  opts.headers.Authorization = `Bearer ${token}`;

  langs.forEach((lang) => lang.translation.translated = 0);

  for (const url of urls) {
    const resp = await fetch(`${endpoint}/jobs-api/v3/projects/${projectId}/jobs/${jobUid}/file/progress?fileUri=${url.basePath}`, opts);
    const { response } = await resp.json();
    if (response.code !== 'SUCCESS') return;
    const langReports = response?.data?.contentProgressReport;
    if (!langReports) return;
    langReports.forEach((report) => {
      const { targetLocaleId, progress } = report;
      const lang = langs.find((projLang) => projLang.code === targetLocaleId);
      // Previously translated files will have a null progress object.
      if (!progress || progress.percentComplete == 100) {
        lang.translation.translated += 1;
      }
    });
  }
}
