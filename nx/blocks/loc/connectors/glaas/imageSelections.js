import getElementMetadata from '../../../../../nx2/utils/getElementMetadata.js';
import { getLivePreviewUrl, livePreviewLogin } from '../../../../utils/utils.js';

export const LOC_IMAGES_KEY = 'loc-images';
export const DA_METADATA_SELECTOR = 'body > .da-metadata';
const ELIGIBLE_IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg']);
const AEM_PAGE_SUFFIX = '.aem.page';
const ELIGIBLE_IMAGE_HOSTS = new Set(['content.da.live']);
const ELIGIBLE_IMAGE_HOST_SUFFIXES = ['.aem.live', '.aem.page'];

function isEligibleImageHost(hostname) {
  return ELIGIBLE_IMAGE_HOSTS.has(hostname)
    || ELIGIBLE_IMAGE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

export function toHref(src) {
  try {
    return new URL(src).href;
  } catch {
    return undefined;
  }
}

function parseHtml(htmlOrDoc) {
  return typeof htmlOrDoc === 'string'
    ? new DOMParser().parseFromString(htmlOrDoc, 'text/html')
    : htmlOrDoc;
}

function rowKey(row) {
  return row.children?.[0]?.textContent?.trim().toLowerCase();
}

export function findMetadataRow(daMetadata) {
  if (!daMetadata) return null;
  return [...daMetadata.children].find((row) => rowKey(row) === LOC_IMAGES_KEY) || null;
}

export function isEligibleMultimodalImageUrl(src) {
  if (!src) return false;
  try {
    const url = new URL(src);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (!isEligibleImageHost(url.hostname)) return false;
    const pathname = decodeURIComponent(url.pathname);
    const filename = pathname.split('/').pop() ?? '';
    const dot = filename.lastIndexOf('.');
    if (dot === -1) return false;
    return ELIGIBLE_IMAGE_EXTS.has(filename.slice(dot + 1).toLowerCase());
  } catch {
    return false;
  }
}

/** {ref}--{repo}--{org} from an aem.page hostname, or null if it isn't one. */
export function parseAemPageHost(href) {
  try {
    const { hostname } = new URL(href);
    if (!hostname.endsWith(AEM_PAGE_SUFFIX)) return null;
    const [ref, repo, org] = hostname.slice(0, -AEM_PAGE_SUFFIX.length).split('--');
    return (ref && repo && org) ? { ref, repo, org } : null;
  } catch {
    return null;
  }
}

/** aem.page -> same path on preview.da.live (Helix-auth-gated). Fetch-only, never persisted. */
export function aemPageToPreviewDaLiveUrl(imageUrl, { ref, repo, org }) {
  const url = new URL(imageUrl);
  return `${getLivePreviewUrl(org, repo, ref)}${url.pathname}${url.search}`;
}

// Memoized per {org}/{repo}/{ref} so concurrent callers share one cookie exchange.
const livePreviewLogins = new Map();
export function ensureLivePreviewLogin({ org, repo, ref }) {
  const key = `${org}/${repo}/${ref}`;
  if (!livePreviewLogins.has(key)) livePreviewLogins.set(key, livePreviewLogin(org, repo, ref));
  return livePreviewLogins.get(key);
}

// Accepts an HTML string or an already-parsed Document (skips re-parsing when the caller has one).
export function parseSelections(htmlOrDoc) {
  const selections = new Set();
  const doc = parseHtml(htmlOrDoc);
  const daMetadata = doc.querySelector(DA_METADATA_SELECTOR);
  // .content is the raw value node - unlike .text, it isn't lowercased.
  const metadata = getElementMetadata(daMetadata)[LOC_IMAGES_KEY];
  if (!metadata) return selections;

  let rows;
  try {
    rows = JSON.parse(metadata.content.textContent);
  } catch {
    return selections;
  }
  if (!Array.isArray(rows)) return selections;

  rows.forEach((entry) => {
    if (entry?.translate !== 'true' || !entry?.src) return;
    const href = toHref(entry.src);
    if (href) selections.add(href);
  });
  return selections;
}

// Accepts an HTML string or an already-parsed Document. Empty rows removes the row
// (and block, if now empty) rather than writing a stale `[]`.
export function writeSelections(htmlOrDoc, rows) {
  const doc = parseHtml(htmlOrDoc);
  let daMetadata = doc.querySelector(DA_METADATA_SELECTOR);

  if (!rows.length) {
    findMetadataRow(daMetadata)?.remove();
    if (daMetadata && !daMetadata.children.length) daMetadata.remove();
    return doc.documentElement.outerHTML;
  }

  if (!daMetadata) {
    daMetadata = doc.createElement('div');
    daMetadata.className = 'da-metadata';
    doc.body.append(daMetadata);
  }

  let row = findMetadataRow(daMetadata);
  if (!row) {
    const keyEl = doc.createElement('div');
    keyEl.textContent = LOC_IMAGES_KEY;
    const valueEl = doc.createElement('div');
    row = doc.createElement('div');
    row.append(keyEl, valueEl);
    daMetadata.append(row);
  }

  row.children[1].textContent = JSON.stringify(rows);
  return doc.documentElement.outerHTML;
}

// Applies only this session's changes onto a fresh latestRows read, and drops rows no longer live.
export function mergeSelections(latestRows, initialRows, currentRows) {
  const toMap = (rows) => new Map(rows.map((row) => [row.src, row.translate]));
  const latestMap = toMap(latestRows);
  const initialMap = toMap(initialRows);
  const currentMap = toMap(currentRows);

  [...latestMap.keys()].forEach((src) => {
    if (!currentMap.has(src)) latestMap.delete(src);
  });

  currentMap.forEach((translate, src) => {
    const initialTranslate = initialMap.get(src) ?? 'false';
    if (initialTranslate === translate) return;
    if (translate === 'true') {
      latestMap.set(src, translate);
    } else {
      latestMap.delete(src);
    }
  });

  return [...latestMap.entries()]
    .filter(([, translate]) => translate === 'true')
    .map(([src, translate]) => ({ src, translate }));
}
