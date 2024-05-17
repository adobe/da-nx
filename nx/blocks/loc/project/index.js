import { regionalDiff, removeLocTags } from '../regional-diff/regional-diff.js';
import { daFetch, saveToDa } from '../../../utils/daFetch.js';

const DA_ORIGIN = 'https://admin.da.live';
const DEFAULT_TIMEOUT = 20000; // ms

let projPath;

async function fetchData(path) {
  const resp = await fetch(path);
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

export async function copy(url) {
  const body = new FormData();
  body.append('destination', url.destination);
  const opts = { method: 'POST', body };

  return new Promise((resolve) => {
    (() => {
      const fetched = fetch(`${DA_ORIGIN}/copy${url.source}`, opts);

      const timedout = setTimeout(() => {
        url.status = 'timeout';
        resolve('timeout');
      }, DEFAULT_TIMEOUT);

      fetched.then((resp) => {
        clearTimeout(timedout);
        url.status = resp.ok ? 'success' : 'error';
        if (resp.ok) {
          saveVersion(url.destination, 'Rolled Out');
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

const getHtml = async (url) => {
  const res = await fetch(`${DA_ORIGIN}/source${url}`);
  if (!res.ok) return null;

  const parser = new DOMParser();
  const str = await res.text();
  return parser.parseFromString(collapseWhitespace(str), 'text/html');
};

const getDaUrl = (url) => {
  const [, org, repo, ...path] = url.destination.split('/');
  const pathname = `/${path.join('/').replace('.html', '')}`;
  return { org, repo, pathname };
};

export async function rolloutCopy(url) {
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
    regionalCopy.querySelector('main').innerHTML = diffedMain.innerHTML;

    return new Promise((resolve) => {
      const daUrl = getDaUrl(url);
      const savePromise = saveToDa(regionalCopy.documentElement.outerHTML, daUrl);

      const timedout = setTimeout(() => {
        url.status = 'timeout';
        resolve('timeout');
      }, DEFAULT_TIMEOUT);

      savePromise.then(({ daResp }) => {
        clearTimeout(timedout);
        url.status = daResp.ok ? 'success' : 'error';
        if (daResp.ok) {
          saveVersion(url.destination, 'Rolled Out');
        }
        resolve();
      }).catch(() => {
        clearTimeout(timedout);
        url.status = 'error';
        resolve();
      });
    });
  } catch (e) {
    return copy(url);
  }
}
