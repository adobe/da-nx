import { createCopy, createConfigLoader } from '../../../utils/loc.js';
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
const fetchCopy = (url, opts) => daFetch({ url, opts });
export const { overwriteCopy, rolloutCopy, mergeCopy } = createCopy({
  fetch: fetchCopy,
  loadConfig: createConfigLoader({ fetch: fetchCopy, daOrigin: DA_ADMIN }),
  daOrigin: DA_ADMIN,
  saveSource: daSource.save,
});

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
