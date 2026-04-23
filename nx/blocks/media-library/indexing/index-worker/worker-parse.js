/**
 * Worker-safe version of parse.js functions
 * Extracted verbatim from parse.js, modified ONLY to:
 * - Use worker-fetch.js fetchPageMarkdown instead of admin-api.js
 * - Accept runtime context for isPerfEnabled (no window.location dependency)
 */

// MODIFIED: Use worker-safe fetchPageMarkdown
import { fetchPageMarkdown } from './worker-fetch.js';

import {
  IndexConfig,
  Domains,
  Paths,
} from '../../core/constants.js';
// isPerfEnabled uses window.location - will be passed as parameter
import { getExternalMediaTypeInfo } from '../../core/media.js';
import { getDedupeKey } from '../../core/urls.js';

export { getDedupeKey };

const MD_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/gi;
const MD_AUTOLINK_RE = /<(https?:\/\/[^>]+|\/[^>\s]*)>/g;
const HTML_MEDIA_ATTR_RE = /<(?:img|video|audio|source|iframe)\b[^>]*\b(src|srcset|poster)=["']([^"']+)["'][^>]*>/gi;
const HTML_ANCHOR_RE = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;

// Normalizes path (lowercase, no leading slash, / for dirs).
export function normalizePath(path) {
  if (!path) return '';
  let cleanPath = path.split('?')[0].split('#')[0];
  if (!cleanPath.includes('.') && !cleanPath.startsWith(Paths.MEDIA)) {
    cleanPath = cleanPath === '/' || cleanPath === '' ? '/index.md' : `${cleanPath}.md`;
  }
  return cleanPath;
}

export function isHiddenPath(path) {
  if (!path || typeof path !== 'string') return false;
  return path.includes('/.');
}

