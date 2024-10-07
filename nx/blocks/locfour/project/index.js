import { regionalDiff, removeLocTags } from '../regional-diff/regional-diff.js';
import { daFetch, saveToDa } from '../../../utils/daFetch.js';

const DA_ORIGIN = 'https://admin.da.live';
const DEFAULT_TIMEOUT = 20000; // ms

let projPath;

async function fetchData(path) {
  const resp = await daFetch(path);
  if (!resp.ok) return null;
  return resp.json();
}

export async function getDetails() {
  projPath = window.location.hash.replace('#', '');
  const data = await fetchData(`${DA_ORIGIN}/source${projPath}.json`);
  return data;
}

async function saveVersion(path, label) {
  const opts = { method: 'POST' };
  if (label) opts.body = JSON.stringify({ label });

  const res = await daFetch(`${DA_ORIGIN}/versionsource${path}`, opts);
  return res;
}

export async function overwriteCopy(url, projectTitle) {
  const body = new FormData();
  body.append('destination', url.destination);
  const opts = { method: 'POST', body };

  return new Promise((resolve) => {
    (() => {
      const fetched = daFetch(`${DA_ORIGIN}/copy${url.source}`, opts);

      const timedout = setTimeout(() => {
        url.status = 'timeout';
        resolve('timeout');
      }, DEFAULT_TIMEOUT);

      fetched.then((resp) => {
        clearTimeout(timedout);
        url.status = resp.ok ? 'success' : 'error';
        if (resp.ok) {
          saveVersion(url.destination, `${projectTitle} - Rolled Out`);
        }
        resolve();
      }).catch(() => {
        clearTimeout(timedout);
        url.status = 'error';
        resolve();
      });
    })();
  });
}

const collapseWhitespace = (str) => str.replace(/\s+/g, ' ');

const getHtml = async (url, format = 'dom') => {
  const res = await daFetch(`${DA_ORIGIN}/source${url}`);
  if (!res.ok) return null;
  const str = await res.text();
  if (format === 'text') return str;
  const parser = new DOMParser();
  return parser.parseFromString(collapseWhitespace(str), 'text/html');
};

const getDaUrl = (url) => {
  const [, org, repo, ...path] = url.destination.split('/');
  const pathname = `/${path.join('/').replace('.html', '')}`;
  return { org, repo, pathname };
};

export async function rolloutCopy(url, projectTitle) {
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

    if (langstoreCopy.querySelector('main').outerHTML === regionalCopy.querySelector('main').outerHTML) {
      // No differences, don't need to do anything
      url.status = 'success';
      return Promise.resolve();
    }

    // There are differences, upload the annotated loc file
    const diffedMain = await regionalDiff(langstoreCopy, regionalCopy);

    return new Promise((resolve) => {
      const daUrl = getDaUrl(url);
      const savePromise = saveToDa(diffedMain.innerHTML, daUrl);

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

async function sendForTranslation(sourceHtml, toLang) {
  const body = new FormData();
  body.append('data', sourceHtml);
  body.append('fromlang', 'en');
  body.append('tolang', toLang);

  const opts = { method: 'POST', body };

  const resp = await fetch('https://translate.da.live/translate', opts);
  if (!resp.ok) {
    console.log(resp.status);
    return null;
  }
  const json = await resp.json();
  return json.translated;
}

export async function translateCopy(toLang, url, projectTitle) {
  const sourceHtml = await getHtml(url.source, 'text');
  const translated = await sendForTranslation(sourceHtml, toLang);

  if (translated) {
    return new Promise((resolve) => {
      (() => {
        const parser = new DOMParser();
        const dom = parser.parseFromString(translated, 'text/html');
        const mainInner = dom.querySelector('main').innerHTML;
        const saved = saveToDa(mainInner, getDaUrl(url));

        const timedout = setTimeout(() => {
          url.status = 'timeout';
          resolve('timeout');
        }, DEFAULT_TIMEOUT);

        saved.then((daResp) => {
          clearTimeout(timedout);
          url.status = daResp.ok ? 'success' : 'error';
          if (daResp.ok) {
            saveVersion(url.destination, `${projectTitle} Translated`);
          }
          resolve();
        }).catch(() => {
          clearTimeout(timedout);
          url.status = 'error';
          resolve();
        });
      })();
    });
  }

  url.status = 'error';
  return null;
}
