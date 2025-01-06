import { DA_ORIGIN } from '../../public/utils/constants.js';
import { replaceHtml, daFetch } from '../../utils/daFetch.js';
import { mdToDocDom, docDomToAemHtml } from '../../utils/converters.js';
import { Queue } from '../../public/utils/tree.js';

const parser = new DOMParser();
const FRAGMENT_SELECTOR = 'a[href*="/fragments/"]';
const EXTS = ['json', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'mp4', 'pdf'];

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
  return aemHtml;
}

function replaceLinks(html, fromOrg, fromRepo) {
  return html;
}

async function saveAllToDa(url, blob) {
  const { toOrg, toRepo, destPath, editPath, route } = url;

  url.daHref = `https://da.live${route}#/${toOrg}/${toRepo}${editPath}`;

  const body = new FormData();
  body.append('data', blob);
  const opts = { method: 'PUT', body };

  try {
    const resp = await daFetch(`${DA_ORIGIN}/source/${toOrg}/${toRepo}${destPath}`, opts);
    return resp.status;
  } catch {
    console.log(`Couldn't save ${destPath}`);
    return 500;
  }
}

async function importUrl(url, findFragmentsFlag, setProcessed) {
  const [fromRepo, fromOrg] = url.hostname.split('.')[0].split('--').slice(1).slice(-2);
  if (!(fromRepo || fromOrg)) {
    url.status = '403';
    url.error = 'URL is not from AEM.';
    return;
  }

  url.fromRepo ??= fromRepo;
  url.fromOrg ??= fromOrg;

  const { pathname, href } = url;
  if (href.endsWith('.xml') || href.endsWith('.html')) {
    url.status = 'error';
    url.error = 'DA does not support XML or raw HTML.';
    return;
  }

  const isExt = EXTS.some((ext) => href.endsWith(`.${ext}`));
  const path = href.endsWith('/') ? `${pathname}index` : pathname;
  const srcPath = isExt ? path : `${path}.md`;
  url.destPath = isExt ? path : `${path}.html`;
  url.editPath = href.endsWith('.json') ? path.replace('.json', '') : path;

  if (isExt) {
    url.route = url.destPath.endsWith('json') ? '/sheet' : '/media';
  } else {
    url.route = '/edit';
  }

  try {
    const resp = await fetch(`${url.origin}${srcPath}`);
    if (resp.redirected && !srcPath.endsWith('.mp4')) {
      url.status = 'redir';
      throw new Error('redir');
    }
    if (!resp.ok && resp.status !== 304) {
      url.status = 'error';
      throw new Error('error');
    }
    let content = isExt ? await resp.blob() : await resp.text();
    if (!isExt) {
      const aemHtml = await getAemHtml(url, content);
      if (findFragmentsFlag) await findFragments(url, aemHtml);
      let html = replaceHtml(aemHtml, url.fromOrg, url.fromRepo);
      html = replaceLinks(html, url.fromOrg, url.fromRepo);
      content = new Blob([html], { type: 'text/html' });
    }

    url.status = await saveAllToDa(url, content);
    setProcessed();
  } catch (e) {
    if (!url.status) url.status = 'error';
    // Do nothing
  }
}

export async function importAll(urls, findFragmentsFlag, setProcessed, requestUpdate) {
  // Reset and re-add URLs
  localUrls = urls;

  const uiUpdater = async (url) => {
    await importUrl(url, findFragmentsFlag, setProcessed);
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
