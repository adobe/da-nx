import { Queue } from '../../../../../nx2/public/utils/tree.js';
import { addDnt, removeDnt } from '../../dnt/dnt.js';
import { DA_TRANSLATE } from '../../../../../nx2/utils/utils.js';
import { zipSync, strToU8 } from '../../../../../nx2/deps/fflate/dist/index.js';
import authReady, { getAccessToken } from './auth.js';

export const dnt = { addDnt };

const DEFAULT_DUE_DATE_DAYS = 7;
const PROCESS_POLL_MS = 2000;
const PROCESS_POLL_MAX = 60;
const DOWNLOAD_POLL_MS = 5000;
const DOWNLOAD_POLL_MAX = 60;

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const ORIGIN_HEADER = 'x-globallink-origin';

/**
 * Builds the DA_TRANSLATE proxy origin GlobalLink requests are routed through, so the
 * browser never calls GlobalLink's API directly (avoids CORS and keeps a single,
 * DA-controlled network path for the connector).
 * @param {object} service - The flattened per-environment service config.
 * @param {string} service.org - The DA org.
 * @param {string} service.site - The DA site.
 * @returns {string|null} The proxy origin, or `null` if org/site are missing.
 */
function resolveOrigin(service) {
  const { org, site } = service;
  if (!org || !site) return null;
  return `${DA_TRANSLATE}/translate/globallink/${org}/${site}`;
}

/**
 * Builds the header that tells the DA_TRANSLATE proxy which real GlobalLink deployment
 * to forward the request to. The proxy validates this against its own allowlist before
 * forwarding, so the real endpoint stays driven by org/site config rather than hardcoded
 * in the proxy itself.
 * @param {object} service - The flattened per-environment service config.
 * @param {string} service.endpoint - The real GlobalLink API base endpoint, as configured
 * in the site's `.da/translate.json`.
 * @returns {{[ORIGIN_HEADER]: string}} The header to merge into every proxied request.
 */
function originHeader(service) {
  return { [ORIGIN_HEADER]: service.endpoint };
}

/**
 * Builds the bearer-auth + JSON + proxy-origin headers used for authenticated
 * GlobalLink API calls routed through the DA_TRANSLATE proxy. The access token is
 * obtained via {@link getAccessToken} (da-etc), never built from credentials here.
 * @param {object} service - The flattened per-environment service config.
 * @param {string} service.endpoint - The real GlobalLink API base endpoint.
 * @returns {Promise<object>} The request headers.
 */
async function authHeaders(service) {
  const token = await getAccessToken(service);
  return {
    Authorization: `Bearer ${token}`,
    ...originHeader(service),
    ...JSON_HEADERS,
  };
}

/**
 * Derives a GlobalLink-safe upload file name from a DA base path, flattening any nested
 * folders and ensuring an extension is present. Literal underscores are doubled before
 * folder separators are collapsed to a single underscore, so distinct paths can't collide
 * on the flattened name (e.g. "/blog/post-1" and "/blog_post-1" no longer both flatten to
 * the same file name) — a real collision would silently drop one file from the upload zip.
 * @param {string} daBasePath - The DA-formatted base path (e.g. "/blog/post-1").
 * @returns {string} The flattened file name (e.g. "blog_post-1.html").
 */
