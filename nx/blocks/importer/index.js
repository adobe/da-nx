import { replaceHtml, initIms } from '../../utils/daFetch.js';
import { isHlx6, source } from '../../../nx2/utils/api.js';
import { mdToDocDom, docDomToAemHtml } from '../../utils/converters.js';
import { Queue } from '../../public/utils/tree.js';

const parser = new DOMParser();
const EXTS = ['json', 'svg', 'png', 'jpg', 'jpeg', 'gif', 'mp4', 'pdf'];

// Site token cache to avoid repeated token exchanges
const aemSiteTokenCache = new Map();

function getAemSiteTokenCacheKey(org, site, ref = 'main') {
  return `${org}/${site}/${ref}`;
}

function getCachedAemSiteToken(org, site, ref = 'main') {
  const key = getAemSiteTokenCacheKey(org, site, ref);
  const cached = aemSiteTokenCache.get(key);
  if (!cached || cached.promise) return null;
  // Check if token is expired (within 60 seconds of expiry)
  if (cached.siteTokenExpiry && cached.siteTokenExpiry <= Date.now() + 60_000) {
    aemSiteTokenCache.delete(key);
    return null;
  }
  return cached.siteToken ? cached : null;
}

function clearCachedAemSiteToken(org, site, ref = 'main') {
  aemSiteTokenCache.delete(getAemSiteTokenCacheKey(org, site, ref));
}

async function fetchAemSiteToken(org, site, ref = 'main') {
  const { accessToken } = await initIms() || {};
  const imsToken = accessToken?.token;
  if (!imsToken) {
    return { error: 'Missing IMS access token' };
  }

  const body = JSON.stringify({
    org,
    site,
    ref,
    accessToken: imsToken,
  });

  const resp = await fetch('https://admin.hlx.page/auth/adobe/exchange', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  });

  if (!resp.ok) {
    return { error: `Error fetch AEM Site Token ${resp.status}` };
  }

  const data = await resp.json();
  const siteToken = data.siteToken || data.token;
  const siteTokenExpiry = data.siteTokenExpiry || data.tokenExpiry || 0;

  if (!siteToken) {
    return { error: 'AEM Site Token missing from exchange response' };
  }

  return { siteToken, siteTokenExpiry };
}

// IIFE for request deduplication and caching
const getAemSiteToken = (() => {
  const loadToken = async (org, site, ref = 'main') => {
    const result = await fetchAemSiteToken(org, site, ref);
    if (result?.siteToken) {
      aemSiteTokenCache.set(getAemSiteTokenCacheKey(org, site, ref), result);
      return result;
    }
    clearCachedAemSiteToken(org, site, ref);
    return result;
  };

  return ({ org, site, ref = 'main' }) => {
    const key = getAemSiteTokenCacheKey(org, site, ref);
    const cached = getCachedAemSiteToken(org, site, ref);
    if (cached) return Promise.resolve(cached);

    // Check if there's already a pending request
    const pending = aemSiteTokenCache.get(key);
    if (pending?.promise) return pending.promise;

    // Create new request
    const promise = loadToken(org, site, ref)
      .catch((error) => {
        clearCachedAemSiteToken(org, site, ref);
        throw error;
      });
    aemSiteTokenCache.set(key, { promise });
    return promise;
  };
})();

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

export async function getOptions(org, repo, ref = 'main') {
  // Try to get cached site token first
  const cached = getCachedAemSiteToken(org, repo, ref);
  if (cached?.siteToken) {
    return { headers: { Authorization: `token ${cached.siteToken}` } };
  }

  // Fetch new site token
  const result = await getAemSiteToken({ org, site: repo, ref });
  if (result?.siteToken) {
    return { headers: { Authorization: `token ${result.siteToken}` } };
  }

  // Fallback to IMS token if site token exchange fails
  const { accessToken } = await initIms() || {};
  const imsToken = accessToken?.token;
  if (imsToken) {
    return { headers: { Authorization: `Bearer ${imsToken}` } };
  }

  // No token available
  return { headers: {} };
}

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

function replaceLinks(html) {
  return html;
}

async function saveAllToDa(url, blob) {
  const { toOrg, toRepo, destPath, editPath, route } = url;

  url.daHref = `https://da.live${route}#/${toOrg}/${toRepo}${editPath}`;

  // Convert underscores to hyphens
  const formattedPath = destPath.replaceAll('media_', 'media-');

  const body = blob;

  try {
    const resp = await source.save({ org: toOrg, site: toRepo, path: formattedPath, body });
    return resp.status;
  } catch {
    // eslint-disable-next-line no-console
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
  let srcPath;
  if (pathname.endsWith('.json')) {
    srcPath = `${pathname}${url.search}`;
  } else {
    srcPath = isExt ? path : `${path}.md`;
  }
  url.destPath = isExt ? path : `${path}.html`;
  url.editPath = href.endsWith('.json') ? path.replace('.json', '') : path;

  if (isExt) {
    url.route = url.destPath.endsWith('json') ? '/sheet' : '/media';
  } else {
    url.route = '/edit';
  }

  try {
    // Use SOURCE org/repo for authentication (where we're fetching FROM)
    const opts = await getOptions(url.fromOrg, url.fromRepo);
    const proxyUrl = `https://da-etc.adobeaem.workers.dev/cors?url=${encodeURIComponent(`${url.origin}${srcPath}`)}`;
    let resp = await fetch(proxyUrl, opts);

    // Retry on 401/403 with fresh token
    if ((resp.status === 401 || resp.status === 403) && url.fromOrg && url.fromRepo) {
      clearCachedAemSiteToken(url.fromOrg, url.fromRepo);
      const freshOpts = await getOptions(url.fromOrg, url.fromRepo);
      resp = await fetch(proxyUrl, freshOpts);
    }

    if (resp.redirected && !(srcPath.endsWith('.mp4') || srcPath.endsWith('.png') || srcPath.endsWith('.jpg'))) {
      url.status = 'redir';
      throw new Error('redir');
    }
    if (!resp.ok && resp.status !== 304) {
      url.status = resp.status;
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

  const { toOrg, toRepo } = urls[0];
  const hlx6 = await isHlx6(toOrg, toRepo);

  const uiUpdater = async (url) => {
    await importUrl(url, findFragmentsFlag, liveDomain, setProcessed);
    requestUpdate();
  };

  const conf = {
    concurrent: hlx6 ? 5 : 50,
    throttle: hlx6 ? 200 : undefined,
  };

  const queue = new Queue(uiUpdater, conf.concurrent, null, conf.throttle);

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
