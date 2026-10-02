import { addDnt, removeDnt } from '../../dnt/dnt.js';
import downloadQueue from '../../utils/downloadQueue.js';
import fetchWithRetry from '../../utils/fetchWithRetry.js';
import { Queue } from '../../../../../nx2/public/utils/tree.js';
import {
  BASE_OPTS, resolveOrigin, getToken, onUnauthorized, isConnected, connect as establishConnection,
} from './auth.js';

export const requiredKeys = ['origin'];

export const requiredAnyKeys = [['accountUid', 'projectId']];

export const requiredCredentialKeys = ['userIdentifier', 'userSecret'];

const MAX_CONCURRENT_STATUS = 5;
const TERMINAL_STATUSES = ['complete', 'cancelled'];

export const dnt = { addDnt };

export { isConnected };

/**
 * Authenticates with Smartling via da-etc.
 * @param {Object} service - The service configuration.
 * @param {Function} [sendMessage] - Surfaces an error message on failure.
 * @returns {Promise<boolean>} Whether authentication succeeded.
 */
export async function connect(service, sendMessage) {
  const connected = await establishConnection(service);
  if (!connected) sendMessage?.({ text: 'Connection to Smartling failed.', type: 'error' });
  return connected;
}

/**
 * Fetches a Smartling project's details (incl. `accountUid`, `sourceLocaleId`).
 * @param {Object} params
 * @param {Object} params.service - The flattened per-environment service config.
 * @param {string} params.endpoint - The Smartling API origin.
 * @param {string} params.projectId - The project to look up.
 * @returns {Promise<Object|null>} The project details, or null on failure.
 */
async function fetchProjectDetails({ service, endpoint, projectId }) {
  const { org, site, env } = service;
  const url = `${endpoint}/projects-api/v2/projects/${projectId}`;
  const opts = { headers: { Authorization: `Bearer ${getToken(org, site, env)}` } };
  const resp = await fetchWithRetry(url, opts, { onUnauthorized: onUnauthorized(opts) });
  if (!resp.ok) return null;
  const { response } = await resp.json();
  return response?.data || null;
}

/**
 * Resolves the `accountUid` for account-scoped lookups. Prefers the `accountUid`
 * config, falling back to looking it up from the deprecated `projectId`.
 * @param {Object} service - The flattened per-environment service config.
 * @param {string} endpoint - The Smartling API origin.
 * @returns {Promise<{accountUid?: string, project?: Object, lookupFailed?: boolean}>}
 *  `project` is set when it was fetched; `lookupFailed` when the `projectId`
 *  lookup failed. Empty if neither is configured.
 */
async function resolveAccountUid(service, endpoint) {
  const { accountUid, projectId } = service;
  if (accountUid) return { accountUid };
  if (!projectId) return {};

  const project = await fetchProjectDetails({ service, endpoint, projectId });
  if (!project?.accountUid) return { lookupFailed: true };
  return { accountUid: project.accountUid, project };
}

const PROJECTS_PAGE_SIZE = 500;
const PROJECTS_MAX_PAGES = 20;
const WORKFLOWS_LIMIT = 500;

/**
 * Walks offset-paginated pages until `totalCount` is reached.
 * @param {Object} params
 * @param {(offset: number) => Promise<{items?: Object[], totalCount?: number,
 *  error?: number}>} params.fetchPage - Fetches one page at the given offset.
 * @param {number} [params.page] - Zero-based page index.
 * @param {Object[]} [params.collected] - Items from prior pages.
 * @returns {Promise<{items: Object[], incomplete: boolean}>} `incomplete` if a
 *  page failed or the page cap was hit.
 */
async function collectProjectPages({ fetchPage, page = 0, collected = [] }) {
  const result = await fetchPage(collected.length);
  if (result.error) return { items: collected, incomplete: true };

  const items = [...collected, ...result.items];
  const done = !result.items.length || (Number.isFinite(result.totalCount)
    ? items.length >= result.totalCount
    : result.items.length < PROJECTS_PAGE_SIZE);
  if (done) return { items, incomplete: false };
  if (page + 1 >= PROJECTS_MAX_PAGES) return { items, incomplete: true };
  return collectProjectPages({ fetchPage, page: page + 1, collected: items });
}

