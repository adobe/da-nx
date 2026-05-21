import {
  IndexConfig,
  Operation,
  Paths,
  MediaType,
} from '../core/constants.js';
import { normalizeExternalVideoUrl } from '../core/media.js';
import { getDedupeKey, canonicalizeMediaUrl } from '../core/urls.js';
import {
  normalizePath,
  isHiddenPath,
  extractImageUrls,
  extractVideoUrls,
  extractFragmentReferences,
  extractExternalMediaUrls,
  extractLinks,
  getExternalMediaType,
  processConcurrently,
} from './parse-utils.js';

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

export function normalizeOriginalPath(originalFilename) {
  if (!originalFilename) return '';
  const str = String(originalFilename).trim();
  if (!str) return '';

  try {
    const url = new URL(str);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length > 2) {
      return `/${parts.slice(2).join('/')}`;
    }
    return url.pathname;
  } catch {
    return str;
  }
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
 * Use the most recent activity timestamp (ingest or reuse) so that recently
 * added/used images appear on top, regardless of the file's modification time on CDN.
 */
export function computeCanonicalModifiedTimestamp(allEntriesForHash) {
  if (!allEntriesForHash || allEntriesForHash.length === 0) {
    return 0;
  }

  // Find the most recent timestamp across all operations (ingest, reuse, etc.)
  const allTimestamps = allEntriesForHash
    .map((e) => e.timestamp || 0)
    .filter((ts) => ts > 0);

  if (allTimestamps.length === 0) {
    return 0;
  }

  // Return the most recent activity timestamp
  const maxTimestamp = Math.max(...allTimestamps);

  return maxTimestamp;
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

  // Fall back to file extension detection if contentType not available
  const url = mediaEntry.url || mediaEntry.path || '';
  if (!url) return 'unknown';

  // Extract extension from URL (handle query params and fragments)
  const cleanUrl = url.split('?')[0].split('#')[0];
  const match = cleanUrl.match(/\.([a-z0-9]+)$/i);
  if (!match) return 'unknown';

  const ext = match[1].toLowerCase();

  // Map extension to MediaType
  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'];
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'm4v'];

  if (imageExts.includes(ext)) return MediaType.IMAGE;
  if (videoExts.includes(ext)) return MediaType.VIDEO;
  if (ext === 'pdf') return MediaType.DOCUMENT;
  if (ext === 'svg') return MediaType.IMAGE;

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

  let finalModifiedTimestamp = canonicalModifiedTimestamp ?? canonical.modifiedTimestamp;
  if (finalModifiedTimestamp === '') {
    finalModifiedTimestamp = null;
  }

  return {
    hash,
    url,
    originalPath: normalizeOriginalPath(media.originalPath || media.originalFilename),
    timestamp: media.timestamp || 0,
    user: media.user || '',
    operation: media.operation || '',
    type: detectMediaType(media),
    doc,
    displayName: canonical.displayName,
    modifiedTimestamp: finalModifiedTimestamp,
  };
}

export function isPdf(path) {
  return path && path.toLowerCase().endsWith('.pdf');
}

export function isSvg(path) {
  return path && path.toLowerCase().endsWith('.svg');
}

export function isVideo(path) {
  if (!path) return false;
  const lower = path.toLowerCase();
  return lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov') || lower.endsWith('.avi') || lower.endsWith('.m4v');
}

export function isFragmentDoc(path) {
  return path && path.includes(Paths.FRAGMENTS);
}

export function isLinkedContentPath(path) {
  return path && (isPdf(path) || isSvg(path) || isVideo(path) || isFragmentDoc(path));
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
  if (isVideo(path)) return MediaType.VIDEO;
  if (isFragmentDoc(path)) return MediaType.FRAGMENT;
  return 'unknown';
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
    videos: new Map(), // Videos from markdown links
    images: new Map(), // Regular images from markdown
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
    const videos = extractVideoUrls(md, isHtml);
    const images = extractImageUrls(md, isHtml);
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
    videos.forEach((v) => addToMap(usageMap.videos, v));
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
  const videoCount = usageMap.videos?.size ?? 0;
  const imgCount = usageMap.images?.size ?? 0;
  const extCount = usageMap.externalMedia?.size ?? 0;

  if (isPerfEnabledFn()) {
    // eslint-disable-next-line no-console
    console.log(
      `[buildUsageMap] ${Math.round(durationMs / 1000)}s | pages ${counters.success}/${uniquePages.length} | `
      + `items frag=${fragCount} pdf=${pdfCount} svg=${svgCount} video=${videoCount} img=${imgCount} ext=${extCount}`,
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

  const modifiedTimestamp = (firstDiscoveredTimestamp === '' || firstDiscoveredTimestamp === null || firstDiscoveredTimestamp === undefined)
    ? null
    : firstDiscoveredTimestamp;

  // Use normalized URL as hash for consistent deduplication
  // (e.g., youtube.com/watch?v=xyz and youtu.be/xyz both normalize to youtube.com/watch?v=xyz)
  const hash = normalizedUrl;

  return {
    hash,
    url: canonicalUrl,
    timestamp: firstDiscoveredTimestamp,
    user: '',
    operation: Operation.EXTLINKS,
    type: info.type,
    doc: doc || '',
    displayName,
    modifiedTimestamp,
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

  const rawModifiedTimestamp = lastModified || fileEvent.timestamp;
  const modifiedTimestamp = (rawModifiedTimestamp === '' || rawModifiedTimestamp === null || rawModifiedTimestamp === undefined)
    ? null
    : rawModifiedTimestamp;

  // For videos/images with media_ prefix, extract bare hash (strip media_ prefix and extension)
  // For other content (PDFs, fragments), use full path as hash
  let hash = filePath;
  if (fileName.includes('media_') && fileName.includes('.')) {
    // Extract bare hash: media_HASH.ext -> HASH
    const bareHash = fileName.substring(6, fileName.lastIndexOf('.'));
    hash = bareHash;
  }

  return {
    hash,
    url,
    timestamp: fileEvent.timestamp,
    user: fileEvent.user || '',
    operation: 'auditlog-parsed',
    type: getLinkedContentType(filePath),
    doc: doc || '',
    displayName: fileName, // Use filename for display
    modifiedTimestamp,
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