function toFileName(daBasePath) {
  const trimmed = (daBasePath || '/document').replace(/^\//, '');
  const escaped = trimmed.split(/[\\/]/).map((segment) => segment.replace(/_/g, '__')).join('_');
  const safe = escaped || 'document';
  return /\.[a-z0-9]+$/i.test(safe) ? safe : `${safe}.html`;
}

/**
 * Computes a submission due date, N days from now, in epoch milliseconds.
 * @param {number} days - The number of days until the submission is due.
 * @returns {number} The due date as epoch milliseconds.
 */
function dueDateMs(days) {
  return Date.now() + (days * 24 * 60 * 60 * 1000);
}

/**
 * Finds the DA url entry that corresponds to a GlobalLink target, matching
 * first by the uploaded `clientIdentifier`, then falling back to file name matching.
 * @param {object[]} urls - The DA url entries to search.
 * @param {object} target - A GlobalLink target/document record.
 * @returns {object|undefined} The matching url entry, if any.
 */
function matchUrl(urls, target) {
  const clientId = target.clientIdentifier || target.client_identifier;
  if (clientId) {
    const byClient = urls.find((url) => url.daBasePath === clientId);
    if (byClient) return byClient;
  }

  const docName = target.documentName || target.name || target.documentNameWithPath || '';
  return urls.find((url) => {
    const fileName = toFileName(url.daBasePath);
    return docName === fileName
      || docName.endsWith(`/${fileName}`)
      || docName.endsWith(`\\${fileName}`)
      || docName.includes(fileName);
  });
}

/**
 * Polls a submission's status until GlobalLink finishes processing the uploaded
 * source files (or a maximum number of attempts is reached).
 * @param {object} service - The flattened per-environment service config.
 * @param {string|number} submissionId - The submission to poll.
 * @returns {Promise<boolean>} `false` if the submission reported an error/failure status;
 * `true` otherwise (including the ambiguous/timeout case, since GlobalLink often finishes
 * processing during save).
 */
async function waitForSubmissionReady(service, submissionId) {
  for (let i = 0; i < PROCESS_POLL_MAX; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetch(`${resolveOrigin(service)}/rest/v0/submissions/${submissionId}/status`, {
      headers: await authHeaders(service),
    });
    if (resp.ok) {
      // eslint-disable-next-line no-await-in-loop
      const json = await resp.json();
      const status = (json.status || json.submissionStatus || json.processStatus || '').toString().toUpperCase();
      if (status.includes('ERROR') || status.includes('FAIL')) return false;
      if (status.includes('READY')
        || status.includes('CREATED')
        || status.includes('IDLE')
        || status.includes('COMPLETE')
        || status.includes('PROCESSED')
        || status === 'OK') {
        return true;
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, PROCESS_POLL_MS); });
  }
  // Proceed to save even if status stays ambiguous — PD often finishes during save.
  return true;
}

/**
 * Extracts custom attribute values from the project options, mirroring the
 * `translation.service.custom.<type>.<name>` fields Trados/Lionbridge use for their
 * own custom fields. GlobalLink projects can require mandatory custom attributes
 * (e.g. `Custom_Mandatory`) that must be present at submission-create time, or
 * `/save`/`/start` will fail even though the create call itself succeeds.
 * @param {object} options - The full localization project options.
 * @returns {{name: string, value: string}[]} The custom attributes to send with the submission.
 */
function extractCustomAttributes(options) {
  const prefix = 'translation.service.custom.';
  return Object.entries(options || {}).reduce((acc, [key, value]) => {
    if (!key.startsWith(prefix) || value === undefined || value === null || value === '') return acc;
    // e.g. 'translation.service.custom.textarea.Custom_Mandatory' -> 'Custom_Mandatory'
    const name = key.split('.').slice(4).join('.');
    if (name) acc.push({ name, value });
    return acc;
  }, []);
}

/**
 * Generates a name for a submission's batch, derived from the title and a timestamp.
 * GlobalLink batch names must be unique within the submission and no more than 64
 * UTF-8 characters.
 * @param {string} title - The localization project title.
 * @returns {string} A batch name, truncated to 64 characters.
 */
function generateBatchName(title) {
  return `${title}-batch-${Date.now()}`.slice(0, 64);
}

/**
 * Creates a new GlobalLink submission (with one batch targeting all requested languages).
 * @param {object} service - The flattened per-environment service config.
 * @param {string|number} service.projectId - The GlobalLink project id.
 * @param {string} title - The localization project title, used to build the submission name.
 * @param {object[]} langs - The target languages, each with a `code` (BCP-47 locale).
 * @param {string} sourceLanguage - The source language code.
 * @param {number} dueDateDays - The number of days until the submission is due.
 * @param {{name: string, value: string}[]} customAttributes - Any project-required custom
 * attributes (e.g. a mandatory field), from {@link extractCustomAttributes}.
 * @param {string} batchName - The name of the batch to create within the submission. Must
 * be unique within the submission and no more than 64 UTF-8 characters.
 * @returns {Promise<string|number|null>} The created submission id, or `null` on failure.
 */