/**
 * Lists the account's non-archived projects for the `projectId` option.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Promise<{items: {projectId: string, projectName: string}[],
 *  incomplete: boolean}>} `incomplete` if a lookup failed or was truncated.
 */
export async function listProjects(service) {
  const { org, site, env, origin } = service;
  const endpoint = resolveOrigin(origin, org, site);

  const { accountUid, lookupFailed } = await resolveAccountUid(service, endpoint);
  if (!accountUid) return { items: [], incomplete: !!lookupFailed };

  const baseUrl = `${endpoint}/accounts-api/v2/accounts/${accountUid}/projects`;
  const opts = { headers: { Authorization: `Bearer ${await getToken(org, site, env)}` } };
  const fetchPage = async (offset) => {
    const url = `${baseUrl}?offset=${offset}&limit=${PROJECTS_PAGE_SIZE}`;
    const resp = await fetchWithRetry(url, opts, { onUnauthorized: onUnauthorized(opts) });
    if (!resp.ok) return { error: resp.status };
    const { response } = await resp.json();
    return { items: response?.data?.items || [], totalCount: response?.data?.totalCount };
  };

  const { items, incomplete } = await collectProjectPages({ fetchPage });
  const projects = items
    .filter((project) => !project.archived)
    .map((project) => ({ projectId: project.projectId, projectName: project.projectName }));
  return { items: projects, incomplete };
}

/**
 * Runs one account-scoped workflow search.
 * @param {Object} params
 * @param {Object} params.service - The flattened per-environment service config.
 * @param {string} params.endpoint - The Smartling API origin.
 * @param {string} params.accountUid - The account to search.
 * @param {Object} params.filter - A `UserWorkflowFilterCommand` request body.
 * @returns {Promise<{items: Object[], incomplete: boolean}|{error: string}>}
 *  `incomplete` if the result was truncated.
 */
async function searchWorkflows({
  service, endpoint, accountUid, filter,
}) {
  const { org, site, env } = service;
  const limit = filter.limit ?? WORKFLOWS_LIMIT;
  const url = `${endpoint}/workflows-api/v3/accounts/${accountUid}/workflows`;
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await getToken(org, site, env)}` },
    body: JSON.stringify({ ...filter, limit }),
  };
  const resp = await fetchWithRetry(url, opts, { onUnauthorized: onUnauthorized(opts) });
  if (!resp.ok) return { error: `The workflow lookup failed (${resp.status}).` };

  const { response } = await resp.json();
  const items = response?.data?.items || [];
  const incomplete = items.length >= limit || response?.data?.totalCount > items.length;
  return { items, incomplete };
}

/**
 * Lists workflows that can authorize a job in the selected project, for the
 * `workflowUid` option. Merges a project-scoped search with account-wide CUSTOM
 * and LOCKED searches (each capped at 500), excluding other projects' workflows
 * and those without locale pairs.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Promise<{items: {workflowUid: string, workflowName: string}[],
 *  incomplete: boolean}>} `incomplete` if a lookup failed or was truncated.
 */
export async function listWorkflows(service) {
  const { org, site, origin, projectId } = service;
  const endpoint = resolveOrigin(origin, org, site);

  const { accountUid, lookupFailed } = await resolveAccountUid(service, endpoint);
  if (!accountUid) return { items: [], incomplete: !!lookupFailed };

  const filters = [
    ...(projectId ? [{ projectId }] : []),
    { localePairManagementType: 'CUSTOM' },
    { localePairManagementType: 'LOCKED' },
  ];
  const results = await Promise.all(filters.map((filter) => searchWorkflows({
    service, endpoint, accountUid, filter,
  })));

  const byUid = new Map(results
    .flatMap((result) => result.items || [])
    .filter((workflow) => !workflow.projectId || workflow.projectId === projectId)
    .filter((workflow) => workflow.localePairs?.length)
    .map((workflow) => [workflow.workflowUid, {
      workflowUid: workflow.workflowUid,
      workflowName: workflow.workflowName,
    }]));
  const incomplete = results.some((result) => result.error || result.incomplete);
  return { items: [...byUid.values()], incomplete };
}

/**
 * Checks that a workflow covers every target locale from the project's source
 * locale, so auto-authorize can't leave locales unauthorized.
 * @param {Object} params
 * @param {Object} params.service - The flattened per-environment service config.
 * @param {string} params.workflowUid - The selected workflow.
 * @param {{code: string}[]} params.langs - The languages being sent.
 * @returns {Promise<{error?: string}>} An `error` if the workflow can't be used.
 */
export async function checkWorkflowCoverage({ service, workflowUid, langs }) {
  const { org, site, origin } = service;
  const endpoint = resolveOrigin(origin, org, site);

  const { accountUid, project: resolvedProject } = await resolveAccountUid(service, endpoint);
  if (!accountUid) return { error: 'Could not verify the Smartling workflow. The Smartling account could not be resolved.' };

  const filter = { workflowUids: [workflowUid], limit: 1 };
  const result = await searchWorkflows({
    service, endpoint, accountUid, filter,
  });
  if (result.error) return { error: `Could not verify the Smartling workflow. ${result.error}` };

  const workflow = result.items.find((item) => item.workflowUid === workflowUid);
  if (!workflow) return { error: `Smartling workflow ${workflowUid} was not found.` };

  const name = workflow.workflowName || workflowUid;
  if (!workflow.localePairs?.length) {
    return { error: `Smartling workflow "${name}" has no locale pairs and can't authorize jobs.` };
  }

  const project = resolvedProject
    || await fetchProjectDetails({ service, endpoint, projectId: service.projectId });
  const { sourceLocaleId } = project || {};
  if (!sourceLocaleId) {
    return { error: 'Could not verify the Smartling workflow. The Smartling project\'s source locale could not be resolved.' };
  }

  const covered = new Set(workflow.localePairs
    .filter((pair) => pair.sourceLocaleId === sourceLocaleId)
    .flatMap((pair) => pair.targetLocaleIds || []));
  const missing = langs.map((lang) => lang.code).filter((code) => !covered.has(code));
  if (missing.length) {
    return { error: `Smartling workflow "${name}" doesn't cover: ${missing.join(', ')}.` };
  }
  return {};
}

