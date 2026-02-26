import getElementMetadata from '../../../utils/getElementMetadata.js';
import { regionalDiff, removeLocTags } from '../regional-diff/regional-diff.js';
import { daFetch, saveToDa } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';

const DEFAULT_TIMEOUT = 20000; // ms
const DA_METADATA_SELECTOR = 'body > .da-metadata';

const PARSER = new DOMParser();

let projPath;
let projJson;

async function fetchData(path) {
  const resp = await daFetch(path);
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
  const data = await fetchData(`${DA_ORIGIN}/source${projPath}.json`);
  return data;
}

export function convertUrl({ path, srcLang, destLang }) {
  const source = path.startsWith(srcLang) ? path : `${srcLang}${path}`;
  const destSlash = srcLang === '/' ? '/' : '';
  const destination = path.startsWith(srcLang) ? path.replace(srcLang, `${destLang}${destSlash}`) : `${destLang}${path}`;

  return { source, destination };
}

export async function saveStatus(json) {
  // Make a deep (string) copy so the in-memory data is not destroyed
  const copy = JSON.stringify(json);

  // Only save if the data is different;
  if (copy === projJson) return json;

  // Store it for future comparisons
  projJson = copy;

  // Re-parse for other uses
  const proj = JSON.parse(projJson);

  // Do not persist source content
  proj.urls.forEach((url) => { delete url.content; });

  const body = new FormData();
  const file = new Blob([JSON.stringify(proj)], { type: 'application/json' });
  body.append('data', file);
  const opts = { body, method: 'POST' };
  const resp = await daFetch(`${DA_ORIGIN}/source${projPath}.json`, opts);
  if (!resp.ok) return { error: 'Could not update project' };
  return json;
}

async function saveVersion(path, label) {
  const opts = { method: 'POST' };
  if (label) opts.body = JSON.stringify({ label });

  const res = await daFetch(`${DA_ORIGIN}/versionsource${path}`, opts);
  return res;
}

// Tag names that are inline; spaces adjacent to these are preserved when trimming
const INLINE_TAGS = 'a,abbr,b,em,i,span,strong,sub,sup'.split(',');

export function collapseInnerTextSpaces(html) {
  return html.replace(/>([^<]*)</g, (match, text, offset, str) => {
    if (!text.trim()) return match;
    let s = text.replace(/\s+/g, ' ');
    const prevClosed = str.slice(0, offset + 1).match(/<\/([a-z][a-z0-9-]*)\s*>$/i);
    const nextOpens = str.slice(offset + match.length - 1).match(/^<([a-z][a-z0-9-]*)(?=[\s>])/i);
    const keepStart = prevClosed && INLINE_TAGS.includes(prevClosed[1].toLowerCase());
    const keepEnd = nextOpens && INLINE_TAGS.includes(nextOpens[1].toLowerCase());
    if (!keepStart) s = s.trimStart();
    if (!keepEnd) s = s.trimEnd();
    return `>${s}<`;
  });
}

const getHtml = async (path, html) => {
  const fetchHtml = async () => {
    const res = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (!res.ok) return null;
    const str = await res.text();
    return str;
  };

  const str = html || await fetchHtml(path);
  return PARSER.parseFromString(collapseInnerTextSpaces(str), 'text/html');
};

const getDaUrl = (url) => {
  const [, org, repo, ...path] = url.destination.split('/');
  const pathname = `/${path.join('/').replace('.html', '')}`;
  return { org, repo, pathname };
};

export async function overwriteCopy(url, title) {
  let resp;
  if (url.sourceContent) {
    // If source content was supplied upstream, use it.
    const type = url.destination.includes('.json') ? 'application/json' : 'text/html';
    const blob = new Blob([url.sourceContent], { type });
    const opts = {
      method: 'POST',
      body: new FormData(),
    };
    opts.body.append('data', blob);
    resp = await daFetch(`${DA_ORIGIN}/source${url.destination}`, opts);
  } else {
    const srcHtml = await getHtml(url.source);
    if (srcHtml) {
      removeLocTags(srcHtml);
      const daMetadata = getElementMetadata(srcHtml.querySelector(DA_METADATA_SELECTOR));
      delete daMetadata?.acceptedhashes;
      delete daMetadata?.rejectedhashes;
      resp = await saveToDa(
        srcHtml.querySelector('main').innerHTML,
        getDaUrl(url),
        daMetadata,
      );
    }
  }

  if (!resp?.ok) {
    url.status = 'error';
    return null;
  }

  url.status = 'success';
  // Don't wait for the version save
  saveVersion(url.destination, `${title} - Rolled Out`);
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
      const daUrl = getDaUrl(url);
      const savePromise = saveToDa(diffed.innerHTML, daUrl, daMetadata);

      const timedout = setTimeout(() => {
        url.status = 'timeout';
        resolve('timeout');
      }, DEFAULT_TIMEOUT);

      savePromise.then(({ daResp }) => {
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
      : await getHtml(url.source);
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
    const diffed = await regionalDiff(langstoreCopy, regionalCopy, acceptedHashes, rejectedHashes);

    if (labelLocal) daMetadata['diff-label-local'] = labelLocal;
    if (labelUpstream) daMetadata['diff-label-upstream'] = labelUpstream;

    const daUrl = getDaUrl(url);
    const { daResp } = await saveToDa(diffed.innerHTML, daUrl, daMetadata);
    if (daResp.ok) {
      url.status = 'success';
      saveVersion(url.destination, `${projectTitle} - Rolled Out`);
    }
    return daResp;
  } catch (e) {
    return overwriteCopy(url, projectTitle);
  }
}

export async function saveLangItems(sitePath, items, lang, removeDnt) {
  const [org, repo] = window.location.hash.replace('#/', '').split('/');

  return Promise.all(items.map(async (item) => {
    const html = await item.blob.text();
    const isJson = item.basePath.endsWith('.json');
    const htmlToSave = await removeDnt(html, org, repo, { fileType: isJson ? 'json' : 'html' });

    const blob = new Blob([htmlToSave], { type: isJson ? 'application/json' : 'text/html' });

    const path = `${sitePath}${lang.location}${item.basePath}`;
    const body = new FormData();
    body.append('data', blob);
    const opts = { body, method: 'POST' };
    try {
      const resp = await daFetch(`${DA_ORIGIN}/source${path}`, opts);
      return { success: resp.status };
    } catch {
      return { error: 'Could not save documents' };
    }
  }));
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