async function createSubmission(
  service,
  title,
  langs,
  sourceLanguage,
  dueDateDays,
  customAttributes,
  batchName,
) {
  const body = JSON.stringify({
    name: `${title}-${Date.now()}`,
    dueDate: dueDateMs(dueDateDays),
    projectId: Number(service.projectId) || service.projectId,
    sourceLanguage,
    instructions: `DA localization project: ${title}`,
    ...(customAttributes.length ? { customAttributes } : {}),
    batchInfos: [{
      targetLanguageInfos: langs.map((lang) => ({ targetLanguage: lang.code })),
      targetFormat: 'TXLF',
      name: batchName,
    }],
    claimScope: 'LANGUAGE',
  });

  const resp = await fetch(`${resolveOrigin(service)}/rest/v0/submissions/create`, {
    method: 'POST',
    headers: await authHeaders(service),
    body,
  });
  if (!resp.ok) return null;
  const json = await resp.json();
  return json.submissionId ?? json.id ?? null;
}

/**
 * Uploads every source document for a submission's batch as a single zip archive, with
 * `extractArchive=true` so GlobalLink unpacks it into individual documents — per GlobalLink's
 * "upload files zipped in a single call" guidance, instead of one call per file. If the
 * submission has hit GlobalLink's per-submission file limit, GlobalLink silently places
 * overflow documents in a new, separate submission instead — the response's
 * `documentIds[].submissionId` reveals this when it doesn't match `submissionId`.
 * @param {object} service - The flattened per-environment service config.
 * @param {string} service.fileFormatName - The GlobalLink file format to upload as.
 * @param {string|number} submissionId - The target submission id.
 * @param {object[]} urls - The DA url entries to upload.
 * @param {string} batchName - The name of the batch these documents belong to, matching the
 * one passed to {@link createSubmission}.
 * @returns {Promise<{uploadedFileNames: Set<string>, overflowSubmissionIds: string[]}>} The
 * file names GlobalLink confirmed receiving, plus any other submission id(s) it placed some
 * of them under.
 */
async function uploadSourceFiles(service, submissionId, urls, batchName) {
  const files = {};
  urls.forEach((url) => {
    files[toFileName(url.daBasePath)] = strToU8(url.content);
  });
  const zipped = zipSync(files);

  const body = new FormData();
  body.append('file', new Blob([zipped], { type: 'application/zip' }), `${batchName}.zip`);
  body.append('batchName', batchName);
  body.append('fileFormatName', service.fileFormatName);
  body.append('extractArchive', 'true');

  const token = await getAccessToken(service);
  const resp = await fetch(`${resolveOrigin(service)}/rest/v0/submissions/${submissionId}/upload/source`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, ...originHeader(service) },
    body,
  });
  if (!resp.ok) return { uploadedFileNames: new Set(), overflowSubmissionIds: [] };

  // processId is returned asynchronously; submission-level status is polled after all uploads.
  const json = await resp.json().catch(() => null);
  const documentIds = json?.documentIds || [];
  const uploadedFileNames = new Set(documentIds.map((doc) => doc.name));
  const overflowSubmissionIds = [...new Set(
    documentIds
      .map((doc) => String(doc.submissionId))
      .filter((id) => id && id !== String(submissionId)),
  )];

  return { uploadedFileNames, overflowSubmissionIds };
}

/**
 * Saves a submission and requests that GlobalLink auto-start processing it. GlobalLink
 * responds 200 even when the submission didn't actually start (e.g. a missing mandatory
 * custom attribute), so success is read from `startedSubmissionIds` in the body, not
 * just the HTTP status.
 * @param {object} service - The flattened per-environment service config.
 * @param {string|number} submissionId - The submission to save/start.
 * @returns {Promise<{started: boolean, messages: string[]|null}>} Whether the submission
 * actually started, plus any messages GlobalLink returned (e.g. explaining why it didn't).
 */
async function saveAndAutostart(service, submissionId) {
  const resp = await fetch(`${resolveOrigin(service)}/rest/v0/submissions/${submissionId}/save`, {
    method: 'POST',
    headers: await authHeaders(service),
    body: JSON.stringify({ autoStart: true }),
  });
  if (!resp.ok) return { started: false, messages: null };

  const json = await resp.json().catch(() => null);
  const started = Array.isArray(json?.startedSubmissionIds)
    && json.startedSubmissionIds.some((id) => String(id) === String(submissionId));
  return { started, messages: json?.messages ?? null };
}