/**
 * Service options the Options UI renders as live-populated selects. Options.js
 * reads this export generically: it calls `connect`, then each option's `fetch`.
 * @type {import('../../views/options/utils/utils.js').ServiceOption[]}
 */
export const serviceOptions = [
  {
    key: 'projectId',
    label: 'Project',
    required: true,
    fetch: async (service) => {
      const { items, incomplete } = await listProjects(service);
      return {
        items: items.map((project) => ({ value: project.projectId, label: project.projectName })),
        incomplete,
      };
    },
  },
  {
    key: 'autoAuthorize',
    label: 'Auto-authorize',
    fetch: async () => ([
      { value: 'no', label: 'Disabled' },
      { value: 'yes', label: 'Enabled' },
    ]),
  },
  {
    key: 'workflowUid',
    label: 'Workflow',
    dependsOn: ['projectId'],
    enabledWhen: (envConfig) => envConfig?.autoAuthorize === 'yes',
    fetch: async (service) => {
      const { items, incomplete } = await listWorkflows(service);
      return {
        items: [
          { value: '', label: 'Project default' },
          ...items.map((workflow) => ({
            value: workflow.workflowUid,
            label: workflow.workflowName,
          })),
        ],
        incomplete,
      };
    },
  },
];

/**
 * Extracts a readable message from Smartling's error envelope
 * (`{ response: { code, errors: [{ message }] } }`).
 * @param {Object} json - The parsed error response body.
 * @returns {string} The joined error messages, or `code` if there are none.
 */
function extractErrorMessage(json) {
  const errors = json?.response?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map((error) => error.message).join('; ');
  }
  return json?.response?.code || 'Unknown error';
}

/**
 * Uploads every url to a Smartling batch, reporting each rejected file.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {string} params.env - The environment key (e.g. 'prod').
 * @param {string} params.endpoint - The Smartling API origin.
 * @param {string} params.projectId - The Smartling project id.
 * @param {string} params.batchUid - The target batch.
 * @param {Object[]} params.langs - Target languages to authorize each file for.
 * @param {Object[]} params.urls - The urls to upload.
 * @param {Function} params.sendMessage - Surfaces status/error messages.
 * @returns {Promise<string[]>} Each file's response `code` (`'ACCEPTED'` on success).
 */
