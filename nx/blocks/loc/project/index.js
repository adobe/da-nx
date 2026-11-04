import getElementMetadata from '../../../../nx2/utils/getElementMetadata.js';
import { regionalDiff, removeLocTags, getBlockHashes, smartMerge } from '../regional-diff/regional-diff.js';
import { daFetch, source as daSource } from '../../../../nx2/utils/api.js';
import { DA_ADMIN } from '../../../../nx2/utils/utils.js';
import { Queue } from '../../../../nx2/public/utils/tree.js';

// Max concurrent /source/ reads from da-admin. Prevents flooding da-admin
// with OPTIONS+GET bursts during content scans (translate, rollout, validate).
export const MAX_CONCURRENT_READS = 10;

// Max concurrent /source/ writes to da-admin. Keeps R2 conditional-write
// (If-Match) contention and audit-log 412 retries at an acceptable level.
export const MAX_CONCURRENT_WRITES = 8;

const DEFAULT_TIMEOUT = 20000; // ms
const DA_METADATA_SELECTOR = 'body > .da-metadata';

const VERSION_SAVE_EXTS = new Set(['json', 'html']);

function shouldSaveVersion(url) {
  const ext = url.destination?.split('.').pop()?.toLowerCase();
  return VERSION_SAVE_EXTS.has(ext);
}

const PARSER = new DOMParser();

let projPath;
let projJson;

async function fetchData(path) {
  const resp = await daFetch({ url: path });
  if (!resp.ok) return null;
  return resp.json();
}

export function formatDate(timestamp) {
  const rawDate = timestamp ? new Date(timestamp) : new Date();
  const date = rawDate.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  const time = rawDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return { date, time };
}

export function calculateTime(startTime) {
  const crawlTime = Date.now() - startTime;
  return `${String(crawlTime / 1000).substring(0, 4)}s`;
}

export async function detectService(config, env = 'stage') {
  const name = config['translation.service.name']?.value || 'Google';
  if (name === 'GLaaS') {
    return {
      name,
      canResave: true,
      origin: config[`translation.service.${env}.origin`].value,
      clientid: config[`translation.service.${env}.clientid`].value,
      // eslint-disable-next-line import/no-unresolved
      actions: await import('../glaas/index.js'),
      // eslint-disable-next-line import/no-unresolved
      dnt: await import('../glaas/dnt.js'),
      preview: config[`translation.service.${env}.preview`].value,
    };
  }
  if (name === 'Google') {
    return {
      name,
      origin: 'http://localhost:8787/google/live',
      canResave: false,
      // eslint-disable-next-line import/no-unresolved
      actions: await import('../google/index.js'),
      // eslint-disable-next-line import/no-unresolved
      dnt: await import('../google/dnt.js'),
    };
  }
  // We get the service name for free via 'translation.service.name'
  const service = {
    env: env || 'stage',
    actions: await import(`../${name.toLowerCase()}/index.js`),
    dnt: await import('../dnt/dnt.js'),
  };
  Object.keys(config).forEach((key) => {
    if (key.startsWith('translation.service.')) {
      const serviceKey = key.replace('translation.service.', '');
      service[serviceKey] = config[key].value;
    }
  });
  return service;
}

export async function getDetails() {
  projPath = window.location.hash.replace('#', '');
  const data = await fetchData(`${DA_ADMIN}/source${projPath}.json`);
  return data;
}

export function convertUrl({ path, srcLang, destLang }) {
  const source = path.startsWith(srcLang) ? path : `${srcLang}${path}`;
  const destSlash = srcLang === '/' ? '/' : '';
  const destination = path.startsWith(srcLang) ? path.replace(srcLang, `${destLang}${destSlash}`) : `${destLang}${path}`;

  return { source, destination };
}