const TARGETS_PAGE_SIZE = 200;
const TARGETS_PAGE_MAX = 50;

/**
 * Fetches a single page of a submission's targets.
 * @param {object} service - The flattened per-environment service config.
 * @param {string|number} submissionId - The submission whose targets to list.
 * @param {object} filters - Query filters.
 * @param {string} [filters.targetStatus] - Only return targets with this status.
 * @param {string} [filters.targetLanguage] - Only return targets for this language.
 * @param {number} pageNumber - The 1-based page number to fetch.
 * @returns {Promise<object[]|null>} The page's targets, or `null` on failure.
 */
async function listTargetsPage(service, submissionId, filters, pageNumber) {
  const { targetStatus, targetLanguage } = filters;
  const reqUrl = new URL(`${resolveOrigin(service)}/rest/v0/targets`);
  reqUrl.searchParams.set('submissionIds', submissionId);
  // 200 is the API's maximum page size — a larger value is rejected outright.
  reqUrl.searchParams.set('pageSize', String(TARGETS_PAGE_SIZE));
  reqUrl.searchParams.set('pageNumber', String(pageNumber));
  if (targetStatus) reqUrl.searchParams.set('targetStatus', targetStatus);
  if (targetLanguage) reqUrl.searchParams.set('targetLanguage', targetLanguage);

  const resp = await fetch(reqUrl, { headers: await authHeaders(service) });
  if (!resp.ok) return null;
  const json = await resp.json();
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.targets)) return json.targets;
  if (Array.isArray(json?.items)) return json.items;
  return [];
}

/**
 * Lists a submission's targets (per-document, per-language translation records),
 * optionally filtered by status and/or target language. Pages through the full
 * result set, stopping once a page comes back short of `TARGETS_PAGE_SIZE` (or after
 * `TARGETS_PAGE_MAX` pages, as a safety net against an unexpected always-full-page response).
 * @param {object} service - The flattened per-environment service config.
 * @param {string|number} submissionId - The submission whose targets to list.
 * @param {object} [filters] - Optional query filters.
 * @param {string} [filters.targetStatus] - Only return targets with this status.
 * @param {string} [filters.targetLanguage] - Only return targets for this language.
 * @returns {Promise<object[]>} All matching targets, or an empty array on failure.
 */
async function listTargets(service, submissionId, filters = {}) {
  const targets = [];
  for (let pageNumber = 1; pageNumber <= TARGETS_PAGE_MAX; pageNumber += 1) {
    // eslint-disable-next-line no-await-in-loop
    const page = await listTargetsPage(service, submissionId, filters, pageNumber);
    if (!page) return pageNumber === 1 ? [] : targets;
    targets.push(...page);
    if (page.length < TARGETS_PAGE_SIZE) break;
  }
  return targets;
}

/**
 * Marks targets as delivered once their deliverables have been downloaded and successfully
 * saved back to DA, so GlobalLink stops re-surfacing them as pending on later status checks.
 * @param {object} service - The flattened per-environment service config.
 * @param {string|number} submissionId - The submission whose targets to mark delivered.
 * @param {(string|number)[]} targetIds - The target ids to mark delivered.
 * @returns {Promise<boolean>} Whether the request succeeded.
 */
async function markTargetsDelivered(service, submissionId, targetIds) {
  if (!targetIds.length) return true;
  const resp = await fetch(`${resolveOrigin(service)}/rest/v0/submissions/${submissionId}/targets/delivered`, {
    method: 'POST',
    headers: await authHeaders(service),
    body: JSON.stringify({ targetIds }),
  });
  return resp.ok;
}

/**
 * Requests that GlobalLink prepare a downloadable package of a submission's completed
 * deliverables for a language. This is only used as a readiness signal — the actual files
 * are still fetched individually via the per-target deliverable endpoint.
 * @param {object} service - The flattened per-environment service config.
 * @param {string|number} submissionId - The submission to request a download for.
 * @param {string} langCode - The target language code to scope the request to.
 * @returns {Promise<{downloadId: string|null, processingFinished: boolean}>} The download
 * job id (`null` on failure), and whether it's already finished.
 */
