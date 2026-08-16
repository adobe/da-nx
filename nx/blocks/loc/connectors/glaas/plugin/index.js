import { DA_ORIGIN } from '../../../../../public/utils/constants.js';
import { getLivePreviewUrl } from '../../../../../utils/utils.js';
import {
  isEligibleMultimodalImageUrl, parseSelections, writeSelections, mergeSelections, toHref,
  parseAemPageHost, aemPageToPreviewDaLiveUrl,
} from '../imageSelections.js';

function buildSourceUrl({ org, site, path }) {
  return `${DA_ORIGIN}/source/${org}/${site}${path}.html`;
}

export async function fetchPageHtml({ org, site, path, token }) {
  const opts = { headers: { Authorization: `Bearer ${token}` } };
  const resp = await fetch(buildSourceUrl({ org, site, path }), opts);
  if (!resp.ok) return null;
  return resp.text();
}

// DA-internal storage requires the same Bearer token the plugin already uses for the page
// itself - an <img> tag can't send one, so these need fetchAuthenticatedThumbnail below
// instead of being usable as a thumbnail src directly.
const DA_INTERNAL_HOSTS = new Set(['content.da.live', 'admin.da.live']);
function needsAuthenticatedFetch(href) {
  try {
    return DA_INTERNAL_HOSTS.has(new URL(href).hostname);
  } catch {
    return true;
  }
}

// Display-only: fetches the image bytes with the page's own token and hands back an
// object URL an <img> can render. Falls back to the raw href (will 401 as an <img> src,
// same as before this existed) if the fetch fails - never blocks the row from appearing.
async function fetchAuthenticatedThumbnail(href, token) {
  try {
    const resp = await fetch(href, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return null;
    return URL.createObjectURL(await resp.blob());
  } catch {
    return null;
  }
}

async function savePageHtml({ org, site, path, token, html }) {
  const blob = new Blob([html], { type: 'text/html' });
  const body = new FormData();
  body.append('data', blob);
  const opts = { method: 'POST', body, headers: { Authorization: `Bearer ${token}` } };
  const resp = await fetch(buildSourceUrl({ org, site, path }), opts);
  return { ok: resp.ok, status: resp.status };
}

/** One row per <img> found on the page, deduped by normalized src. */
export function buildImageRows(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const selections = parseSelections(doc);
  const seen = new Set();
  const rows = [];
  [...doc.querySelectorAll('img[src]')].forEach((img) => {
    const src = img.getAttribute('src');
    const href = toHref(src) ?? src;
    if (seen.has(href)) return;
    seen.add(href);
    // Display-only: an aem.page thumbnail src needs the preview.da.live cookie to render
    // as an <img>. The row's own `src` (used for marking/writing) is never touched.
    const previewHost = parseAemPageHost(href);
    rows.push({
      src: href,
      thumbnail: previewHost ? aemPageToPreviewDaLiveUrl(href, previewHost) : href,
      previewHost,
      needsAuthenticatedFetch: needsAuthenticatedFetch(href),
      alt: img.getAttribute('alt') || '',
      eligible: isEligibleMultimodalImageUrl(src),
      checked: selections.has(href),
    });
  });
  return rows;
}

// Resolves thumbnails for DA-internal rows in place (see fetchAuthenticatedThumbnail).
// Caller is responsible for triggering a re-render afterward.
export async function resolveAuthenticatedThumbnails(rows, token) {
  await Promise.all(rows.filter((row) => row.needsAuthenticatedFetch).map(async (row) => {
    row.thumbnail = (await fetchAuthenticatedThumbnail(row.src, token)) ?? row.src;
  }));
}

// Plugin-only auth: this iframe never bootstraps the full IMS SDK (unlike the main
// da.live app), so it can't reuse nx/utils/utils.js's livePreviewLogin as-is - that
// one resolves its own token via loadIms(). Reuse the plugin's own DA_SDK token instead.
const thumbnailLogins = new Map();
function gimmeCookie({ org, repo, ref }, token) {
  const key = `${org}/${repo}/${ref}`;
  if (!thumbnailLogins.has(key)) {
    const url = `${getLivePreviewUrl(org, repo, ref)}/gimme_cookie`;
    const opts = { credentials: 'include', headers: { Authorization: `Bearer ${token}` } };
    thumbnailLogins.set(key, fetch(url, opts).then((resp) => resp.ok).catch(() => false));
  }
  return thumbnailLogins.get(key);
}

// Logs into preview.da.live for every distinct aem.page host among rows, so their
// thumbnails (rewritten to preview.da.live) don't 401 once rendered.
export function ensureThumbnailLogins(rows, token) {
  const hosts = new Map();
  rows.forEach((row) => {
    if (row.previewHost) hosts.set(`${row.previewHost.org}/${row.previewHost.repo}/${row.previewHost.ref}`, row.previewHost);
  });
  return Promise.all([...hosts.values()].map((host) => gimmeCookie(host, token)));
}

function toSelectionRows(imageRows) {
  return imageRows.map((row) => ({ src: row.src, translate: row.checked ? 'true' : 'false' }));
}

// Re-fetches before writing so a concurrent change elsewhere survives (see mergeSelections).
export async function saveSelections({
  org, site, path, token, initialRows, currentRows,
}) {
  const latestHtml = await fetchPageHtml({ org, site, path, token });
  if (latestHtml === null) return { error: 'Could not fetch the latest page content.' };

  const latestDoc = new DOMParser().parseFromString(latestHtml, 'text/html');
  const latestSelections = parseSelections(latestDoc);
  const initial = toSelectionRows(initialRows);
  const current = toSelectionRows(currentRows);
  const latest = current.map((row) => ({
    src: row.src,
    translate: latestSelections.has(row.src) ? 'true' : 'false',
  }));

  const merged = mergeSelections(latest, initial, current);
  const updatedHtml = writeSelections(latestDoc, merged);
  return savePageHtml({ org, site, path, token, html: updatedHtml });
}
