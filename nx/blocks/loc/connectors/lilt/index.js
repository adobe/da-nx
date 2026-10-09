import { addDnt, removeDnt } from '../../dnt/dnt.js';
import { unzipSync, strFromU8 } from '../../../../../nx2/deps/fflate/dist/index.js';
import fetchWithRetry from '../../utils/fetchWithRetry.js';
import downloadQueue from '../../utils/downloadQueue.js';
import {
  resolveOrigin, authHeaders, retryConfig, isConnected, connect as establishConnection,
} from './auth.js';

export const dnt = { addDnt };

export { isConnected };

const OCTET_HEADERS = { 'Content-Type': 'application/octet-stream' };

const AI_MODE = 'ai';
const VERIFIED_MODE = 'verified';
const DEFAULT_DUE_DATE_DAYS = 7;
const EXPORT_POLL_MS = 2000;
const EXPORT_POLL_MAX = 60;
const TERMINAL_LANG_STATUSES = ['complete', 'cancelled'];
const AI_DONE_STATUSES = ['Completed', 'ReadyForDownload'];

/**
 * Flattens a nested DA path into a safe upload filename, escaping literal underscores
 * before collapsing path separators (so `/a/b_c` and `/a_b/c` can't collide), defaulting to
 * `.html` when the path has no extension.
 * @param {string} daBasePath - The DA path to flatten.
 * @returns {string} The safe filename.
 */