async function requestDownload(service, submissionId, langCode) {
  const reqUrl = new URL(`${resolveOrigin(service)}/rest/v0/submissions/${submissionId}/download`);
  reqUrl.searchParams.set('deliverableLanguages', langCode);
  reqUrl.searchParams.set('includeManifest', 'true');

  const resp = await fetch(reqUrl, { headers: await authHeaders(service) });
  if (!resp.ok) return { downloadId: null, processingFinished: false };
  const json = await resp.json().catch(() => null);
  return { downloadId: json?.downloadId ?? null, processingFinished: !!json?.processingFinished };
}

/**
 * Checks whether a previously requested download package has finished processing.
 * @param {object} service - The flattened per-environment service config.
 * @param {string|number} submissionId - The submission the download belongs to.
 * @param {string} downloadId - The download job id from {@link requestDownload}.
 * @returns {Promise<boolean>} Whether the package is ready.
 */
async function isDownloadReady(service, submissionId, downloadId) {
  const reqUrl = new URL(`${resolveOrigin(service)}/rest/v0/submissions/${submissionId}/download`);
  reqUrl.searchParams.set('downloadId', downloadId);

  const resp = await fetch(reqUrl, { headers: await authHeaders(service) });
  if (!resp.ok) return false;
  const json = await resp.json().catch(() => null);
  return !!json?.processingFinished;
}

/**
 * Waits for GlobalLink to finish preparing a language's completed deliverables, polling
 * every 5 seconds per GlobalLink's guidance (up to `DOWNLOAD_POLL_MAX` attempts) before any
 * individual targets are downloaded.
 * @param {object} service - The flattened per-environment service config.
 * @param {string|number} submissionId - The submission to wait on.
 * @param {string} langCode - The target language code to scope the wait to.
 * @returns {Promise<boolean>} Whether the deliverables are ready.
 */
async function waitForDeliverablesReady(service, submissionId, langCode) {
  const { downloadId, processingFinished } = await requestDownload(service, submissionId, langCode);
  if (!downloadId || processingFinished) return processingFinished;

  for (let i = 0; i < DOWNLOAD_POLL_MAX; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, DOWNLOAD_POLL_MS); });
    // eslint-disable-next-line no-await-in-loop
    if (await isDownloadReady(service, submissionId, downloadId)) return true;
  }
  return false;
}

/**
 * Extracts the target language code from a GlobalLink target record, tolerating
 * the different field names seen across GlobalLink API versions.
 * @param {object} target - A GlobalLink target/document record.
 * @returns {string|undefined} The target language code, if present.
 */
function targetLanguageOf(target) {
  return target.targetLanguage || target.language || target.locale || target.targetLocale;
}

/**
 * Determines whether a GlobalLink target has finished translation and is ready to download.
 * @param {object} target - A GlobalLink target/document record.
 * @returns {boolean} Whether the target's status indicates it is processed/complete.
 */
function isProcessed(target) {
  const status = (target.targetStatus || target.status || '').toString().toUpperCase();
  return status === 'PROCESSED' || status === 'COMPLETED' || status === 'DELIVERED';
}

/**
 * Determines whether a GlobalLink target was cancelled.
 * @param {object} target - A GlobalLink target/document record.
 * @returns {boolean} Whether the target's status indicates it was cancelled.
 */
function isCancelled(target) {
  const status = (target.targetStatus || target.status || '').toString().toUpperCase();
  return status.includes('CANCEL');
}

/**
 * Checks whether there is a currently valid GlobalLink session, fetching an access
 * token via da-etc if needed. The client secret and GlobalLink password never reach
 * the browser — see `auth.js`.
 * @param {object} service - The flattened per-environment service config.
 * @returns {Promise<boolean>} Whether the connector is authenticated and ready to use.
 */
export function isConnected(service) {
  return authReady(service);
}

