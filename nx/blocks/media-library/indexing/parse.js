import {
  IndexConfig,
  Domains,
  Operation,
  Paths,
  MediaType,
} from '../core/constants.js';
import { getExternalMediaTypeInfo, normalizeExternalVideoUrl } from '../core/media.js';
import { getDedupeKey, canonicalizeMediaUrl } from '../core/urls.js';

// Lazy-load admin-api.js and params.js to avoid triggering window.location in worker context
// (admin-api.js → daFetch.js → public/utils/constants.js → window.location)
// (params.js → isPerfEnabled uses window.location)
// Only buildUsageMap needs these, and worker uses worker-parse.js's buildUsageMap instead
let fetchPageMarkdown;
let isPerfEnabled;

async function getFetchPageMarkdown() {
  if (!fetchPageMarkdown) {
    const module = await import('./admin-api.js');
    fetchPageMarkdown = module.fetchPageMarkdown;
  }
  return fetchPageMarkdown;
}

async function getIsPerfEnabled() {
  if (!isPerfEnabled) {
    const module = await import('../core/params.js');
    isPerfEnabled = module.isPerfEnabled;
  }
  return isPerfEnabled;
}

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

export function isPage(path) {
  if (!path || typeof path !== 'string') return false;
  return (path.endsWith('.md')
          || (!path.includes('.') && !path.startsWith(Paths.MEDIA)));
}

export function isFragment(path) {
  if (!path || typeof path !== 'string') return false;
  return path.includes(Paths.FRAGMENTS) && !path.includes('.');
}

export function isHiddenPath(path) {
  if (!path || typeof path !== 'string') return false;
  return path.includes('/.');
}

export function extractName(mediaEntry) {
  if (!mediaEntry) return '';
  let filename = '';
  if (mediaEntry.originalFilename) {
    filename = mediaEntry.originalFilename.split('/').pop();
  } else if (mediaEntry.path) {
    filename = mediaEntry.path.split('?')[0].split('#')[0].split('/').pop();
  } else {
    return '';
  }

  try {
    return decodeURIComponent(filename);
  } catch {
    return filename;
  }
}

export function isHashLikeName(name) {
  if (!name) return false;
  const basename = name.split('/').pop();
  return /^media_[a-f0-9]+\./i.test(basename);
}

export function extractBestFilename(mediaEntry) {
  // 1. Prefer non-hash originalFilename
  if (mediaEntry.originalFilename) {
    const filename = mediaEntry.originalFilename.split('/').pop();
    if (!isHashLikeName(filename)) {
      return decodeURIComponent(filename);
    }
  }

  // 2. Prefer non-hash name field
  if (mediaEntry.name && !isHashLikeName(mediaEntry.name)) {
    return mediaEntry.name;
  }

  // 3. Extract non-hash filename from path
  if (mediaEntry.path) {
    const filename = mediaEntry.path.split('?')[0].split('#')[0].split('/').pop();
    const decoded = decodeURIComponent(filename);
    if (!isHashLikeName(decoded)) return decoded;
  }

  // 4. Fallback: return hash-like name/path filename instead of 'unknown'
  if (mediaEntry.name) return mediaEntry.name;

  if (mediaEntry.path) {
    const filename = mediaEntry.path.split('?')[0].split('#')[0].split('/').pop();
    return decodeURIComponent(filename);
  }

  return 'unknown';
}

/**
 * Computes canonical modifiedTimestamp from all medialog entries for a hash.
 * Logic:
 * 1. Prefer ingest entry's modifiedTimestamp (if > 0)
 * 2. Else use ingest entry's timestamp (if > 0)
 * 3. Else use oldest reuse entry's timestamp (closest to actual ingest time)
 * 4. Else use 0
 */