export async function saveStatus(json) {
  const copy = JSON.stringify(json);
  if (copy === projJson) return json;
  projJson = copy;
  const proj = JSON.parse(projJson);
  proj.urls.forEach((url) => { delete url.content; });
  const body = new FormData();
  const file = new Blob([JSON.stringify(proj)], { type: 'application/json' });
  body.append('data', file);
  const opts = { body, method: 'POST' };
  const resp = await daFetch({ url: `${DA_ADMIN}/source${projPath}.json`, opts });
  if (!resp.ok) return { error: 'Could not update project' };
  return json;
}

// Tracks in-flight version saves so parallel rollout/resync operations for
// the same destination path don't fire duplicate POSTs causing R2 412 audit conflicts.
const versionSaving = new Set();

async function saveVersion(path, label) {
  if (versionSaving.has(path)) return;
  versionSaving.add(path);
  try {
    const opts = { method: 'POST' };
    if (label) opts.body = JSON.stringify({ label });
    await daFetch({ url: `${DA_ADMIN}/versionsource${path}`, opts });
  } finally {
    versionSaving.delete(path);
  }
}

function collapseInnerTextSpaces(html) {
  return html.replace(/>([^<]*)</g, (match, textContent) => {
    // Only process if there's actual text content
    if (!textContent.trim()) {
      return match;
    }

    // Collapse multiple spaces to single space
    const cleaned = textContent.replace(/\s+/g, ' ');
    return `>${cleaned}<`;
  });
}

const getHtml = async (path, html, { collapse = true } = {}) => {
  const fetchHtml = async () => {
    const res = await daFetch({ url: `${DA_ADMIN}/source${path}` });
    if (!res.ok) return null;
    const str = await res.text();
    return str;
  };

  const str = html || await fetchHtml(path);
  if (!str) return null;
  return PARSER.parseFromString(collapse ? collapseInnerTextSpaces(str) : str, 'text/html');
};

const getDaUrl = (url) => {
  const [, org, repo, ...path] = url.destination.split('/');
  const pathname = `/${path.join('/').replace('.html', '')}`;
  return { org, repo, pathname };
};

function replaceHtml(text, fromOrg, fromRepo, options = {}) {
  const { daMetadata = {}, replaceRelative = true } = options;
  let inner = text;

  if (fromOrg && fromRepo && replaceRelative) {
    const fromOrigin = `https://main--${fromRepo}--${fromOrg}.aem.live`;
    inner = text
      .replaceAll('./media', `${fromOrigin}/media`)
      .replaceAll('href="/', `href="${fromOrigin}/`);
  }

  let metadataHTML = '';
  if (Object.keys(daMetadata).length > 0) {
    const daRows = Object.entries(daMetadata)
      .map(([key, value]) => {
        const textContent = value?.text ?? value ?? '';
        return `<div><div>${key}</div><div>${textContent}</div></div>`;
      })
      .join('');
    metadataHTML = `\n  <div class="da-metadata">${daRows}</div>\n`;
  }

  return `
    <body>
      <header></header>
      <main>${inner}</main>
      ${metadataHTML}<footer></footer>
    </body>
  `;
}

function saveHtml(url, content, { daMetadata = {}, replaceRelative = false } = {}) {
  const { org, repo, pathname } = getDaUrl(url);
  const body = replaceHtml(content, org, repo, { daMetadata, replaceRelative });
  return daSource.save({ org, site: repo, path: `${pathname}.html`, body });
}

export async function overwriteCopy(url, title) {
  let resp;
  if (url.sourceContent) {
    const type = url.destination.includes('.json') ? 'application/json' : 'text/html';
    const blob = new Blob([url.sourceContent], { type });
    const opts = {
      method: 'POST',
      body: new FormData(),
    };
    opts.body.append('data', blob);
    resp = await daFetch({ url: `${DA_ADMIN}/source${url.destination}`, opts });
  } else {
    const srcHtml = await getHtml(url.source, url.sourceHtml);
    if (srcHtml) {
      removeLocTags(srcHtml);
      const daMetadata = getElementMetadata(srcHtml.querySelector(DA_METADATA_SELECTOR));
      delete daMetadata?.acceptedhashes;
      delete daMetadata?.rejectedhashes;
      resp = await saveHtml(url, srcHtml.querySelector('main').innerHTML, { daMetadata });
    }
  }

  if (!resp?.ok) {
    url.status = 'error';
    return null;
  }

  url.status = 'success';
  if (shouldSaveVersion(url)) {
    saveVersion(url.destination, `${title} - Rolled Out`);
  }
  return resp;
}

