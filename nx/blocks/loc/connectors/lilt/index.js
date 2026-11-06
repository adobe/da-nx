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
const UPLOAD_CONCURRENCY = 5;
const MAX_IDS_PER_REQUEST = 50;
const ZIP_CACHE_MAX = 5;
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

const TRADITIONAL_CHINESE_TAGS = ['HANT', 'TW', 'HK', 'MO'];

/**
 * Splits a BCP-47 code (e.g. `en-US`) into Lilt's lowercase language and uppercase region
 * fields. Lilt has no region for Chinese: Simplified is `zh` and Traditional is `zt`.
 * @param {string} code - The BCP-47 code.
 * @returns {{lang: string, locale: string|undefined}} The Lilt language and region.
 */
function splitLocale(code) {
  const [lang = '', ...subtags] = (code || '').split('-');
  const tags = subtags.map((tag) => tag.toUpperCase());
  if (lang.toLowerCase() === 'zh') {
    return { lang: tags.some((tag) => TRADITIONAL_CHINESE_TAGS.includes(tag)) ? 'zt' : 'zh' };
  }
  return { lang: lang.toLowerCase(), locale: tags.find((tag) => /^([A-Z]{2}|\d{3})$/.test(tag)) };
}

/**
 * Case-insensitively compares two optional language or region values.
 * @param {string} [a] - The first value.
 * @param {string} [b] - The second value.
 * @returns {boolean} True if both are empty or equal.
 */
function sameTag(a, b) {
  return (a || '').toLowerCase() === (b || '').toLowerCase();
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
 * @returns {Promise<{id: ?number, error: ?string}>} The uploaded file's Lilt id, or the
 *  Lilt error detail on failure.
 */
async function uploadFile(service, url) {
  const fileName = toFileName(url.daBasePath);
  const reqUrl = `${resolveOrigin(service)}/v2/files?name=${encodeURIComponent(fileName)}`;
  const opts = {
    method: 'POST',
    headers: await authHeaders(service, OCTET_HEADERS),
    body: url.content,
  };
  const resp = await fetchWithRetry(reqUrl, opts, retryConfig(service, opts));
  const json = await resp.json().catch(() => null);
  if (!resp.ok) return { id: null, error: extractErrorMessage(json) };
  return { id: json?.id ?? null, error: null };
}

/**
 * Splits a list into consecutive groups of at most `size` items.
 * @param {Array} items - The items to split.
 * @param {number} size - The maximum group size.
 * @returns {Array[]} The groups.
 */
function chunk(items, size) {
  return Array.from(
    { length: Math.ceil(items.length / size) },
    (_, i) => items.slice(i * size, (i + 1) * size),
  );
}

/**
 * Uploads every url's source content to Lilt, at most {@link UPLOAD_CONCURRENCY} at a time.
 * Reports a single rolled-up error message if any upload fails, rather than one per file,
 * so failures don't clobber each other's message in the UI.
 * @param {Object} service - The flattened per-environment service config.
 * @param {Object[]} urls - The urls to upload.
 * @param {Function} sendMessage - Reports an error message, sourced from the first
 *  failed upload, if any upload fails.
 * @returns {Promise<Object>} A `daBasePath` -> Lilt file id map, omitting any upload
 *  that failed.
 */
async function uploadAllFiles(service, urls, sendMessage) {
  const fileIdsByPath = {};
  const errors = [];
  for (const group of chunk(urls, UPLOAD_CONCURRENCY)) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(group.map(async (url) => {
      const { id, error } = await uploadFile(service, url);
      if (error) errors.push(error);
      else if (id != null) fileIdsByPath[url.daBasePath] = id;
    }));
  }
  if (errors.length) {
    sendMessage({ text: `Upload to Lilt failed: ${errors[0]}`, type: 'error' });
  }
  return fileIdsByPath;
}

/**
 * Calls a `/v2/translate/file` endpoint with the ids split across requests of at most
 * {@link MAX_IDS_PER_REQUEST}, keeping the query string bounded, and merges the responses.
 * Stops at the first failing request.
 * @param {Object} params
 * @param {Object} params.service - The flattened per-environment service config.
 * @param {Array} params.ids - The ids to send.
 * @param {Function} params.buildUrl - Builds the request url from a comma-joined id list.
 * @param {string} [params.method] - The HTTP method; defaults to GET.
 * @returns {Promise<{infos: Object[], error: ?string}>} The merged responses, and the
 *  error detail if any request failed.
 */