function toFileName(daBasePath) {
  const trimmed = (daBasePath || '/document').replace(/^\//, '');
  const escaped = trimmed
    .split(/[/\\]/)
    .map((segment) => segment.replace(/_/g, '__'))
    .join('_') || 'document';
  return /\.[a-z0-9]+$/i.test(escaped) ? escaped : `${escaped}.html`;
}

/**
 * Builds an ISO date `days` from now, for a Lilt job's optional `due` field.
 * @param {number} days - Days from now.
 * @returns {string} The ISO date string.
 */
function dueDateIso(days) {
  return new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
}

/**
 * Splits a BCP-47 locale code (e.g. `en-US`) into Lilt's separate lowercase language and
 * uppercase locale fields.
 * @param {string} code - The BCP-47 locale code.
 * @returns {{lang: string, locale: string|undefined}} The split language/locale.
 */
function splitLocale(code) {
  const [lang, locale] = (code || '').split('-');
  return { lang: (lang || '').toLowerCase(), locale: locale ? locale.toUpperCase() : undefined };
}

/**
 * Connects to Lilt, surfacing an error message if it fails.
 * @param {Object} service - The service configuration.
 * @param {Function} [sendMessage] - Callback to surface an error message
 *  to the user if authentication fails.
 * @returns {Promise<boolean>} Whether authentication succeeded.
 */
export async function connect(service, sendMessage) {
  const connected = await establishConnection(service);
  if (!connected) sendMessage?.({ text: 'Connection to Lilt failed.', type: 'error' });
  return connected;
}

export const serviceOptions = [
  {
    key: 'translationMode',
    label: 'Translation Mode',
    fetch: async () => ([
      { value: AI_MODE, label: 'AI Translation' },
      { value: VERIFIED_MODE, label: 'Verified Translation' },
    ]),
  },
];

/**
 * Extracts a human-readable message from Lilt's error envelope (`{ message }`, per their
 * OpenAPI spec), falling back to a generic message if absent.
 * @param {Object} json - The parsed error response body.
 * @returns {string} The error message, or a fallback if none was present.
 */
function extractErrorMessage(json) {
  return json?.message || 'Unknown error';
}

/**
 * Uploads a single url's source content as a Lilt `SourceFile`.
 * @param {Object} service - The flattened per-environment service config.
 * @param {Object} url - The url to upload; reads `daBasePath` and `content`.
 * @param {Function} sendMessage - Reports an error message to the UI on failure.
 * @returns {Promise<number|null>} The uploaded file's Lilt id, or null on failure.
 */
async function uploadFile(service, url, sendMessage) {
  const fileName = toFileName(url.daBasePath);
  const reqUrl = `${resolveOrigin(service)}/v2/files?name=${encodeURIComponent(fileName)}`;
  const opts = {
    method: 'POST',
    headers: await authHeaders(service, OCTET_HEADERS),
    body: url.content,
  };
  const resp = await fetchWithRetry(reqUrl, opts, retryConfig(service, opts));
  const json = await resp.json().catch(() => null);
  if (!resp.ok) {
    sendMessage({ text: `Upload to Lilt failed for ${url.daBasePath}: ${extractErrorMessage(json)}`, type: 'error' });
    return null;
  }
  return json?.id ?? null;
}

/**
 * Uploads every url's source content to Lilt in parallel.
 * @param {Object} service - The flattened per-environment service config.
 * @param {Object[]} urls - The urls to upload.
 * @param {Function} sendMessage - Reports an error message per failed upload.
 * @returns {Promise<Object>} A `daBasePath` -> Lilt file id map, omitting any upload
 *  that failed.
 */
async function uploadAllFiles(service, urls, sendMessage) {
  const fileIdsByPath = {};
  await Promise.all(urls.map(async (url) => {
    const fileId = await uploadFile(service, url, sendMessage);
    if (fileId != null) fileIdsByPath[url.daBasePath] = fileId;
  }));
  return fileIdsByPath;
}

/**
 * Fetches every Lilt translation memory available to this account. Defensively handles
 * both a bare array response and one wrapped under a `memories` key, since `GET /v2/memories`
 * called with no `id` isn't fully documented either way.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Promise<Object[]>} The memories, or `[]` on failure.
 */
async function fetchMemories(service) {
  const reqUrl = `${resolveOrigin(service)}/v2/memories`;
  const opts = { headers: await authHeaders(service) };
  const resp = await fetchWithRetry(reqUrl, opts, retryConfig(service, opts));
  if (!resp.ok) return [];
  const json = await resp.json().catch(() => null);
  return Array.isArray(json) ? json : (json?.memories || []);
}

/**
 * Finds the memory bound to a specific source/target language pair. Each Lilt `Memory` is
 * scoped to exactly one pair, so unlike a project id, there's no single memory that covers
 * every target language - one has to be resolved per language.
 * @param {Object[]} memories - The account's memories (see {@link fetchMemories}).
 * @param {string} srcLang - The lowercase 2-letter source language.
 * @param {string} trgLang - The lowercase 2-letter target language.
 * @returns {number|null} The matching memory's id, or null if none matched.
 */
function findMemoryId(memories, srcLang, trgLang) {
  const match = memories.find((memory) => memory.srclang?.toLowerCase() === srcLang
    && memory.trglang?.toLowerCase() === trgLang);
  return match?.id ?? null;
}

/**
 * Reads back the `translationIdsByLang` map persisted by {@link sendAiTranslation}, a
 * `lang.code` -> (`daBasePath` -> Lilt translation id) map.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Object} The parsed map, or `{}` if missing/invalid.
 */
function getTranslationIdsByLang(service) {
  try {
    return JSON.parse(service?.translationIds?.value || '{}');
  } catch {
    return {};
  }
}

/**
 * Starts AI Translation for every requested language: resolves each language's memory,
 * then kicks off one `/v2/translate/file` call per language covering every uploaded file.
 * Persists the resulting per-language, per-url translation ids so {@link getStatusAll} and
 * {@link saveItems} can poll/download them later.
 * @param {Object} conf
 * @param {Object} conf.service - The flattened per-environment service config.
 * @param {Object} conf.options - The full options sheet; `options.service` is mutated so
 *  the caller's `saveState({options})` persists it.
 * @param {Object[]} conf.langs - The target languages, mutated in place (`.translation`).
 * @param {Object[]} conf.urls - The urls being translated.
 * @param {Object} conf.fileIdsByPath - `daBasePath` -> uploaded Lilt file id.
 * @param {Object[]} conf.memories - The account's memories.
 * @param {string} conf.srcLang - The lowercase 2-letter source language.
 * @param {Function} conf.sendMessage - Reports progress/status text to the UI.
 * @returns {Promise<void>}
 */
async function sendAiTranslation({
  service, options, langs, urls, fileIdsByPath, memories, srcLang, sendMessage,
}) {
  const fileIds = Object.values(fileIdsByPath);
  const translationIdsByLang = {};

  await Promise.all(langs.map(async (lang) => {
    // On any failure, leave `.translation` untouched - there's no translation in Lilt
    // to check the status for, so the project stays retryable.
    const { lang: trgLang } = splitLocale(lang.code);
    const memoryId = findMemoryId(memories, srcLang, trgLang);
    if (!memoryId) {
      sendMessage({ text: `No Lilt memory found for ${srcLang} -> ${trgLang}.`, type: 'error' });
      return;
    }

    const reqUrl = `${resolveOrigin(service)}/v2/translate/file?fileId=${fileIds.join(',')}&memoryId=${memoryId}`;
    const opts = { method: 'POST', headers: await authHeaders(service) };
    const resp = await fetchWithRetry(reqUrl, opts, retryConfig(service, opts));
    const infos = await resp.json().catch(() => null);
    if (!resp.ok) {
      sendMessage({
        text: `Lilt translation request failed for ${lang.name}: ${extractErrorMessage(infos)}`,
        type: 'error',
      });
      return;
    }
    if (!Array.isArray(infos)) return;

    const translationIdsByPath = {};
    urls.forEach((url) => {
      const fileId = fileIdsByPath[url.daBasePath];
      const info = infos.find((entry) => entry.fileId === fileId);
      if (info?.id != null) translationIdsByPath[url.daBasePath] = info.id;
    });
    if (!Object.keys(translationIdsByPath).length) return;
    translationIdsByLang[lang.code] = translationIdsByPath;

    lang.translation ??= {};
    lang.translation.sent = Object.keys(translationIdsByPath).length;
    lang.translation.status = lang.translation.sent === urls.length ? 'created' : 'error';
  }));

  options.service.translationIds = { value: JSON.stringify(translationIdsByLang) };
}

/**
 * Polls AI Translation status for every not-yet-terminal language, updating
 * `lang.translation.translated`/`.status` in place.
 * @param {Object} conf
 * @param {Object} conf.service - The flattened per-environment service config.
 * @param {Object[]} conf.langs - The target languages to poll, mutated in place.
 * @param {Object[]} conf.urls - The urls being translated (only its `.length` is used).
 * @returns {Promise<void>}
 */
async function getAiStatus({ service, langs, urls }) {
  const translationIdsByLang = getTranslationIdsByLang(service);
  const activeLangs = langs.filter(
    (lang) => !TERMINAL_LANG_STATUSES.includes(lang.translation?.status),
  );

  await Promise.all(activeLangs.map(async (lang) => {
    const translationIdsByPath = translationIdsByLang[lang.code];
    const ids = translationIdsByPath ? Object.values(translationIdsByPath) : [];
    if (!ids.length) return;

    const reqUrl = `${resolveOrigin(service)}/v2/translate/file?translationIds=${ids.join(',')}`;
    const opts = { headers: await authHeaders(service) };
    const resp = await fetchWithRetry(reqUrl, opts, retryConfig(service, opts));
    if (!resp.ok) return;
    const infos = await resp.json().catch(() => null);
    if (!Array.isArray(infos)) return;

    lang.translation ??= {};
    const failed = infos.some((info) => info.status === 'Failed');
    const done = infos.filter((info) => AI_DONE_STATUSES.includes(info.status)).length;
    lang.translation.translated = done;
    if (failed) {
      lang.translation.status = 'error';
    } else if (done === urls.length) {
      lang.translation.status = 'translated';
    }
  }));
}

/**
 * Downloads and saves AI Translation output for a single language, one url at a time via
 * {@link downloadQueue} (each url's translated file is a separate Lilt download call, unlike
 * Verified Translation's single job-level zip).
 * @param {Object} conf
 * @param {string} conf.org - The DA org.
 * @param {string} conf.site - The DA site.
 * @param {Object} conf.service - The flattened per-environment service config.
 * @param {Object} conf.lang - The language being saved.
 * @param {Object[]} conf.urls - The urls to save, mutated in place.
 * @param {Function} conf.saveFn - Called per-url once its translated content is populated.
 * @returns {Promise<Object[]>} The same `urls` array.
 */
async function saveAiItems({
  org, site, service, lang, urls, saveFn,
}) {
  const translationIdsByLang = getTranslationIdsByLang(service);
  const translationIdsByPath = translationIdsByLang[lang.code];
  if (!translationIdsByPath) return urls;

  const downloadCallback = async (url) => {
    const translationId = translationIdsByPath[url.daBasePath];
    if (translationId == null) {
      url.status = 'error';
      return;
    }

    try {
      const reqUrl = `${resolveOrigin(service)}/v2/translate/files?id=${translationId}`;
      const opts = { headers: await authHeaders(service) };
      const resp = await fetchWithRetry(reqUrl, opts, retryConfig(service, opts));
      if (!resp.ok) throw new Error(resp.status);

      const text = await resp.text();
      url.sourceContent = await removeDnt({ org, site, html: text, ext: url.ext });
      await saveFn(url);
    } catch {
      url.status = 'error';
    }
  };

  await downloadQueue(urls, downloadCallback);
  return urls;
}

/**
 * Starts Verified Translation: creates one Lilt job covering every matched language, then
 * persists the job id for {@link getStatusAll}/{@link saveItems}. On job-creation failure,
 * matched langs keep no `.translation` so the project stays resendable.
 * @param {Object} conf
 * @param {string} conf.title - The project title, used as the Lilt job name.
 * @param {Object} conf.service - The flattened per-environment service config.
 * @param {Object} conf.options - The full options sheet; `options.service` is mutated so
 *  the caller's `saveState({options})` persists it.
 * @param {Object[]} conf.langs - The target languages, mutated in place (`.translation`).
 * @param {Object[]} conf.urls - The urls being translated.
 * @param {Object} conf.fileIdsByPath - `daBasePath` -> uploaded Lilt file id.
 * @param {Object[]} conf.memories - The account's memories.
 * @param {string} conf.srcLang - The lowercase 2-letter source language.
 * @param {string} [conf.srcLocale] - The uppercase source locale, if any.
 * @param {Function} conf.sendMessage - Reports progress/status text to the UI.
 * @returns {Promise<void>}
 */
async function sendVerifiedTranslation({
  title, service, options, langs, urls, fileIdsByPath, memories, srcLang, srcLocale, sendMessage,
}) {
  const fileIds = Object.values(fileIdsByPath);
  const languagePairs = [];
  const matchedLangs = [];

  langs.forEach((lang) => {
    const { lang: trgLang, locale: trgLocale } = splitLocale(lang.code);
    const memoryId = findMemoryId(memories, srcLang, trgLang);
    if (!memoryId) {
      // Leave `.translation` untouched - there's no translation in Lilt to check
      // the status for, so the project stays retryable.
      sendMessage({ text: `No Lilt memory found for ${srcLang} -> ${trgLang}.`, type: 'error' });
      return;
    }
    languagePairs.push({ trgLang, trgLocale, memoryId });
    matchedLangs.push(lang);
  });

  if (!languagePairs.length) {
    sendMessage({ text: 'No Lilt memories matched the requested languages.', type: 'error' });
    return;
  }

  const dueDateDays = Number(service.dueDateDays) || DEFAULT_DUE_DATE_DAYS;
  const body = {
    name: title,
    fileIds,
    due: dueDateIso(dueDateDays),
    srcLang,
    srcLocale,
    languagePairs,
  };

  const reqUrl = `${resolveOrigin(service)}/v2/jobs`;
  const opts = { method: 'POST', headers: await authHeaders(service), body: JSON.stringify(body) };
  const resp = await fetchWithRetry(reqUrl, opts, retryConfig(service, opts));
  const job = await resp.json().catch(() => null);
  if (!resp.ok || !job?.id) {
    // Leave matched langs' `.translation` untouched so the project stays retryable.
    sendMessage({ text: `Lilt job creation failed: ${extractErrorMessage(job)}`, type: 'error' });
    return;
  }

  options.service.jobId = { value: String(job.id) };

  matchedLangs.forEach((lang) => {
    lang.translation ??= {};
    lang.translation.sent = urls.length;
    lang.translation.status = 'created';
  });
}

/**
 * Polls Verified Translation status for every not-yet-terminal language via the job's
 * per-language-pair `stats.projects`. Lilt's `JobProject.isComplete` is the only granularity
 * available before export, so `.translated` is reported as all-or-nothing per language.
 * @param {Object} conf
 * @param {Object} conf.service - The flattened per-environment service config.
 * @param {Object[]} conf.langs - The target languages to poll, mutated in place.
 * @param {Object[]} conf.urls - The urls being translated (only its `.length` is used).
 * @returns {Promise<void>}
 */
async function getVerifiedStatus({ service, langs, urls }) {
  const jobId = service.jobId?.value;
  if (!jobId) return;

  const activeLangs = langs.filter(
    (lang) => !TERMINAL_LANG_STATUSES.includes(lang.translation?.status),
  );
  if (!activeLangs.length) return;

  const reqUrl = `${resolveOrigin(service)}/v2/jobs/${jobId}`;
  const opts = { headers: await authHeaders(service) };
  const resp = await fetchWithRetry(reqUrl, opts, retryConfig(service, opts));
  if (!resp.ok) return;
  const job = await resp.json().catch(() => null);
  const projects = job?.stats?.projects || [];

  activeLangs.forEach((lang) => {
    const { lang: trgLang } = splitLocale(lang.code);
    const project = projects.find((entry) => entry.trgLang?.toLowerCase() === trgLang);
    if (!project) return;

    lang.translation ??= {};
    if (project.isComplete) {
      lang.translation.translated = urls.length;
      lang.translation.status = 'translated';
    } else {
      lang.translation.translated = 0;
    }
  });
}

/**
 * Polls a Lilt job until its file export finishes preparing (or fails), via `isProcessing`:
 * `1` in progress, `0` idle/done, `-2` failed.
 * @param {Object} service - The flattened per-environment service config.
 * @param {string} jobId - The Lilt job id.
 * @returns {Promise<boolean>} Whether the export finished successfully.
 */
async function waitForJobExportReady(service, jobId) {
  for (let attempt = 0; attempt < EXPORT_POLL_MAX; attempt += 1) {
    const reqUrl = `${resolveOrigin(service)}/v2/jobs/${jobId}`;
    const opts = { headers: await authHeaders(service) };
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetchWithRetry(reqUrl, opts, retryConfig(service, opts));
    if (!resp.ok) return false;
    // eslint-disable-next-line no-await-in-loop
    const job = await resp.json().catch(() => null);
    if (job?.isProcessing === 0) return true;
    if (job?.isProcessing === -2) return false;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, EXPORT_POLL_MS); });
  }
  return false;
}