function getPreviousHashes(metadata) {
  const acceptedHashes = metadata.acceptedhashes?.text?.split(',') || [];
  const rejectedHashes = metadata.rejectedhashes?.text?.split(',') || [];
  return { acceptedHashes, rejectedHashes };
}

export async function rolloutCopy(
  url,
  projectTitle,
  { labelLocal = null, labelUpstream = null } = {},
) {
  // if the regional folder has content that differs from langstore,
  // then a regional diff needs to be done
  try {
    const regionalCopy = await getHtml(url.destination);
    if (!regionalCopy) {
      throw new Error('No regional content or error fetching');
    }

    const langstoreCopy = await getHtml(url.source);
    if (!langstoreCopy) {
      throw new Error('No langstore content or error fetching');
    }

    removeLocTags(regionalCopy);
    removeLocTags(langstoreCopy);

    if (langstoreCopy.querySelector('body').outerHTML === regionalCopy.querySelector('body').outerHTML) {
      // No differences, don't need to do anything
      url.status = 'success';
      return Promise.resolve();
    }

    const daMetadataEl = regionalCopy.querySelector(DA_METADATA_SELECTOR);
    const daMetadata = getElementMetadata(daMetadataEl);
    const { acceptedHashes, rejectedHashes } = getPreviousHashes(daMetadata);

    // There are differences, upload the diffed regional file
    const diffed = await regionalDiff(langstoreCopy, regionalCopy, acceptedHashes, rejectedHashes);

    if (labelLocal) daMetadata['diff-label-local'] = labelLocal;
    if (labelUpstream) daMetadata['diff-label-upstream'] = labelUpstream;

    return new Promise((resolve) => {
      const savePromise = saveHtml(url, diffed.innerHTML, { daMetadata });

      const timedout = setTimeout(() => {
        url.status = 'timeout';
        resolve('timeout');
      }, DEFAULT_TIMEOUT);

      savePromise.then((daResp) => {
        clearTimeout(timedout);
        url.status = daResp.ok ? 'success' : 'error';
        if (daResp.ok) {
          saveVersion(url.destination, `${projectTitle} - Rolled Out`);
        }
        resolve();
      }).catch(() => {
        clearTimeout(timedout);
        url.status = 'error';
        resolve();
      });
    });
  } catch (e) {
    return overwriteCopy(url, projectTitle);
  }
}

export async function mergeCopy(
  url,
  projectTitle,
  { labelLocal = null, labelUpstream = null } = {},
) {
  try {
    const regionalCopy = await getHtml(url.destination);
    const regionalMain = regionalCopy?.querySelector('body > main').innerHTML;
    if (!regionalCopy || regionalMain === '' || regionalMain === '<div></div>') {
      throw new Error('No regional content or error fetching');
    }

    const langstoreCopy = url.sourceContent
      ? await getHtml(null, url.sourceContent)
      : await getHtml(url.source, url.sourceHtml);
    if (!langstoreCopy) throw new Error('No langstore content or error fetching');

    removeLocTags(regionalCopy);
    removeLocTags(langstoreCopy);

    if (langstoreCopy.querySelector('body').outerHTML === regionalCopy.querySelector('body').outerHTML) {
      // No differences, don't need to do anything
      url.status = 'success';
      return { ok: true };
    }

    const daMetadataEl = regionalCopy.querySelector(DA_METADATA_SELECTOR);
    const daMetadata = getElementMetadata(daMetadataEl);
    const { acceptedHashes, rejectedHashes } = getPreviousHashes(daMetadata);

    // There are differences, upload the annotated loc file
    const diffed = await regionalDiff(
      langstoreCopy,
      regionalCopy,
      acceptedHashes,
      rejectedHashes,
      { normalizeImages: url.normalizeImages },
    );

    if (labelLocal) daMetadata['diff-label-local'] = labelLocal;
    if (labelUpstream) daMetadata['diff-label-upstream'] = labelUpstream;

    const daResp = await saveHtml(url, diffed.innerHTML, { daMetadata });
    if (daResp.ok) {
      url.status = 'success';
      saveVersion(url.destination, `${projectTitle} - Rolled Out`);
    }
    return daResp;
  } catch (e) {
    return overwriteCopy(url, projectTitle);
  }
}