function toPath(href) {
  if (!href) return '';
  try {
    if (href.startsWith('http')) {
      return new URL(href).pathname;
    }
    return href.startsWith('/') ? href : `/${href}`;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[MediaIndexer] Failed to parse URL ${href}:`, error.message);
    return href;
  }
}

function extractHtmlMediaUrls(md) {
  return [...md.matchAll(HTML_MEDIA_ATTR_RE)].flatMap((match) => {
    const [, attrName, rawValue] = match;
    if (!rawValue) return [];
    if (attrName.toLowerCase() === 'srcset') {
      return rawValue
        .split(',')
        .map((candidate) => candidate.trim().split(/\s+/)[0])
        .filter(Boolean);
    }
    return [rawValue];
  });
}

function extractHtmlAnchorUrls(html) {
  return [...html.matchAll(HTML_ANCHOR_RE)].map((match) => match[1]).filter(Boolean);
}

function htmlForMediaExtraction(html) {
  if (!html || typeof html !== 'string') return '';
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1];
  }
  return html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, '');
}

function stripMarkdownTitle(target) {
  const trimmed = target.trim();
  if (!trimmed) return '';

  const angleMatch = trimmed.match(/^<([^>]+)>(?:\s+['"].*['"])?$/);
  if (angleMatch) {
    return angleMatch[1].trim();
  }

  const titleMatch = trimmed.match(/^(\S+)(?:\s+['"].*['"])?$/);
  return titleMatch ? titleMatch[1] : trimmed;
}

function hasMalformedEncodedQuotes(target) {
  return /^(?:%5c%22|%22)/i.test(target) || /(?:%5c%22|%22)$/i.test(target);
}

function sanitizeExtractedUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;

  let value = stripMarkdownTitle(rawUrl);
  if (!value || hasMalformedEncodedQuotes(value)) return null;

  value = value.trim().replace(/&amp;/g, '&');

  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith('\'') && value.endsWith('\''))
  ) {
    value = value.slice(1, -1).trim();
  }

  if (!value || value.includes('\n') || value.includes('\r') || value.includes('\t')) {
    return null;
  }

  if (
    value.startsWith('\\"')
    || value.endsWith('\\"')
    || value.startsWith("\\'")
    || value.endsWith("\\'")
  ) {
    return null;
  }

  if (!value.startsWith('http') && !value.startsWith('/')) {
    return null;
  }

  return value;
}

function extractUrlsFromMarkdown(md) {
  if (!md || typeof md !== 'string') return [];
  const candidates = [
    ...[...md.matchAll(MD_LINK_RE)].map((m) => m[1]),
    ...[...md.matchAll(MD_AUTOLINK_RE)].map((m) => m[1]),
    ...extractHtmlMediaUrls(md),
  ];

  return [...new Set(candidates.map(sanitizeExtractedUrl).filter(Boolean))];
}

function extractUrlsFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const scan = htmlForMediaExtraction(html);
  const candidates = [
    ...extractHtmlMediaUrls(scan),
    ...extractHtmlAnchorUrls(scan),
  ];

  return [...new Set(candidates.map(sanitizeExtractedUrl).filter(Boolean))];
}

function extractUrls(content, isHtml = false) {
  return isHtml ? extractUrlsFromHtml(content) : extractUrlsFromMarkdown(content);
}

function isExternalUrl(url) {
  if (!url || !url.startsWith('http')) return false;
  return !Domains.SAME_ORIGIN.some((d) => url.includes(d));
}

export function getExternalMediaType(url) {
  return getExternalMediaTypeInfo(url);
}

export function isExternalMediaUrl(url) {
  return getExternalMediaType(url) !== null;
}

export function extractExternalMediaUrls(content, isHtml = false) {
  if (!content || typeof content !== 'string') return [];
  const urls = extractUrls(content, isHtml);
  return [...new Set(urls.filter((u) => isExternalMediaUrl(u)))];
}

export function extractFragmentReferences(content, isHtml = false) {
  const urls = extractUrls(content, isHtml);
  return [...new Set(urls.filter((u) => u.includes(Paths.FRAGMENTS)).map((u) => toPath(u)))];
}

export function extractLinks(content, pattern, isHtml = false) {
  const urls = extractUrls(content, isHtml);
  const pathPart = (u) => u.split('?')[0].split('#')[0];
  return [...new Set(
    urls
      .filter((u) => pattern.test(pathPart(u)) && !isExternalUrl(u))
      .map((u) => toPath(u)),
  )];
}

/**
 * Extracts regular images and videos from markdown content.
 * Returns paths for internal media (jpg, png, gif, webp, mp4, etc.)
 */
export function extractImageAndVideoUrls(content, isHtml = false) {
  const urls = extractUrls(content, isHtml);
  const pathPart = (u) => u.split('?')[0].split('#')[0];
  // Match image/video extensions (jpg, png, gif, webp, mp4, etc.)
  const mediaPattern = /\.(jpg|jpeg|png|gif|webp|avif|bmp|mp4|webm|mov|avi|m4v)([?#]|$)/i;
  return [...new Set(
    urls
      .filter((u) => mediaPattern.test(pathPart(u)) && !isExternalUrl(u))
      .map((u) => toPath(u)),
  )];
}

/**
 * Worker-safe detectMediaType (from parse.js:187-192)
 */
export function detectMediaType(mediaEntry) {
  const contentType = mediaEntry.contentType || '';
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';
  return 'unknown';
}

/**
 * Worker-safe computeCanonicalMetadata (from parse.js:165-185)
 */
function isHashLikeName(name) {
  if (!name || typeof name !== 'string') return false;
  const basename = name.split('/').pop().split('.')[0];
  return /^[0-9a-f]{40,}$/.test(basename) || /^media_[0-9a-f]{40,}/.test(basename);
}

function extractBestFilename(mediaEntry) {
  if (mediaEntry.originalFilename) {
    const filename = mediaEntry.originalFilename.split('/').pop();
    if (!isHashLikeName(filename)) {
      return decodeURIComponent(filename);
    }
  }
  if (mediaEntry.name && !isHashLikeName(mediaEntry.name)) {
    return mediaEntry.name;
  }
  if (mediaEntry.path) {
    try {
      const url = new URL(mediaEntry.path);
      const filename = url.pathname.split('/').pop();
      if (filename && !isHashLikeName(filename)) {
        return decodeURIComponent(filename);
      }
    } catch {
      const filename = mediaEntry.path.split('/').pop();
      if (filename && !isHashLikeName(filename)) {
        return decodeURIComponent(filename);
      }
    }
  }
  return '';
}

export function computeCanonicalMetadata(mediaEntry, existingMetadata = null) {
  const isIngest = mediaEntry.operation === 'ingest';
  const filename = mediaEntry.originalFilename?.split('/').pop();
  const hasOriginalFilename = filename && !isHashLikeName(filename);

  let modifiedTimestamp = null;
  if (isIngest) {
    modifiedTimestamp = mediaEntry.modifiedTimestamp || mediaEntry.timestamp;
  } else if (existingMetadata?.modifiedTimestamp) {
    modifiedTimestamp = existingMetadata.modifiedTimestamp;
  }

  return {
    displayName: isIngest && hasOriginalFilename
      ? extractBestFilename(mediaEntry)
      : existingMetadata?.displayName || extractBestFilename(mediaEntry),
    modifiedTimestamp,
  };
}

// Runs fn over items with concurrency limit; returns results in order.
export async function processConcurrently(items, fn, concurrency) {
  const results = [];
  const executing = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const promise = Promise.resolve().then(() => fn(item, i));
    results.push(promise);

    if (concurrency <= items.length) {
      const executingPromise = promise.then(() => {
        executing.splice(executing.indexOf(executingPromise), 1);
      });
      executing.push(executingPromise);

      if (executing.length >= concurrency) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.race(executing);
      }
    }
  }

  await Promise.all(results);
  return Promise.all(results);
}

/**
 * Worker-safe version of buildUsageMap from parse.js:419-585
 * Extracted verbatim, modified ONLY to:
 * - Use worker-safe fetchPageMarkdown (imported from worker-fetch.js)
 * - Accept isPerfEnabled as context parameter (no window.location dependency)
 *
 * @param {Array} pageEntries - Page entries
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} ref - Reference (branch)
 * @param {Function} onProgress - Progress callback
 * @param {Function} onBatch - Batch completion callback
 * @param {object} context - Worker runtime context
 * @param {string} context.daEtcOrigin - DA ETC origin for CORS proxy (REQUIRED)
 * @param {string} context.siteToken - Site token for protected sites
 * @param {boolean} context.isPerfEnabled - Enable perf logging
 */
export async function buildUsageMap(
  pageEntries,
  org,
  repo,
  ref,
  onProgress,
  onBatch = null,
  context = {},
) {
  const { daEtcOrigin, siteToken, isPerfEnabled = false } = context;

  if (!daEtcOrigin) {
    throw new Error('[worker-parse] daEtcOrigin is required in context for buildUsageMap');
  }

  const usageMap = {
    fragments: new Map(),
    pdfs: new Map(),
    svgs: new Map(),
    images: new Map(), // Regular images and videos from markdown
    externalMedia: new Map(),
  };

  const pagesByPath = new Map();
  pageEntries.forEach((e) => {
    const p = normalizePath(e.path);
    if (!pagesByPath.has(p)) pagesByPath.set(p, []);
    pagesByPath.get(p).push(e);
  });
  pagesByPath.forEach((events) => {
    events.sort((a, b) => b.timestamp - a.timestamp);
  });

  const getLatestPageTimestamp = (path) => {
    const events = pagesByPath.get(path);
    return events?.[0]?.timestamp ?? 0;
  };

  const uniquePages = [...pagesByPath.keys()].filter((p) => !isHiddenPath(p));

  const usageMapStartTime = Date.now();

  const counters = { success: 0, fail: 0, parsed: 0, htmlFallback: 0 };
  const batchSize = IndexConfig.USAGE_MAP_PROGRESSIVE_BATCH_SIZE ?? 2000;
  const retryConcurrency = Math.max(
    1,
    Math.min(2, IndexConfig.MAX_CONCURRENT_PAGE_FETCHES ?? 1),
  );
  const failureReasons = new Map(); // reason -> count
  const failedPathsByReason = new Map(); // reason -> path[]

  const processResultIntoUsageMap = ({ normalizedPath, md, isHtml = false }) => {
    if (!md) return;
    const fragments = extractFragmentReferences(md, isHtml);
    const pdfs = extractLinks(md, /\.pdf$/, isHtml);
    const svgs = extractLinks(md, /\.svg$/, isHtml);
    const images = extractImageAndVideoUrls(md, isHtml);
    const externalUrls = extractExternalMediaUrls(md, isHtml);
    const addToMap = (map, path) => {
      if (!map.has(path)) map.set(path, []);
      if (!map.get(path).includes(normalizedPath)) {
        map.get(path).push(normalizedPath);
      }
    };
    const addToExternalMedia = (url) => {
      const pageTs = getLatestPageTimestamp(normalizedPath);
      const existing = usageMap.externalMedia.get(url);
      if (!existing) {
        usageMap.externalMedia.set(url, {
          pages: [normalizedPath],
          firstDiscoveredTimestamp: pageTs,
        });
      } else if (!existing.pages.includes(normalizedPath)) {
        existing.pages.push(normalizedPath);
        existing.firstDiscoveredTimestamp = Math.min(existing.firstDiscoveredTimestamp, pageTs);
      }
    };
    fragments.forEach((f) => addToMap(usageMap.fragments, f));
    pdfs.forEach((p) => addToMap(usageMap.pdfs, p));
    svgs.forEach((s) => addToMap(usageMap.svgs, s));
    images.forEach((i) => addToMap(usageMap.images, i));
    externalUrls.forEach((u) => addToExternalMedia(u));
  };

  for (let batchStart = 0; batchStart < uniquePages.length; batchStart += batchSize) {
    const batch = uniquePages.slice(batchStart, batchStart + batchSize);
    const batchResults = await processConcurrently(
      batch,
      async (normalizedPath, i) => {
        const globalIndex = batchStart + i;
        onProgress?.({ message: `Parsing page ${globalIndex + 1}/${uniquePages.length}: ${normalizedPath}` });
        // MODIFIED: Pass daEtcOrigin and siteToken to worker-safe fetchPageMarkdown
        const result = await fetchPageMarkdown(
          normalizedPath,
          org,
          repo,
          daEtcOrigin,
          ref,
          siteToken,
        );

        const md = result?.markdown !== undefined ? result.markdown : null;
        const html = result?.html || null;
        const wasSuccessful = result?.status === 200;

        if (md !== null) {
          counters.success += 1;
        } else if (html) {
          counters.success += 1;
          counters.htmlFallback += 1;
        } else if (wasSuccessful) {
          // HTTP 200 but no markdown/html (empty page or unexpected format)
          counters.success += 1;
        } else {
          counters.fail += 1;
          const reason = result?.reason || `HTTP ${result?.status || 'unknown'}`;
          const count = failureReasons.get(reason) || 0;
          failureReasons.set(reason, count + 1);
          if (!failedPathsByReason.has(reason)) failedPathsByReason.set(reason, []);
          failedPathsByReason.get(reason).push(normalizedPath);
        }
        counters.parsed += 1;
        return { normalizedPath, md: md || html || '', isHtml: !!html };
      },
      IndexConfig.MAX_CONCURRENT_PAGE_FETCHES,
    );

    batchResults.forEach(processResultIntoUsageMap);

    // Call onBatch after each batch (natural ~100s timing with 1000-page batches)
    if (onBatch) {
      onBatch(usageMap);
    }
  }

  /* Retry failed pages with a very small pool to avoid a long serial tail. */
  const allFailedPaths = [];
  failedPathsByReason.forEach((paths) => allFailedPaths.push(...paths));
  if (allFailedPaths.length > 0) {
    onProgress?.({ message: `Retrying ${allFailedPaths.length} failed pages...` });
    const retryResults = await processConcurrently(
      allFailedPaths,
      async (normalizedPath) => {
        // MODIFIED: Pass daEtcOrigin and siteToken to worker-safe fetchPageMarkdown
        const result = await fetchPageMarkdown(
          normalizedPath,
          org,
          repo,
          daEtcOrigin,
          ref,
          siteToken,
        );
        const md = result?.markdown !== undefined ? result.markdown : null;
        const html = result?.html || null;
        const wasSuccessful = result?.status === 200;
        return { normalizedPath, md: md || html || '', isHtml: !!html, wasSuccessful };
      },
      retryConcurrency,
    );
    retryResults.forEach(processResultIntoUsageMap);
    retryResults.forEach(({ md, wasSuccessful }) => {
      if (md || wasSuccessful) {
        counters.success += 1;
        counters.fail -= 1;
      }
    });
    /* Remove recovered paths from failedPathsByReason and failureReasons */
    const recovered = new Set(
      retryResults.filter((r) => r.md || r.wasSuccessful).map((r) => r.normalizedPath),
    );
    if (recovered.size > 0) {
      failedPathsByReason.forEach((paths, reason) => {
        const remaining = paths.filter((p) => !recovered.has(p));
        if (remaining.length === 0) {
          failedPathsByReason.delete(reason);
          failureReasons.delete(reason);
        } else {
          failedPathsByReason.set(reason, remaining);
          failureReasons.set(reason, remaining.length);
        }
      });
    }
  }

  const durationMs = Date.now() - usageMapStartTime;
  const fragCount = usageMap.fragments?.size ?? 0;
  const pdfCount = usageMap.pdfs?.size ?? 0;
  const svgCount = usageMap.svgs?.size ?? 0;
  const extCount = usageMap.externalMedia?.size ?? 0;

  // MODIFIED: Use isPerfEnabled from context instead of isPerfEnabled()
  if (isPerfEnabled) {
    // eslint-disable-next-line no-console
    console.log(
      `[buildUsageMap] ${Math.round(durationMs / 1000)}s | pages ${counters.success}/${uniquePages.length} | `
      + `items frag=${fragCount} pdf=${pdfCount} svg=${svgCount} ext=${extCount}`,
    );
  }

  return usageMap;
}
