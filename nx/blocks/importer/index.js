import { DA_ORIGIN } from '../../public/utils/constants.js';
import { replaceHtml, daFetch } from '../../utils/daFetch.js';
import { mdToDocDom, docDomToAemHtml } from '../../utils/converters.js';
import { Queue } from '../../public/utils/tree.js';

const parser = new DOMParser();
const EXTS = ['json', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'mp4', 'pdf'];

const LINK_SELECTORS = [
  'a[href*="/fragments/"]',
  'a[href*=".mp4"]',
  'a[href*=".pdf"]',
  'a[href*=".svg"]',
  'img[alt*=".mp4"]',
];
// For any case where we need to find SVGs outside of any elements // in their text.
const LINK_SELECTOR_REGEX = /https:\/\/[^"'\s]+\.svg/g;

let localUrls;

async function findFragments(pageUrl, text, liveDomain) {
  // Determine commmon prefixes
  const aemLessOrigin = pageUrl.origin.split('.')[0];
  const prefixes = [aemLessOrigin];
  if (liveDomain) prefixes.push(liveDomain);

  const dom = parser.parseFromString(text, 'text/html');
  const results = dom.body.querySelectorAll(LINK_SELECTORS.join(', '));
  const matches = text.match(LINK_SELECTOR_REGEX)?.map((svgUrl) => {
    const a = window.document.createElement('a');
    a.href = svgUrl;
    return a;
  }) || [];

  const linkedImports = [...results, ...matches].reduce((acc, a) => {
    let href = a.getAttribute('href') || a.getAttribute('alt');

    // Normalize all links to aem
    href = href.replace('.hlx.', '.aem.');

    // Don't add any off origin content.
    const isSameDomain = prefixes.some((prefix) => href.startsWith(prefix));
    if (!isSameDomain) return acc;

    [href] = href.match(/^[^?#| ]+/);

    // Convert relative to current project origin
    const url = new URL(href);

    // Check if its already in our URL list
    const found = localUrls.some((existing) => existing.pathname === url.pathname);
    if (found) return acc;

    // Mine the page URL for where to send the file
    const { toOrg, toRepo } = pageUrl;

    url.toOrg = toOrg;
    url.toRepo = toRepo;

    acc.push(url);
    return acc;
  }, []);

  localUrls.push(...linkedImports);
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

function replaceLinks(html, fromOrg, fromRepo, liveDomain) {
  return html;
}

async function saveAllToDa(url, blob) {
  const { toOrg, toRepo, destPath, editPath, route } = url;

  url.daHref = `https://da.live${route}#/${toOrg}/${toRepo}${editPath}`;

  const body = new FormData();
  body.append('data', blob);
  const opts = { method: 'PUT', body };

  // Convert underscores to hyphens
  const formattedPath = destPath.replaceAll('media_', 'media-');

  try {
    const resp = await daFetch(`${DA_ORIGIN}/source/${toOrg}/${toRepo}${formattedPath}`, opts);
    return resp.status;
  } catch {
    console.log(`Couldn't save ${destPath}`);
    return 500;
  }
}

async function importUrl(url, findFragmentsFlag, liveDomain, setProcessed) {
  const [fromRepo, fromOrg] = url.hostname.split('.')[0].split('--').slice(1).slice(-2);
  if (!(fromRepo || fromOrg)) {
    if (!(liveDomain && url.origin.startsWith(liveDomain))) {
      url.status = '403';
      url.error = 'URL is not from AEM.';
      return;
    }
  }

  url.fromRepo ??= fromRepo;
  url.fromOrg ??= fromOrg;

  const { pathname, href } = url;
  if (href.endsWith('.xml') || href.endsWith('.html') || href.includes('query-index')) {
    url.status = 'error';
    url.error = 'DA does not support XML, HTML, or query index files.';
    return;
  }

  const isExt = EXTS.some((ext) => pathname.endsWith(`.${ext}`));
  const path = href.endsWith('/') ? `${pathname}index` : pathname;
  const srcPath = pathname.endsWith('.json') ? `${pathname}${url.search}` : (isExt ? path : `${path}.md`);
  url.destPath = isExt ? path : `${path}.html`;
  url.editPath = href.endsWith('.json') ? path.replace('.json', '') : path;

  if (isExt) {
    url.route = url.destPath.endsWith('json') ? '/sheet' : '/media';
  } else {
    url.route = '/edit';
  }

  try {
    const resp = await fetch(`${url.origin}${srcPath}`);
    if (resp.redirected && !(srcPath.endsWith('.mp4') || srcPath.endsWith('.png') || srcPath.endsWith('.jpg'))) {
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
      if (findFragmentsFlag) await findFragments(url, aemHtml, liveDomain);
      let html = replaceHtml(aemHtml, url.fromOrg, url.fromRepo);
      html = replaceLinks(html, url.fromOrg, url.fromRepo, liveDomain);
      content = new Blob([html], { type: 'text/html' });
    }

    url.status = await saveAllToDa(url, content);
    setProcessed();
  } catch (e) {
    if (!url.status) url.status = 'error';
    // Do nothing
  }
}

export async function importAll(urls, findFragmentsFlag, liveDomain, setProcessed, requestUpdate) {
  // Reset and re-add URLs
  localUrls = urls;

  const uiUpdater = async (url) => {
    await importUrl(url, findFragmentsFlag, liveDomain, setProcessed);
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