async function requestInIdChunks({
  service, ids, buildUrl, method,
}) {
  const infos = [];
  const opts = { headers: await authHeaders(service) };
  if (method) opts.method = method;
  for (const group of chunk(ids, MAX_IDS_PER_REQUEST)) {
    // eslint-disable-next-line no-await-in-loop
    const resp = await fetchWithRetry(buildUrl(group.join(',')), opts, retryConfig(service, opts));
    // eslint-disable-next-line no-await-in-loop
    const json = await resp.json().catch(() => null);
    if (!resp.ok) return { infos, error: extractErrorMessage(json) };
    if (!Array.isArray(json)) return { infos, error: 'unexpected response' };
    infos.push(...json);
  }
  return { infos, error: null };
}

/**
 * Fetches every Lilt memory for this account, accepting a bare array or a `memories` wrapper.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Promise<{memories: Object[], error: ?string}>} The memories (`[]` on failure)
 *  and the Lilt error detail if the request failed.
 */
async function fetchMemories(service) {
  const reqUrl = `${resolveOrigin(service)}/v2/memories`;
  const opts = { headers: await authHeaders(service) };
  const resp = await fetchWithRetry(reqUrl, opts, retryConfig(service, opts));
  const json = await resp.json().catch(() => null);
  if (!resp.ok) return { memories: [], error: extractErrorMessage(json) };
  return { memories: Array.isArray(json) ? json : (json?.memories || []), error: null };
}

/**
 * Finds the memory for a language pair. The target region must match; a memory without a
 * target region, or the only memory for the language, is the fallback. Source region only
 * breaks ties.
 * @param {Object[]} memories - The account's memories (see {@link fetchMemories}).
 * @param {Object} pair
 * @param {string} pair.srcLang - The Lilt source language.
 * @param {string} [pair.srcLocale] - The source region.
 * @param {string} pair.trgLang - The Lilt target language.
 * @param {string} [pair.trgLocale] - The target region.
 * @returns {number|null} The matching memory's id, or null if none matched.
 */
function findMemoryId(memories, {
  srcLang, srcLocale, trgLang, trgLocale,
}) {
  const sameLangs = memories.filter((memory) => sameTag(memory.srclang, srcLang)
    && sameTag(memory.trglang, trgLang));
  const candidates = [
    sameLangs.filter((memory) => sameTag(memory.trglocale, trgLocale)),
    sameLangs.filter((memory) => !memory.trglocale),
    sameLangs.length === 1 ? sameLangs : [],
  ].find((list) => list.length) || [];
  const match = candidates.find((memory) => sameTag(memory.srclocale, srcLocale)) || candidates[0];
  return match?.id ?? null;
}

/**
 * Finds a job project by target language and region, falling back to the only project for
 * the language.
 * @param {Object[]} projects - The job's `stats.projects`.
 * @param {string} code - The BCP-47 target code.
 * @returns {?Object} The project, if found.
 */