const ROLLOUT_BASE_KEY = 'rolloutbase';

const toBasePath = (path) => path.toLowerCase();

// Keeps metadata values exactly as authored (getElementMetadata's `text` is lowercased).
const readMetadata = (el) => Object.fromEntries(Object.entries(getElementMetadata(el))
  .map(([key, { content }]) => [key, content.innerHTML]));

function getRolloutBase(metadataEl, path) {
  const value = getElementMetadata(metadataEl)[ROLLOUT_BASE_KEY]?.content.textContent.trim();
  const parts = value?.split('|') || [];
  if (parts.length !== 2) return null;
  const [basePath, hashes] = parts;
  if (toBasePath(basePath) !== toBasePath(path)) return null;
  const list = hashes ? hashes.split(',') : [];
  return list.every((hash) => /^[0-9a-f]{12}$/.test(hash)) ? list : null;
}

const formatRolloutBase = (path, hashes) => `${toBasePath(path)}|${hashes.join(',')}`;

async function copySource({ source, org, site }) {
  const html = source.querySelector('main').innerHTML;
  const daMetadata = readMetadata(source.querySelector(DA_METADATA_SELECTOR));
  delete daMetadata.acceptedhashes;
  delete daMetadata.rejectedhashes;
  const sourceHashes = await getBlockHashes({ doc: source, org, site });
  return { html, skipped: 0, sourceHashes, daMetadata };
}

async function smartRollout({
  source, dest, destHtml, empty, path, org, site,
}) {
  if (!dest) return copySource({ source, org, site });
  const metadataEl = dest.querySelector(DA_METADATA_SELECTOR);
  const daMetadata = readMetadata(metadataEl);
  const base = getRolloutBase(metadataEl, path);
  if (base) {
    const merged = await smartMerge({
      base, source, dest, org, site,
    });
    return { ...merged, daMetadata };
  }
  if (empty) return copySource({ source, org, site });
  const sourceHashes = await getBlockHashes({ doc: source, org, site });
  return {
    html: destHtml, skipped: 0, sourceHashes, daMetadata, baselineOnly: true,
  };
}