/**
 * Downloads and saves Verified Translation output for a single language. Unlike AI
 * Translation, Lilt only exposes one zip download per job export, so this fetches it once
 * (re-exporting/re-downloading per language is accepted as a v1 simplification) and
 * best-effort matches each url to a zip entry by its upload filename, rather than using
 * {@link downloadQueue}'s one-network-call-per-url pattern.
 * @param {Object} conf
 * @param {string} conf.org - The DA org.
 * @param {string} conf.site - The DA site.
 * @param {Object} conf.service - The flattened per-environment service config.
 * @param {Object} conf.lang - The language being saved.
 * @param {Object[]} conf.urls - The urls to save, mutated in place.
 * @param {Function} conf.saveFn - Called per-url once its translated content is populated.
 * @param {Function} conf.sendMessage - Reports progress/status text to the UI.
 * @returns {Promise<Object[]>} The same `urls` array.
 */
async function saveVerifiedItems({
  org, site, service, lang, urls, saveFn, sendMessage,
}) {
  const jobId = service.jobId?.value;
  if (!jobId) return urls;

  sendMessage({ text: `Waiting for Lilt to export ${lang.name} deliverables.` });

  const exportUrl = `${resolveOrigin(service)}/v2/jobs/${jobId}/export?type=files`;
  const exportOpts = { headers: await authHeaders(service) };
  const exportResp = await fetchWithRetry(exportUrl, exportOpts, retryConfig(service, exportOpts));
  if (!exportResp.ok) {
    const json = await exportResp.json().catch(() => null);
    sendMessage({ text: `Lilt export failed for ${lang.name}: ${extractErrorMessage(json)}`, type: 'error' });
    urls.forEach((url) => { url.status = 'error'; });
    return urls;
  }

  const ready = await waitForJobExportReady(service, jobId);
  if (!ready) {
    sendMessage({ text: `Lilt export for ${lang.name} is not ready yet.`, type: 'error' });
    urls.forEach((url) => { url.status = 'error'; });
    return urls;
  }

  const downloadUrl = `${resolveOrigin(service)}/v2/jobs/${jobId}/download`;
  const downloadOpts = { headers: await authHeaders(service) };
  const downloadResp = await fetchWithRetry(
    downloadUrl,
    downloadOpts,
    retryConfig(service, downloadOpts),
  );
  if (!downloadResp.ok) {
    const json = await downloadResp.json().catch(() => null);
    sendMessage({ text: `Lilt download failed for ${lang.name}: ${extractErrorMessage(json)}`, type: 'error' });
    urls.forEach((url) => { url.status = 'error'; });
    return urls;
  }

  const buffer = new Uint8Array(await downloadResp.arrayBuffer());
  const entries = Object.entries(unzipSync(buffer));

  await Promise.all(urls.map(async (url) => {
    const fileName = toFileName(url.daBasePath);
    const entry = entries.find(([path]) => path.endsWith(fileName));
    if (!entry) {
      url.status = 'error';
      return;
    }

    try {
      const text = strFromU8(entry[1]);
      url.sourceContent = await removeDnt({ org, site, html: text, ext: url.ext });
      await saveFn(url);
    } catch {
      url.status = 'error';
    }
  }));

  return urls;
}