/**
 * Authenticates with GlobalLink. Identical to {@link isConnected} — both simply ensure
 * a usable access token is available, obtained server-side by da-etc.
 * @param {object} service - The flattened per-environment service config.
 * @returns {Promise<boolean>} Whether authentication succeeded.
 */
export function connect(service) {
  return authReady(service);
}

/**
 * Creates a GlobalLink submission for a set of languages, uploads the source
 * documents, and starts the submission for translation.
 * @param {object} conf - The translation-send configuration.
 * @param {string} conf.title - The localization project title.
 * @param {object} conf.service - The flattened per-environment service config (mutated
 * in place with the created `submissionId`).
 * @param {object} conf.options - The full localization project options, including any
 * `translation.service.custom.*` fields required as GlobalLink submission custom attributes.
 * @param {object[]} conf.langs - The target languages to send (mutated in place with
 * `translation.sent`/`translation.status`).
 * @param {object[]} conf.urls - The DA url entries (with content) to upload.
 * @param {object} conf.actions - UI callback actions.
 * @param {Function} conf.actions.sendMessage - Reports progress/status text to the UI.
 * @param {Function} conf.actions.saveState - Persists the project state.
 * @returns {Promise<void>}
 */
export async function sendAllLanguages({
  title, service, options, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;

  const connected = await isConnected(service);
  if (!connected) {
    sendMessage({ text: 'Not connected to GlobalLink.', type: 'error' });
    langs.forEach((lang) => {
      lang.translation ??= {};
      lang.translation.status = 'error';
    });
    return;
  }

  if (!service.projectId || !service.fileFormatName) {
    sendMessage({ text: 'GlobalLink projectId and fileFormatName are required.', type: 'error' });
    langs.forEach((lang) => {
      lang.translation ??= {};
      lang.translation.status = 'error';
    });
    return;
  }

  const sourceLanguage = options?.['source.language']?.code || service.sourceLanguage || 'en-US';
  const dueDateDays = Number(service.dueDateDays) || DEFAULT_DUE_DATE_DAYS;
  const customAttributes = extractCustomAttributes(options);
  const batchName = generateBatchName(title);

  sendMessage({ text: `Creating GlobalLink submission for: ${title}.` });
  const submissionId = await createSubmission(
    service,
    title,
    langs,
    sourceLanguage,
    dueDateDays,
    customAttributes,
    batchName,
  );
  if (!submissionId) {
    sendMessage({ text: 'Failed to create GlobalLink submission.', type: 'error' });
    langs.forEach((lang) => {
      lang.translation ??= {};
      lang.translation.status = 'error';
    });
    return;
  }

  // Persist for status / download
  options.service.submissionId = { value: String(submissionId) };

  sendMessage({ text: `Uploading ${urls.length} items to GlobalLink.` });
  const { uploadedFileNames, overflowSubmissionIds } = await uploadSourceFiles(
    service,
    submissionId,
    urls,
    batchName,
  );
  const accepted = urls.filter((url) => uploadedFileNames.has(toFileName(url.daBasePath))).length;

  if (overflowSubmissionIds.length) {
    sendMessage({
      text: `GlobalLink split this submission across additional submission(s) (${overflowSubmissionIds.join(', ')}) because it exceeded the per-submission file limit — only ${submissionId} is tracked, so status/downloads for files in the others will be incomplete.`,
      type: 'error',
    });
  }

  if (accepted !== urls.length) {
    sendMessage({ text: `Uploaded ${accepted}/${urls.length} items — aborting save.`, type: 'error' });
    langs.forEach((lang) => {
      lang.translation ??= {};
      lang.translation.sent = accepted;
      lang.translation.status = 'error';
    });
    await saveState({ options });
    return;
  }

  sendMessage({ text: 'Waiting for GlobalLink to finish processing uploads.' });
  await waitForSubmissionReady(service, submissionId);

  sendMessage({ text: 'Starting GlobalLink submission.' });
  const { started, messages } = await saveAndAutostart(service, submissionId);
  if (!started) {
    const detail = messages?.length ? ` ${messages.join(' ')}` : '';
    sendMessage({ text: `Failed to save/start GlobalLink submission.${detail}`, type: 'error' });
    langs.forEach((lang) => {
      lang.translation ??= {};
      lang.translation.sent = accepted;
      lang.translation.status = 'error';
    });
    await saveState({ options });
    return;
  }

  langs.forEach((lang) => {
    lang.translation ??= {};
    lang.translation.sent = accepted;
    lang.translation.status = 'created';
  });

  sendMessage();
  await saveState({ options });
}

/**
 * Refreshes translation progress for a submission, marking languages as
 * `translated` once every document has a processed target.
 * @param {object} conf - The status-check configuration.
 * @param {object} conf.service - The flattened per-environment service config, including
 * the previously persisted `submissionId`.
 * @param {object[]} conf.langs - The target languages to check (mutated in place with
 * `translation.translated`/`translation.status`).
 * @param {object[]} conf.urls - The DA url entries being translated, used to match targets.
 * @param {object} conf.actions - UI callback actions.
 * @param {Function} conf.actions.sendMessage - Reports progress/status text to the UI.
 * @param {Function} conf.actions.saveState - Persists the project state.
 * @returns {Promise<void>}
 */
export async function getStatusAll({ service, langs, urls, actions }) {
  const { sendMessage, saveState } = actions;
  const submissionId = service.submissionId?.value;

  if (!submissionId) {
    sendMessage({ text: 'No GlobalLink submissionId found for this project.', type: 'error' });
    return;
  }

  const connected = await isConnected(service);
  if (!connected) {
    sendMessage({ text: 'Not connected to GlobalLink.', type: 'error' });
    return;
  }

  sendMessage({ text: `Checking GlobalLink status for submission ${submissionId}.` });

  const targets = await listTargets(service, submissionId);
  langs.forEach((lang) => {
    lang.translation ??= {};
    lang.translation.translated = 0;
  });

  const targetCountByLang = {};
  const cancelledCountByLang = {};
  const processedByLang = {};
  targets.forEach((target) => {
    const matched = matchUrl(urls, target);
    if (!matched) return;
    const langCode = targetLanguageOf(target);
    if (!langCode) return;

    targetCountByLang[langCode] = (targetCountByLang[langCode] || 0) + 1;
    if (isCancelled(target)) {
      cancelledCountByLang[langCode] = (cancelledCountByLang[langCode] || 0) + 1;
    } else if (isProcessed(target)) {
      processedByLang[langCode] = (processedByLang[langCode] || 0) + 1;
    }
  });

  langs.forEach((lang) => {
    const targetCount = targetCountByLang[lang.code] || 0;
    const cancelledCount = cancelledCountByLang[lang.code] || 0;
    if (targetCount > 0 && cancelledCount === targetCount) {
      lang.translation.status = 'cancelled';
      return;
    }

    lang.translation.translated = processedByLang[lang.code] || 0;
    if (lang.translation.translated === urls.length) {
      lang.translation.status = 'translated';
    }
  });

  sendMessage();
  await saveState();
}

/**
 * Downloads the processed translation deliverables for a language and hands each
 * one to `saveFn` for writing back to DA, removing DNT markers first. Targets that save
 * successfully are marked delivered on GlobalLink so they aren't re-surfaced later.
 * Waits for GlobalLink to report the language's deliverables as fully prepared before
 * downloading any individual target (see {@link waitForDeliverablesReady}).
 * @param {object} conf - The save configuration.
 * @param {string} conf.org - The DA org.
 * @param {string} conf.site - The DA site.
 * @param {object} conf.service - The flattened per-environment service config, including
 * the previously persisted `submissionId`.
 * @param {object} conf.lang - The language being saved, with a `code` (BCP-47 locale).
 * @param {object[]} conf.urls - The DA url entries to download and save.
 * @param {Function} conf.saveFn - Callback invoked with each downloaded url entry
 * (with `sourceContent` populated) to persist it to DA.
 * @param {Function} conf.sendMessage - Reports progress/status text to the UI.
 * @returns {Promise<object[]>} The url entries, each annotated with a `status` (e.g.
 * `'success'`/`'error'`) once processing completes.
 */
export async function saveItems({
  org, site, service, lang, urls, saveFn, sendMessage,
}) {
  const submissionId = service.submissionId?.value;
  if (!submissionId) return urls;

  const connected = await isConnected(service);
  if (!connected) return urls;

  sendMessage({ text: `Waiting for GlobalLink to finish preparing ${lang.name} deliverables.` });
  const ready = await waitForDeliverablesReady(service, submissionId, lang.code);
  if (!ready) {
    sendMessage({ text: `GlobalLink deliverables for ${lang.name} are not ready yet.`, type: 'error' });
    return urls;
  }

  const targets = await listTargets(service, submissionId, {
    targetStatus: 'PROCESSED',
    targetLanguage: lang.code,
  });

  const token = await getAccessToken(service);
  const deliveredTargetIds = [];

  const downloadCallback = async (url) => {
    const target = targets.find((entry) => {
      if (!isProcessed(entry)) return false;
      const langCode = targetLanguageOf(entry);
      if (langCode && langCode !== lang.code) return false;
      return matchUrl([url], entry);
    });

    const targetId = target?.targetId || target?.id;
    if (!targetId) {
      url.status = 'error';
      return;
    }

    try {
      const resp = await fetch(
        `${resolveOrigin(service)}/rest/v0/submissions/${submissionId}/targets/${targetId}/download/deliverable`,
        { headers: { Authorization: `Bearer ${token}`, ...originHeader(service) } },
      );
      if (!resp.ok) throw new Error(resp.status);

      const text = await resp.text();
      url.sourceContent = await removeDnt({ org, site, html: text, ext: url.ext });

      await saveFn(url);
      if (url.status === 'success') deliveredTargetIds.push(targetId);
    } catch {
      url.status = 'error';
    }
  };

  const queue = new Queue(downloadCallback, 5);

  return new Promise((resolve) => {
    const throttle = setInterval(async () => {
      const nextUrl = urls.find((url) => !url.inProgress);
      if (nextUrl) {
        nextUrl.inProgress = true;
        queue.push(nextUrl);
      } else if (urls.every((url) => url.status)) {
        clearInterval(throttle);
        await markTargetsDelivered(service, submissionId, deliveredTargetIds);
        resolve(urls);
      }
    }, 250);
  });
}

/**
 * Cancels GlobalLink translation for a single language, scoped to just that language's
 * targets via `targetIds` (the submission itself, and every other language in it, is left
 * untouched). Only works while those targets haven't started processing yet.
 * @param {object} conf - The cancel configuration.
 * @param {object} conf.service - The flattened per-environment service config, including
 * the previously persisted `submissionId`.
 * @param {object} conf.lang - The language to cancel, with a `code` (BCP-47 locale).
 * @param {Function} conf.sendMessage - Reports progress/status text to the UI.
 * @returns {Promise<{ok: boolean, skipped?: boolean}>} Whether the cancel succeeded.
 */
export async function cancelTranslation({ service, lang, sendMessage }) {
  const submissionId = service.submissionId?.value;
  if (!submissionId) {
    sendMessage({ text: `Skipping ${lang.name}. No GlobalLink submission to cancel.` });
    return { ok: true, skipped: true };
  }

  const connected = await isConnected(service);
  if (!connected) {
    sendMessage({ text: 'Not connected to GlobalLink.', type: 'error' });
    return { ok: false };
  }

  const targets = await listTargets(service, submissionId, { targetLanguage: lang.code });
  const targetIds = targets
    .map((target) => target.targetId ?? target.id)
    .filter((id) => id != null);

  if (!targetIds.length) {
    sendMessage({ text: `Skipping ${lang.name}. No GlobalLink targets found to cancel.` });
    return { ok: true, skipped: true };
  }

  sendMessage({ text: `Cancelling GlobalLink translation for ${lang.name}.` });

  const resp = await fetch(`${resolveOrigin(service)}/rest/v0/submissions/cancel/${submissionId}`, {
    method: 'POST',
    headers: await authHeaders(service),
    body: JSON.stringify({ targetIds }),
  });

  if (!resp.ok) {
    const json = await resp.json().catch(() => null);
    const detail = json?.messages?.length ? ` ${json.messages.join(' ')}` : '';
    sendMessage({ text: `Failed to cancel GlobalLink translation for ${lang.name}.${detail}`, type: 'error' });
    return { ok: false };
  }

  return { ok: true };
}