function findProject(projects, code) {
  const { lang, locale } = splitLocale(code);
  const sameLang = projects.filter((project) => sameTag(project.trgLang, lang));
  return sameLang.find((project) => sameTag(project.trgLocale, locale))
    || (sameLang.length === 1 ? sameLang[0] : null);
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
 * Reads back the `lang.code` -> Lilt job id map persisted by {@link sendVerifiedTranslation}.
 * @param {Object} service - The flattened per-environment service config.
 * @returns {Object} The parsed map, or `{}` if missing/invalid.
 */
function getJobIdsByLang(service) {
  try {
    return JSON.parse(service?.jobIds?.value || '{}');
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
 * @param {string} [conf.srcLocale] - The uppercase source locale, if any.
 * @param {Function} conf.sendMessage - Reports a single rolled-up error, sourced from
 *  the first language that failed, if any language fails.
 * @returns {Promise<boolean>} True if an error was reported, so the caller should not
 *  clear it with a follow-up {@link sendMessage} call.
 */
async function sendAiTranslation({
  service, options, langs, urls, fileIdsByPath, memories, srcLang, srcLocale, sendMessage,
}) {
  const fileIds = Object.values(fileIdsByPath);
  const translationIdsByLang = {};
  const errors = [];

  await Promise.all(langs.map(async (lang) => {
    // On failure, leave `.translation` untouched so the project stays retryable.
    const { lang: trgLang, locale: trgLocale } = splitLocale(lang.code);
    const memoryId = findMemoryId(memories, {
      srcLang, srcLocale, trgLang, trgLocale,
    });
    if (!memoryId) {
      errors.push(`No Lilt memory found for ${srcLang} -> ${lang.code}.`);
      return;
    }

    const { infos, error } = await requestInIdChunks({
      service,
      ids: fileIds,
      method: 'POST',
      buildUrl: (ids) => `${resolveOrigin(service)}/v2/translate/file?fileId=${ids}&memoryId=${memoryId}`,
    });
    if (error) errors.push(`Lilt translation request failed for ${lang.name}: ${error}`);
    if (error && !infos.length) return;

    const translationIdsByPath = {};
    urls.forEach((url) => {
      const fileId = fileIdsByPath[url.daBasePath];
      const info = infos.find((entry) => entry.fileId === fileId);
      if (info?.id != null) translationIdsByPath[url.daBasePath] = info.id;
    });
    if (!Object.keys(translationIdsByPath).length) {
      errors.push(`Lilt returned no translation ids for ${lang.name}.`);
      return;
    }
    translationIdsByLang[lang.code] = translationIdsByPath;

    lang.translation ??= {};
    lang.translation.sent = Object.keys(translationIdsByPath).length;
    lang.translation.status = lang.translation.sent === urls.length ? 'created' : 'error';
    if (lang.translation.status === 'error') {
      errors.push(`Lilt started only ${lang.translation.sent} of ${urls.length} files for ${lang.name}.`);
    }
  }));

  if (errors.length) sendMessage({ text: errors[0], type: 'error' });

  options.service.translationIds = {
    value: JSON.stringify({ ...getTranslationIdsByLang(options.service), ...translationIdsByLang }),
  };
  return errors.length > 0;
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

    const { infos, error } = await requestInIdChunks({
      service,
      ids,
      buildUrl: (chunkIds) => `${resolveOrigin(service)}/v2/translate/file?translationIds=${chunkIds}`,
    });
    if (error) return;

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
 * @param {Function} conf.sendMessage - Reports a single rolled-up error, sourced from
 *  the first language that failed to match a memory, if any language fails.
 * @returns {Promise<boolean>} True if an error was reported, so the caller should not
 *  clear it with a follow-up {@link sendMessage} call.
 */
async function sendVerifiedTranslation({
  title, service, options, langs, urls, fileIdsByPath, memories, srcLang, srcLocale, sendMessage,
}) {
  const fileIds = Object.values(fileIdsByPath);
  const languagePairs = [];
  const matchedLangs = [];
  const errors = [];

  langs.forEach((lang) => {
    const { lang: trgLang, locale: trgLocale } = splitLocale(lang.code);
    const memoryId = findMemoryId(memories, {
      srcLang, srcLocale, trgLang, trgLocale,
    });
    if (!memoryId) {
      // Leave `.translation` untouched so the project stays retryable.
      errors.push(`No Lilt memory found for ${srcLang} -> ${lang.code}.`);
      return;
    }
    languagePairs.push({ trgLang, trgLocale, memoryId });
    matchedLangs.push(lang);
  });

  if (!languagePairs.length) {
    sendMessage({ text: 'No Lilt memories matched the requested languages.', type: 'error' });
    return true;
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
    // Leave `.translation` untouched so the project stays retryable.
    sendMessage({ text: `Lilt job creation failed: ${extractErrorMessage(job)}`, type: 'error' });
    return true;
  }

  const jobIdsByLang = { ...getJobIdsByLang(options.service) };
  matchedLangs.forEach((lang) => { jobIdsByLang[lang.code] = String(job.id); });
  options.service.jobIds = { value: JSON.stringify(jobIdsByLang) };

  matchedLangs.forEach((lang) => {
    lang.translation ??= {};
    lang.translation.sent = urls.length;
    lang.translation.status = 'created';
  });

  if (errors.length) sendMessage({ text: errors[0], type: 'error' });
  return errors.length > 0;
}

/**
 * Polls Verified Translation status for every not-yet-terminal language via the job's
 * per-language-pair `stats.projects`. Lilt's `JobProject.isComplete` is the only granularity
 * available before export, so `.translated` is reported as all-or-nothing per language.
 * @param {Object} conf
 * @param {Object} conf.service - The flattened per-environment service config. Only languages
 *  with an entry in `service.jobIds` are polled, so `waiting` dependent languages are never
 *  matched to another language's project.
 * @param {Object[]} conf.langs - The target languages to poll, mutated in place.
 * @param {Object[]} conf.urls - The urls being translated (only its `.length` is used).
 * @returns {Promise<void>}
 */
async function getVerifiedStatus({ service, langs, urls }) {
  const jobIdsByLang = getJobIdsByLang(service);
  const activeLangs = langs.filter((lang) => (
    !TERMINAL_LANG_STATUSES.includes(lang.translation?.status) && jobIdsByLang[lang.code]
  ));
  const langsByJobId = activeLangs.reduce((acc, lang) => {
    const jobId = jobIdsByLang[lang.code];
    return { ...acc, [jobId]: [...(acc[jobId] || []), lang] };
  }, {});

  await Promise.all(Object.entries(langsByJobId).map(async ([jobId, jobLangs]) => {
    const reqUrl = `${resolveOrigin(service)}/v2/jobs/${jobId}`;
    const opts = { headers: await authHeaders(service) };
    const resp = await fetchWithRetry(reqUrl, opts, retryConfig(service, opts));
    if (!resp.ok) return;
    const job = await resp.json().catch(() => null);
    const projects = job?.stats?.projects || [];

    jobLangs.forEach((lang) => {
      const project = findProject(projects, lang.code);
      if (!project) return;

      lang.translation ??= {};
      if (project.isComplete) {
        lang.translation.translated = urls.length;
        lang.translation.status = 'translated';
      } else {
        lang.translation.translated = 0;
      }
    });
  }));
}

const jobZipCache = new Map();

/**
 * Fetches a Lilt job.
 * @param {Object} service - The flattened per-environment service config.
 * @param {string} jobId - The Lilt job id.
 * @returns {Promise<?Object>} The job, or null on failure.
 */
async function fetchJob(service, jobId) {
  const opts = { headers: await authHeaders(service) };
  const resp = await fetchWithRetry(
    `${resolveOrigin(service)}/v2/jobs/${jobId}`,
    opts,
    retryConfig(service, opts),
  );
  if (!resp.ok) return null;
  return resp.json().catch(() => null);
}

/**
 * Polls a Lilt job until its file export finishes preparing (or fails), via `isProcessing`:
 * `1` in progress, `0` idle/done, `-2` failed.
 * @param {Object} service - The flattened per-environment service config.
 * @param {string} jobId - The Lilt job id.
 * @returns {Promise<?Object>} The job once the export finished, or null on failure/timeout.
 */
async function waitForJobExportReady(service, jobId) {
  for (let attempt = 0; attempt < EXPORT_POLL_MAX; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop
    const job = await fetchJob(service, jobId);
    if (!job) return null;
    if (job.isProcessing === 0) return job;
    if (job.isProcessing === -2) return null;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, EXPORT_POLL_MS); });
  }
  return null;
}

/**
 * Summarizes which of a job's projects are complete, so a cached zip is reused only while
 * no project has changed completion state.
 * @param {Object} job - The Lilt job.
 * @returns {string} The signature.
 */
function jobSignature(job) {
  return (job?.stats?.projects || []).map((p) => `${p.id}:${p.isComplete}`).join(',');
}

/**
 * Finds a language's translated file in a job zip. Lilt lays it out as
 * `Project_<id>_<src>_<trg>/<stem>.<trg><ext>`, one folder per language pair, so the
 * folder is picked by project id and the file by its upload stem.
 * @param {Object} conf
 * @param {Array[]} conf.entries - The unzipped `[path, bytes]` entries.
 * @param {Object} conf.project - The language's job project.
 * @param {string} conf.fileName - The upload filename.
 * @returns {?Array} The matching entry, if any.
 */
function findLangEntry({ entries, project, fileName }) {
  const dot = fileName.lastIndexOf('.');
  const stem = `${fileName.slice(0, dot)}.`.toLowerCase();
  const ext = fileName.slice(dot).toLowerCase();

  return entries.find(([path]) => {
    const [folder, ...rest] = path.split('/');
    if (!rest.length || !folder.startsWith(`Project_${project.id}_`)) return false;
    const name = rest.pop().toLowerCase();
    const middle = name.slice(stem.length, name.length - ext.length);
    return name === fileName.toLowerCase()
      || (name.startsWith(stem) && name.endsWith(ext) && middle && !middle.includes('.'));
  });
}

/**
 * Exports, downloads and unzips a job, reusing the previous download while the job's
 * project completion state is unchanged so a multi-language job downloads once.
 * @param {Object} service - The flattened per-environment service config.
 * @param {string} jobId - The Lilt job id.
 * @returns {Promise<{entries: ?Array[], job: ?Object, error: ?string}>} The zip entries
 *   and job, or the error.
 */
async function loadJobEntries(service, jobId) {
  const current = await fetchJob(service, jobId);
  const cached = jobZipCache.get(jobId);
  if (current && cached?.signature === jobSignature(current)) {
    return { entries: cached.entries, job: current, error: null };
  }
  jobZipCache.delete(jobId);

  const exportUrl = `${resolveOrigin(service)}/v2/jobs/${jobId}/export?type=files`;
  const exportOpts = { headers: await authHeaders(service) };
  const exportResp = await fetchWithRetry(exportUrl, exportOpts, retryConfig(service, exportOpts));
  if (!exportResp.ok) {
    const json = await exportResp.json().catch(() => null);
    return { entries: null, job: null, error: `export failed: ${extractErrorMessage(json)}` };
  }

  const job = await waitForJobExportReady(service, jobId);
  if (!job) return { entries: null, job: null, error: 'export is not ready yet' };

  const downloadUrl = `${resolveOrigin(service)}/v2/jobs/${jobId}/download`;
  const opts = { headers: await authHeaders(service) };
  const resp = await fetchWithRetry(downloadUrl, opts, retryConfig(service, opts));
  if (!resp.ok) {
    const json = await resp.json().catch(() => null);
    return { entries: null, job: null, error: `download failed: ${extractErrorMessage(json)}` };
  }

  const entries = Object.entries(unzipSync(new Uint8Array(await resp.arrayBuffer())));
  if (jobZipCache.size >= ZIP_CACHE_MAX) jobZipCache.delete(jobZipCache.keys().next().value);
  jobZipCache.set(jobId, { signature: jobSignature(job), entries });
  return { entries, job, error: null };
}

/**
 * Archives a job once every one of its projects is complete. Best-effort: archived jobs
 * stay downloadable, and a failure here must not fail the save.
 * @param {Object} service - The flattened per-environment service config.
 * @param {string} jobId - The Lilt job id.
 * @param {Object} job - The job, as returned once its export finished.
 * @returns {Promise<void>}
 */
async function archiveCompletedJob(service, jobId, job) {
  const projects = job?.stats?.projects || [];
  if (job?.status === 'archived' || !projects.length || !projects.every((p) => p.isComplete)) {
    return;
  }
  try {
    const opts = { method: 'POST', headers: await authHeaders(service) };
    await fetchWithRetry(
      `${resolveOrigin(service)}/v2/jobs/${jobId}/archive`,
      opts,
      retryConfig(service, opts),
    );
  } catch {
    // Archiving is cosmetic; the translations are already saved.
  }
}

/**
 * Downloads and saves Verified Translation output for a single language. Unlike AI
 * Translation, Lilt only exposes one zip download per job, so the zip is cached per job and
 * each url is matched to the language's project folder and upload filename, rather than
 * using {@link downloadQueue}'s one-network-call-per-url pattern. Archives the job once all
 * of its projects are complete and this language saved in full.
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
  const jobId = getJobIdsByLang(service)[lang.code];
  if (!jobId) return urls;

  sendMessage({ text: `Waiting for Lilt to export ${lang.name} deliverables.` });

  const { entries, job, error } = await loadJobEntries(service, jobId);
  if (error) {
    sendMessage({ text: `Lilt ${error} for ${lang.name}.`, type: 'error' });
    urls.forEach((url) => { url.status = 'error'; });
    return urls;
  }

  const project = findProject(job?.stats?.projects || [], lang.code);
  if (!project) {
    sendMessage({ text: `Lilt has no project for ${lang.name}.`, type: 'error' });
    urls.forEach((url) => { url.status = 'error'; });
    return urls;
  }

  await Promise.all(urls.map(async (url) => {
    const entry = findLangEntry({ entries, project, fileName: toFileName(url.daBasePath) });
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

  if (urls.every((url) => url.status === 'success')) {
    await archiveCompletedJob(service, jobId, job);
  }

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
    // Leave `.translation` untouched; uploadAllFiles already reported the error.
    return;
  }
  options.service.fileIds = { value: JSON.stringify(fileIdsByPath) };

  const { memories, error: memoriesError } = await fetchMemories(service);
  if (memoriesError) {
    sendMessage({ text: `Fetching Lilt memories failed: ${memoriesError}`, type: 'error' });
    return;
  }

  const hadError = mode === VERIFIED_MODE
    ? await sendVerifiedTranslation({
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
    })
    : await sendAiTranslation({
      service, options, langs, urls, fileIdsByPath, memories, srcLang, srcLocale, sendMessage,
    });

  // Don't clear: sendMessage is single-slot and would erase the reported error.
  if (!hadError) sendMessage();
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