/**
 * Starts Lilt translation for every requested language, in AI Translation or Verified
 * Translation mode per `service.translationMode` (defaults to AI Translation).
 * @param {Object} conf
 * @param {string} conf.title - The project title.
 * @param {Object} conf.service - The flattened per-environment service config.
 * @param {Object} conf.options - The full options sheet.
 * @param {Object[]} conf.langs - The target languages, mutated in place (`.translation`).
 * @param {Object[]} conf.urls - The urls being translated.
 * @param {Object} conf.actions - `{sendMessage, saveState}` UI callbacks.
 * @returns {Promise<void>}
 */
export async function sendAllLanguages({
  title, service, options, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;

  const connected = await isConnected(service);
  if (!connected) {
    sendMessage({ text: 'Not connected to Lilt.', type: 'error' });
    return;
  }

  const mode = service.translationMode || AI_MODE;
  const { lang: srcLang, locale: srcLocale } = splitLocale(
    options?.['source.language']?.code || service.sourceLanguage || 'en-US',
  );

  sendMessage({ text: `Uploading ${urls.length} items to Lilt.` });
  const fileIdsByPath = await uploadAllFiles(service, urls, sendMessage);
  if (Object.keys(fileIdsByPath).length !== urls.length) {
    // Leave langs' `.translation` untouched so the project stays retryable.
    sendMessage({
      text: `Uploaded ${Object.keys(fileIdsByPath).length}/${urls.length} items to Lilt - aborting.`,
      type: 'error',
    });
    return;
  }
  options.service.fileIds = { value: JSON.stringify(fileIdsByPath) };

  const memories = await fetchMemories(service);

  if (mode === VERIFIED_MODE) {
    await sendVerifiedTranslation({
      title,
      service,
      options,
      langs,
      urls,
      fileIdsByPath,
      memories,
      srcLang,
      srcLocale,
      sendMessage,
    });
  } else {
    await sendAiTranslation({
      service, options, langs, urls, fileIdsByPath, memories, srcLang, sendMessage,
    });
  }

  sendMessage();
  await saveState({ options });
}

/**
 * Polls translation status for every not-yet-terminal language, in AI Translation or
 * Verified Translation mode per `service.translationMode`.
 * @param {Object} conf
 * @param {Object} conf.service - The flattened per-environment service config.
 * @param {Object[]} conf.langs - The target languages to poll, mutated in place.
 * @param {Object[]} conf.urls - The urls being translated.
 * @param {Object} conf.actions - `{sendMessage, saveState}` UI callbacks.
 * @returns {Promise<void>}
 */
export async function getStatusAll({
  service, langs, urls, actions,
}) {
  const { sendMessage, saveState } = actions;

  const activeLangs = langs.filter(
    (lang) => !TERMINAL_LANG_STATUSES.includes(lang.translation?.status),
  );
  if (!activeLangs.length) return;

  const connected = await isConnected(service);
  if (!connected) {
    sendMessage({ text: 'Not connected to Lilt.', type: 'error' });
    return;
  }

  sendMessage({ text: 'Checking Lilt translation status.' });

  const mode = service.translationMode || AI_MODE;
  if (mode === VERIFIED_MODE) {
    await getVerifiedStatus({ service, langs, urls });
  } else {
    await getAiStatus({ service, langs, urls });
  }

  sendMessage();
  await saveState();
}

/**
 * Downloads and saves translated content for a single language, in AI Translation or
 * Verified Translation mode per `service.translationMode`.
 * @param {Object} conf
 * @param {string} conf.org - The DA org.
 * @param {string} conf.site - The DA site.
 * @param {Object} conf.service - The flattened per-environment service config.
 * @param {Object} conf.lang - The language being saved.
 * @param {Object[]} conf.urls - The urls to save.
 * @param {Function} conf.saveFn - Called per-url once its translated content is populated.
 * @param {Function} conf.sendMessage - Reports progress/status text to the UI.
 * @returns {Promise<Object[]>} The urls, each with a `.status` set.
 */
export async function saveItems({
  org, site, service, lang, urls, saveFn, sendMessage,
}) {
  const connected = await isConnected(service);
  if (!connected) return urls;

  const mode = service.translationMode || AI_MODE;
  if (mode === VERIFIED_MODE) {
    return saveVerifiedItems({
      org, site, service, lang, urls, saveFn, sendMessage,
    });
  }
  return saveAiItems({
    org, site, service, lang, urls, saveFn,
  });
}