// Block extraction only reads `main > div` sections; anything else would be silently dropped.
function getSectionedMain(doc) {
  const main = doc?.querySelectorAll('main').length === 1 && doc.querySelector('body > main');
  const isText = (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim();
  const isLoose = (node) => isText(node)
    || (node.nodeType === Node.ELEMENT_NODE && (node.nodeName !== 'DIV' || [...node.childNodes].some(isText)));
  return main && ![...main.childNodes].some(isLoose) ? main : null;
}

const EMPTY_TAGS = new Set(['DIV', 'P', 'BR']);

const isEmptyMain = (main) => !main.textContent.trim()
  && [...main.querySelectorAll('*')].every((el) => EMPTY_TAGS.has(el.nodeName) && !el.attributes.length);

async function fetchDestination(path) {
  const resp = await daFetch({ url: `${DA_ADMIN}/source${path}` });
  if (resp.status === 404) return {};
  if (!resp.ok) return { error: `Could not read ${path} (${resp.status})` };
  const doc = PARSER.parseFromString(await resp.text(), 'text/html');
  const main = getSectionedMain(doc);
  if (!main) return { error: `Unexpected content in ${path}` };
  return { doc, empty: isEmptyMain(main) };
}

const siteOf = (url) => {
  const { org, repo } = getDaUrl(url);
  return { org, site: repo };
};

function failSmartCopy(url, error) {
  url.status = 'error';
  url.error = error;
  return { ok: false, error };
}

export async function smartOverwriteCopy(url, projectTitle) {
  try {
    const { doc: regionalCopy, empty, error } = await fetchDestination(url.destination);
    if (error) return failSmartCopy(url, error);

    const langstoreCopy = url.sourceContent
      ? await getHtml(null, url.sourceContent, { collapse: false })
      : await getHtml(url.source, url.sourceHtml, { collapse: false });
    if (!getSectionedMain(langstoreCopy)) {
      return failSmartCopy(url, `Could not read source for ${url.destination}`);
    }

    const destHtml = regionalCopy?.querySelector('body > main').innerHTML;
    if (regionalCopy) removeLocTags(regionalCopy);
    removeLocTags(langstoreCopy);

    const {
      html, skipped, sourceHashes, daMetadata, baselineOnly,
    } = await smartRollout({
      source: langstoreCopy,
      dest: regionalCopy,
      destHtml,
      empty,
      path: url.destination,
      ...siteOf(url),
    });
    daMetadata[ROLLOUT_BASE_KEY] = formatRolloutBase(url.destination, sourceHashes);

    const daResp = await saveHtml(url, html, { daMetadata });
    if (!daResp.ok) return failSmartCopy(url, `Could not save ${url.destination} (${daResp.status})`);
    url.status = 'success';
    url.skipped = skipped;
    url.baselineOnly = !!baselineOnly;
    if (!baselineOnly) saveVersion(url.destination, `${projectTitle} - Rolled Out`);
    return daResp;
  } catch (e) {
    return failSmartCopy(url, `Could not roll out ${url.destination}: ${e.message}`);
  }
}

export async function saveLangItems(sitePath, items, lang, removeDnt) {
  const [org, repo] = window.location.hash.replace('#/', '').split('/');
  const results = new Array(items.length).fill(null);

  const queue = new Queue(async ({ item, idx }) => {
    const html = await item.blob.text();
    const isJson = item.basePath.endsWith('.json');
    const htmlToSave = await removeDnt(html, org, repo, { fileType: isJson ? 'json' : 'html' });

    const blob = new Blob([htmlToSave], { type: isJson ? 'application/json' : 'text/html' });

    const path = `${sitePath}${lang.location}${item.basePath}`;
    const body = new FormData();
    body.append('data', blob);
    const opts = { body, method: 'POST' };
    try {
      const resp = await daFetch({ url: `${DA_ADMIN}/source${path}`, opts });
      results[idx] = resp.ok
        ? { success: resp.status }
        : { error: 'Could not save item.', status: resp.status };
    } catch (e) {
      results[idx] = { error: e.message };
    }
  }, MAX_CONCURRENT_WRITES);

  await Promise.all(items.map((item, idx) => queue.push({ item, idx })));
  return results;
}

/**
 * Run a function with a maximum timeout.
 * If the timeout limit hits, resolve the still in progress promise.
 *
 * @param {Function} fn the function to run
 * @param {Number} timeout the miliseconds to wait before timing out.
 * @returns the results of the function
 */
export async function timeoutWrapper(fn, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve) => {
    const loading = fn();

    const timedout = setTimeout(() => {
      resolve({ error: 'timeout', loading });
    }, timeout);

    loading.then((result) => {
      clearTimeout(timedout);
      resolve(result);
    }).catch((error) => {
      clearTimeout(timedout);
      resolve({ error });
    });
  });
}