export function computeCanonicalModifiedTimestamp(allEntriesForHash) {
  if (!allEntriesForHash || allEntriesForHash.length === 0) {
    return 0;
  }

  // Find ingest entry
  const ingestEntry = allEntriesForHash.find((e) => e.operation === 'ingest');

  // Find all reuse entries and get oldest timestamp
  const reuseEntries = allEntriesForHash.filter((e) => e.operation === 'reuse');
  const oldestReuseTimestamp = reuseEntries.length > 0
    ? Math.min(...reuseEntries.map((e) => e.timestamp || 0))
    : 0;

  // Apply fallback logic
  if (ingestEntry) {
    // Prefer ingest's modifiedTimestamp (asset's actual modified time from HTTP HEAD)
    if (ingestEntry.modifiedTimestamp && ingestEntry.modifiedTimestamp > 0) {
      return ingestEntry.modifiedTimestamp;
    }
    // Else use ingest's timestamp (upload time)
    if (ingestEntry.timestamp && ingestEntry.timestamp > 0) {
      return ingestEntry.timestamp;
    }
  }

  // No ingest or ingest timestamp is 0 → use oldest reuse timestamp
  if (oldestReuseTimestamp > 0) {
    return oldestReuseTimestamp;
  }

  return 0;
}

export function computeCanonicalMetadata(mediaEntry, existingMetadata = null) {
  const isIngest = mediaEntry.operation === 'ingest';
  const filename = mediaEntry.originalFilename?.split('/').pop();
  const hasOriginalFilename = filename && !isHashLikeName(filename);

  let modifiedTimestamp = null;
  if (isIngest) {
    // Use ingest's modifiedTimestamp (asset's actual modified time)
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

export function detectMediaType(mediaEntry) {
  const contentType = mediaEntry.contentType || '';
  if (contentType.startsWith('image/')) return MediaType.IMAGE;
  if (contentType.startsWith('video/')) return MediaType.VIDEO;
  return 'unknown';
}

/**
 * Factory function to create standardized medialog index entries.
 * Centralizes entry creation logic to ensure consistency across the codebase.
 */
export function createMedialogEntry(media, options = {}) {
  const {
    doc = '',
    existingMeta = null,
    org,
    repo,
    canonicalModifiedTimestamp = null,
  } = options;

  const url = canonicalizeMediaUrl(media.path, org, repo);
  const dedupeKey = getDedupeKey(url);
  const hash = media.mediaHash || dedupeKey;
  const canonical = computeCanonicalMetadata(media, existingMeta);

  return {
    hash,
    url,
    originalPath: media.originalPath || media.originalFilename || '',
    timestamp: media.timestamp || 0,
    user: media.user || '',
    operation: media.operation || '',
    type: detectMediaType(media),
    doc,
    displayName: canonical.displayName,
    modifiedTimestamp: canonicalModifiedTimestamp ?? canonical.modifiedTimestamp,
  };
}

export function isPdf(path) {
  return path && path.toLowerCase().endsWith('.pdf');
}

export function isSvg(path) {
  return path && path.toLowerCase().endsWith('.svg');
}

export function isFragmentDoc(path) {
  return path && path.includes(Paths.FRAGMENTS);
}

export function isLinkedContentPath(path) {
  return path && (isPdf(path) || isSvg(path) || isFragmentDoc(path));
}

export function toAbsoluteFilePath(path) {
  if (!path) return '';
  const p = path.split('?')[0].split('#')[0].trim();
  return p.startsWith('/') ? p : `/${p}`;
}

export function isPdfOrSvg(path) {
  return isPdf(path) || isSvg(path);
}

export function getLinkedContentType(path) {
  if (isPdf(path)) return MediaType.DOCUMENT;
  if (isSvg(path)) return MediaType.IMAGE;
  if (isFragmentDoc(path)) return MediaType.FRAGMENT;
  return 'unknown';
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

  return Promise.all(results);
}

// Parses pages for PDF/SVG/fragment refs; returns usage map + external media.
// When onBatchComplete is provided, processes in batches and calls it after each batch.
export async function buildUsageMap(pageEntries, org, repo, ref, onProgress, onBatch = null) {
  // Lazy-load dependencies (only needed in main thread, not worker)
  const fetchPageMarkdownFn = await getFetchPageMarkdown();
  const isPerfEnabledFn = await getIsPerfEnabled();

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
        const result = await fetchPageMarkdownFn(normalizedPath, org, repo, ref);

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
        const result = await fetchPageMarkdownFn(normalizedPath, org, repo, ref);
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

  if (isPerfEnabledFn()) {
    // eslint-disable-next-line no-console
    console.log(
      `[buildUsageMap] ${Math.round(durationMs / 1000)}s | pages ${counters.success}/${uniquePages.length} | `
      + `items frag=${fragCount} pdf=${pdfCount} svg=${svgCount} ext=${extCount}`,
    );
  }

  return usageMap;
}

export function toExternalMediaEntry(
  url,
  doc,
  firstDiscoveredTimestamp = 0,
  org = null,
  repo = null,
) {
  const info = getExternalMediaType(url);
  if (!info) return null;

  const canonicalUrl = canonicalizeMediaUrl(url, org, repo);
  const normalizedUrl = normalizeExternalVideoUrl(canonicalUrl);

  let displayName = info.name;
  try {
    displayName = decodeURIComponent(info.name);
  } catch {
    // Keep original if decode fails
  }

  return {
    hash: normalizedUrl,
    url: canonicalUrl,
    timestamp: firstDiscoveredTimestamp,
    user: '',
    operation: Operation.EXTLINKS,
    type: info.type,
    doc: doc || '',
    displayName,
    modifiedTimestamp: firstDiscoveredTimestamp,
  };
}

export function toLinkedContentEntry(
  filePath,
  doc,
  fileEvent,
  org,
  repo,
  lastModified = null,
) {
  let urlPath = filePath;
  if (filePath.startsWith(Paths.FRAGMENTS) && filePath.endsWith(Paths.EXT_HTML)) {
    urlPath = filePath.replace(/\.html$/, '');
  }
  const url = `https://main--${repo}--${org}.aem.page${urlPath}`;
  const fileName = filePath.split('/').pop() || filePath;

  return {
    hash: filePath, // Path used as dedupe key for linked content
    url,
    timestamp: fileEvent.timestamp,
    user: fileEvent.user || '',
    operation: 'auditlog-parsed',
    type: getLinkedContentType(filePath),
    doc: doc || '',
    displayName: fileName, // Use filename for display
    modifiedTimestamp: lastModified || fileEvent.timestamp,
  };
}

// Creates linked content entries from usage map (for progressive display).
export function createLinkedContentEntries(usageMap, linkedFilesByPath, deletedPaths, org, repo) {
  const usageKey = (path) => {
    if (isPdf(path)) return 'pdfs';
    if (isSvg(path)) return 'svgs';
    return 'fragments';
  };
  const allLinkedPaths = new Set(linkedFilesByPath.keys());
  ['pdfs', 'svgs', 'fragments'].forEach((key) => {
    usageMap[key]?.forEach((_, path) => allLinkedPaths.add(path));
  });
  const entries = [];
  allLinkedPaths.forEach((filePath) => {
    if (deletedPaths.has(filePath)) return;
    const key = usageKey(filePath);
    const linkedPages = usageMap[key]?.get(filePath) || [];
    const fileEvent = linkedFilesByPath.get(filePath) || { timestamp: 0, user: '' };
    if (linkedPages.length === 0) {
      entries.push(toLinkedContentEntry(filePath, '', fileEvent, org, repo));
    } else {
      linkedPages.forEach((doc) => {
        entries.push(toLinkedContentEntry(filePath, doc, fileEvent, org, repo));
      });
    }
  });
  const externalUrls = usageMap.externalMedia ? [...usageMap.externalMedia.keys()] : [];
  externalUrls.forEach((url) => {
    const data = usageMap.externalMedia.get(url) || {
      pages: [],
      firstDiscoveredTimestamp: 0,
    };
    const { pages: linkedPages, firstDiscoveredTimestamp } = data;
    if (linkedPages.length > 0) {
      linkedPages.forEach((doc) => {
        const entry = toExternalMediaEntry(url, doc, firstDiscoveredTimestamp, org, repo);
        if (entry) entries.push(entry);
      });
    }
  });
  return entries;
}

export function checkMemory() {
  if (typeof performance !== 'undefined' && performance.memory) {
    const used = performance.memory.usedJSHeapSize / (1024 * 1024);
    const limit = performance.memory.jsHeapSizeLimit / (1024 * 1024);
    return { warning: used > limit * 0.8, usedMB: used, limitMB: limit };
  }
  return { warning: false };
}