async function uploadFiles({
  org,
  site,
  env,
  endpoint,
  projectId,
  batchUid,
  langs,
  urls,
  sendMessage,
}) {
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
 * Creates a Smartling translation job.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {string} params.env - The environment key (e.g. 'prod').
 * @param {string} params.endpoint - The Smartling API origin.
 * @param {string} params.projectId - The Smartling project id.
 * @param {string} params.title - The project title, used in the job name.
 * @param {Object[]} params.langs - Target languages (`code` → `targetLocaleId`).
 * @param {Function} params.sendMessage - Surfaces status/error messages.
 * @returns {Promise<string|null>} The job id, or null on failure.
 */
async function createJob({
  org, site, env, endpoint, projectId, title, langs, sendMessage,
}) {
  const timestamp = Date.now();
  const jobName = `${title}-${timestamp}`;
  const targetLocaleIds = langs.map((lang) => lang.code);

  const body = JSON.stringify({ jobName, targetLocaleIds });
  const opts = { ...BASE_OPTS, body };
  opts.headers = { ...BASE_OPTS.headers, Authorization: `Bearer ${getToken(org, site, env)}` };

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
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {string} params.env - The environment key (e.g. 'prod').
 * @param {string} params.endpoint - The Smartling API origin.
 * @param {string} params.projectId - The Smartling project id.
 * @param {string} params.jobUid - The job to attach the batch to.
 * @param {Object[]} params.langs - Target languages, assigned to `workflowUid`.
 * @param {Object[]} params.urls - The urls to upload to this batch.
 * @param {boolean} params.autoAuthorize - Authorize the job once the batch completes.
 * @param {string} [params.workflowUid] - Workflow to authorize into when
 *  `autoAuthorize` is set; defaults to each locale's default workflow.
 * @param {Function} params.sendMessage - Surfaces status/error messages.
 * @returns {Promise<string|null>} The batch id, or null on failure.
 */
async function createBatch({
  org, site, env, endpoint, projectId, jobUid, langs, urls, autoAuthorize, workflowUid, sendMessage,
}) {
  const localeWorkflows = autoAuthorize && workflowUid
    ? langs.map((lang) => ({ targetLocaleId: lang.code, workflowUid }))
    : undefined;

  const body = JSON.stringify({
    authorize: autoAuthorize,
    translationJobUid: jobUid,
    fileUris: urls.map((url) => url.daBasePath),
    ...(localeWorkflows ? { localeWorkflows } : {}),
  });

  const opts = { ...BASE_OPTS, body };
  opts.headers = { ...BASE_OPTS.headers, Authorization: `Bearer ${getToken(org, site, env)}` };

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
 * Downloads one locale's translated file.
 * @param {Object} opts - Fetch options with the `Authorization` header.
 * @param {string} origin - The Smartling API origin.
 * @param {string} projectId - The Smartling project id.
 * @param {Object} lang - The target language (`code`).
 * @param {Object} url - The url to download (`daBasePath`).
 * @returns {Promise<string|null>} The translated content, or null on failure.
 */
async function downloadFile(opts, origin, projectId, lang, url) {
  const reqUrl = new URL(`${origin}/files-api/v2/projects/${projectId}/locales/${lang.code}/file`);
  reqUrl.searchParams.append('fileUri', url.daBasePath);

  const resp = await fetchWithRetry(reqUrl, opts, { onUnauthorized: onUnauthorized(opts) });
  if (!resp.ok) return null;
  return resp.text();
}

/**
 * Downloads and saves every url's translation for one language, reporting
 * each failed download.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {Object} params.service - The service configuration.
 * @param {Object} params.lang - The target language.
 * @param {Object[]} params.urls - Mutated with `sourceContent` and `status`.
 * @param {Function} params.saveFn - Persists a url's content.
 * @param {Function} params.sendMessage - Surfaces status/error messages.
 * @returns {Promise<Object[]>} The mutated urls.
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
 * Sends a project's urls to Smartling: creates a job and batch, then uploads.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {string} params.title - The project title.
 * @param {Object} params.options - Project options; mutates `options.service`.
 * @param {Object[]} params.langs - Mutated with `translation` status.
 * @param {Object[]} params.urls - The urls to translate.
 * @param {Object} params.actions - `{ sendMessage, saveState }` callbacks.
 * @returns {Promise<void>}
 */
export async function sendAllLanguages({
  org, site, title, options, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;

  const { origin, projectId, autoAuthorize, workflowUid, env } = options.service;
  const endpoint = resolveOrigin(origin, org, site);

  if (autoAuthorize === 'yes' && workflowUid) {
    const service = { ...options.service, org, site };
    const { error } = await checkWorkflowCoverage({ service, workflowUid, langs });
    if (error) {
      sendMessage({ text: error, type: 'error' });
      return;
    }
  }

  sendMessage({ text: `Creating job in Smartling for: ${title}.` });
  const jobUid = await createJob({
    org, site, env, endpoint, projectId, title, langs, sendMessage,
  });
  if (!jobUid) {
    sendMessage({ text: `Job creation failed for: ${title}.`, type: 'error' });
    return;
  }

  // Persist to the state for future reference
  options.service.jobUid = { value: jobUid };

  sendMessage({ text: `Creating a batch in Smartling for: ${title}.` });
  const batchUid = await createBatch({
    org,
    site,
    env,
    endpoint,
    projectId,
    jobUid,
    langs,
    urls,
    autoAuthorize: autoAuthorize === 'yes',
    workflowUid,
    sendMessage,
  });
  if (!batchUid) {
    sendMessage({ text: `Batch creation failed for: ${title}.`, type: 'error' });
    return;
  }

  // Persist to the state for future reference
  options.service.batchUid = { value: batchUid };

  // // Persist into the immediate config object - janktown, but ok for now
  // config[`${env}.batchUid`] = batchUid;

  sendMessage({ text: `Uploading ${urls.length} items to Smartling for job: ${title}.` });
  const results = await uploadFiles({
    org,
    site,
    env,
    endpoint,
    projectId,
    batchUid,
    langs,
    urls,
    sendMessage,
  });
  const accepted = results.filter((result) => result === 'ACCEPTED').length;

  langs.forEach((lang) => {
    lang.translation ??= {};
    lang.translation.sent = accepted;
    lang.translation.status = accepted === urls.length ? 'created' : 'error';
  });

  await saveState({ options });
}

const PROCESS_POLL_INTERVAL_MS = 2000;
const MAX_PROCESS_POLL_ATTEMPTS = 30; // ~60s before giving up on an async process

function wait(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * Polls a job async process until it reaches a terminal `processState`.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {string} params.env - The environment key (e.g. 'prod').
 * @param {string} params.endpoint - The Smartling API origin.
 * @param {string} params.projectId - The Smartling project id.
 * @param {string} params.jobUid - The job the process belongs to.
 * @param {string} params.processUid - The process to poll.
 * @returns {Promise<string>} 'COMPLETED', 'FAILED', 'ERROR' (poll failed), or 'TIMEOUT'.
 */
async function pollJobProcess({
  org, site, env, endpoint, projectId, jobUid, processUid,
}) {
  const url = `${endpoint}/jobs-api/v3/projects/${projectId}/jobs/${jobUid}/processes/${processUid}`;

  for (let attempt = 0; attempt < MAX_PROCESS_POLL_ATTEMPTS; attempt += 1) {
    const opts = { headers: { Authorization: `Bearer ${await getToken(org, site, env)}` } };
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetchWithRetry(url, opts, { onUnauthorized: onUnauthorized(opts) });
    if (!resp.ok) return 'ERROR';
    // eslint-disable-next-line no-await-in-loop
    const json = await resp.json();
    const { processState } = json?.response?.data || {};
    if (processState === 'COMPLETED' || processState === 'FAILED') return processState;
    // eslint-disable-next-line no-await-in-loop
    await wait(PROCESS_POLL_INTERVAL_MS);
  }

  return 'TIMEOUT';
}

/**
 * Cancels one language by removing its locale from the shared job (not
 * `cancelJob`, which would cancel every language). Polls async (202) removals.
 * @param {Object} params
 * @param {Object} params.service - The service configuration.
 * @param {Object} params.lang - Set to `cancelled` on success.
 * @param {Function} params.sendMessage - Surfaces status/error messages.
 * @returns {Promise<{ok: boolean, skipped?: boolean}>}
 */
export async function cancelTranslation({ service, lang, sendMessage }) {
  if (!lang.translation || !service.jobUid?.value) {
    sendMessage({ text: `Skipping ${lang.name}. No translation information.` });
    return { ok: true, skipped: true };
  }

  const {
    org, site, env, origin, projectId, jobUid,
  } = service;
  const endpoint = resolveOrigin(origin, org, site);
  const translationJobUid = jobUid.value;

  sendMessage({ text: `Canceling ${lang.name}.` });

  const url = `${endpoint}/jobs-api/v3/projects/${projectId}/jobs/${translationJobUid}/locales/${lang.code}`;
  const opts = { method: 'DELETE', headers: { Authorization: `Bearer ${await getToken(org, site, env)}` } };

  const resp = await fetchWithRetry(url, opts, { onUnauthorized: onUnauthorized(opts) });
  if (!resp.ok) {
    const json = await resp.json();
    sendMessage({ text: `Canceling ${lang.name} failed: ${extractErrorMessage(json)}`, type: 'error' });
    return { ok: false };
  }

  if (resp.status === 202) {
    const json = await resp.json();
    const { processUid } = json?.response?.data || {};

    if (!processUid) {
      lang.translation.cancelPending = true;
      sendMessage({ text: `Canceling ${lang.name}: Smartling accepted the request but returned no process id to track it. Status will update on the next check.`, type: 'warning' });
      return { ok: false };
    }

    const processState = await pollJobProcess({
      org, site, env, endpoint, projectId, jobUid: translationJobUid, processUid,
    });

    if (processState === 'FAILED') {
      sendMessage({ text: `Canceling ${lang.name} failed: Smartling reported the removal process failed.`, type: 'error' });
      return { ok: false };
    }

    if (processState !== 'COMPLETED') {
      lang.translation.cancelPending = true;
      const reason = processState === 'ERROR'
        ? 'could not check the cancellation progress'
        : 'did not finish in time';
      sendMessage({ text: `Canceling ${lang.name} ${reason}. Status will update on the next check.`, type: 'warning' });
      return { ok: false };
    }
  }

  delete lang.translation.cancelPending;
  lang.translation.status = 'cancelled';
  return { ok: true };
}

/**
 * Computes a locale's translation progress for one file per Smartling's
 * "Checking File Translation Status" formula. Unauthorized strings stay in
 * the denominator, so a file with any unauthorized string can never reach
 * 100% (otherwise source-language text bleeds through into the download).
 * The result is floored: 99.9999% reports as 99%.
 * @param {Object} params
 * @param {number} params.totalStringCount - Strings in the file.
 * @param {number} [params.completedStringCount] - Published strings.
 * @param {number} [params.excludedStringCount] - Strings excluded from
 *  translation.
 * @returns {number} Progress percentage, 0-100; 100 only when nothing is
 *  left to translate or every non-excluded string is complete.
 */
export function translationProgress({
  totalStringCount, completedStringCount = 0, excludedStringCount = 0,
}) {
  const translatable = totalStringCount - excludedStringCount;
  if (translatable === 0) return 100;
  return Math.floor((completedStringCount / translatable) * 100);
}

/**
 * Fetches per-locale string counts for one file. Unlike the job progress
 * endpoint this is not job-scoped and reports on unauthorized strings via
 * the file-level `totalStringCount`.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {string} params.env - The environment key (e.g. 'prod').
 * @param {string} params.endpoint - The Smartling API origin.
 * @param {string} params.projectId - The Smartling project id.
 * @param {string} params.fileUri - The file's DA base path.
 * @returns {Promise<{totalStringCount: number, items: Object[]}|{error: string, status: number}>}
 *  The file's total string count and per-locale `{ localeId,
 *  authorizedStringCount, completedStringCount, excludedStringCount }`
 *  items, or an error object on failure.
 */
async function fetchFileStatus({
  org, site, env, endpoint, projectId, fileUri,
}) {
  const url = new URL(`${endpoint}/files-api/v2/projects/${projectId}/file/status`);
  url.searchParams.set('fileUri', fileUri);
  const opts = { headers: { Authorization: `Bearer ${getToken(org, site, env)}` } };

  const resp = await fetchWithRetry(url, opts, { onUnauthorized: onUnauthorized(opts) });
  if (!resp.ok) return { error: `Could not get status for ${fileUri}`, status: resp.status };
  const { response } = await resp.json();
  const { totalStringCount = 0, items = [] } = response?.data || {};
  if (totalStringCount <= 0) return { error: `Smartling reported no strings for ${fileUri}`, status: resp.status };
  return { totalStringCount, items };
}

/**
 * Computes one language's progress (0-100) for every file.
 * @param {Object} params
 * @param {string} params.code - The language's locale code.
 * @param {Object[]} params.fileStatuses - Results of `fetchFileStatus`.
 * @returns {number[]} One progress value per file; a locale Smartling
 *  doesn't list for a file counts as 0, never as complete.
 */
function getLangProgress({ code, fileStatuses }) {
  return fileStatuses.map(({ totalStringCount, items }) => {
    const item = items.find((entry) => entry.localeId === code);
    return item ? translationProgress({ totalStringCount, ...item }) : 0;
  });
}

/**
 * Refreshes translation status for every target language of a job from
 * per-file, per-locale string counts (Smartling's
 * getFileTranslationStatusAllLocales), instead of the job-scoped
 * `percentComplete`, which ignores unauthorized strings and reports `null`
 * for locales it has no content for.
 * @param {Object} params
 * @param {string} params.org - The DA org.
 * @param {string} params.site - The DA site.
 * @param {Object} params.service - The service configuration; reads
 *  `jobUid.value` (set by `sendAllLanguages`) only to confirm something
 *  was sent.
 * @param {Object[]} params.langs - Target languages; mutated in place with
 *  `translation.status` ('translated' only once every file is at 100% for
 *  that locale, otherwise the lowest per-file progress, e.g. '62%
 *  translated') and `translation.translated` (number of files at 100%).
 *  A lang already at `'complete'` or `'cancelled'` is left untouched. If
 *  every lang is already terminal, skips the API calls entirely.
 * @param {Object[]} params.urls - The urls in the project.
 * @param {Object} params.actions - `{ saveState, sendMessage }` callbacks;
 *  `sendMessage` surfaces an error if no job has been created yet, or if
 *  any file status request fails.
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

  // 'complete'/'cancelled' are terminal - Smartling keeps reporting a file
  // as translated forever once done, so without this guard every
  // subsequent status check would revert 'complete' back to 'translated'
  // (triggering a re-save) or 'cancelled' back to 'translated'.
  const activeLangs = langs.filter((l) => !TERMINAL_STATUSES.includes(l.translation.status));
  if (!activeLangs.length) return;

  const fileStatuses = [];
  const queue = new Queue(async (url) => {
    fileStatuses.push(await fetchFileStatus({
      org, site, env, endpoint, projectId, fileUri: url.daBasePath,
    }));
  }, MAX_CONCURRENT_STATUS);
  await Promise.all(urls.map((url) => queue.push(url)));

  const failed = fileStatuses.find((fileStatus) => fileStatus.error);
  if (failed) {
    sendMessage({ text: `Checking status failed: ${failed.error}.`, type: 'error' });
    return;
  }

  // A save can finish while the requests are in flight; don't overwrite it.
  const stillActive = activeLangs.filter((l) => !TERMINAL_STATUSES.includes(l.translation.status));

  for (const lang of stillActive) {
    const progress = getLangProgress({ code: lang.code, fileStatuses });
    const translated = progress.filter((percent) => percent === 100).length;
    lang.translation.translated = translated;
    lang.translation.status = translated === progress.length
      ? 'translated'
      : `${Math.min(...progress)}% translated`;
  }

  await saveState();
}
