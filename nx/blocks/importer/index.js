import { saveAllToDa } from '../../utils/daFetch.js';
import { mdToDocDom, docDomToAemHtml } from '../../utils/converters.js';
import { Queue } from '../../public/utils/tree.js';

const parser = new DOMParser();
const FRAGMENT_SELECTOR = 'a[href*="/fragments/"]';

let localUrls;

async function findFragments(pageUrl, text) {
  const dom = parser.parseFromString(text, 'text/html');
  const results = dom.body.querySelectorAll(FRAGMENT_SELECTOR);
  const fragments = [...results].reduce((acc, a) => {
    const href = a.getAttribute('href');

    // Don't add any off-origin fragments
    if (!href.startsWith(pageUrl.origin)) return acc;

    // Convert relative to current project origin
    const url = new URL(href);

    // Check if its already in our URL list
    const found = localUrls.some((existing) => existing.pathname === url.pathname);
    if (found) return acc;

    // Mine the page URL for where to send the fragment
    const { toOrg, toRepo } = pageUrl;

    url.toOrg = toOrg;
    url.toRepo = toRepo;

    acc.push(url);
    return acc;
  }, []);

  localUrls.push(...fragments);
}

export function calculateTime(startTime) {
  const totalTime = Date.now() - startTime;
  return `${String((totalTime / 1000) / 60).substring(0, 4)}`;
}

async function getAemHtml(url, text) {
  const dom = mdToDocDom(text);
  const aemHtml = docDomToAemHtml(dom);
  await findFragments(url, aemHtml);
  return aemHtml;
}

async function importUrl(url) {
  const [fromRepo, fromOrg] = url.hostname.split('.')[0].split('--').slice(1).slice(-2);
  if (!(fromRepo || fromOrg)) {
    url.status = '403';
    url.error = 'URL is not from AEM.';
    return;
  }

  url.fromRepo ??= fromRepo;
  url.fromOrg ??= fromOrg;

  const { pathname, href } = url;

  const isJson = href.endsWith('.json');

  const path = href.endsWith('/') ? `${pathname}index` : pathname;
  const srcPath = isJson ? path : `${path}.md`;
  url.destPath = isJson ? path : `${path}.html`;
  url.editPath = isJson ? path.replace('.json', '') : path;
  url.type = isJson ? 'json' : 'html';

  try {
    const resp = await fetch(`${url.origin}${srcPath}`);
    if (!resp.ok) {
      throw new Error(resp.status);
    }
    const text = await resp.text();
    const content = isJson ? text : await getAemHtml(url, text);

    url.status = await saveAllToDa(url, content);
  } catch (e) {
    url.status = 'error';
  }
}

export async function importAll(urls, requestUpdate) {
  // Reset and re-add URLs
  localUrls = urls;

  const uiUpdater = async (url) => {
    await importUrl(url);
    requestUpdate();
  };

  const queue = new Queue(uiUpdater, 50);

  let notImported;
  while (!notImported || notImported.length > 0) {
    // Check for any non-imported URLs
    notImported = localUrls.filter((url) => !url.status);
    // Wait for the entire import
    await Promise.all(notImported.map((url) => queue.push(url)));
    // Re-check for any non-imported URLs.
    notImported = localUrls.filter((url) => !url.status);
  }
}
