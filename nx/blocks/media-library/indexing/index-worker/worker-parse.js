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
} from '../../core/constants.js';
import { getDedupeKey } from '../../core/urls.js';
import {
  normalizePath,
  isHiddenPath,
  extractImageAndVideoUrls,
  extractFragmentReferences,
  extractExternalMediaUrls,
  extractLinks,
  processConcurrently,
} from '../../core/parse-utils.js';

export { getDedupeKey };

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
  const imgCount = usageMap.images?.size ?? 0;
  const extCount = usageMap.externalMedia?.size ?? 0;

  // MODIFIED: Use isPerfEnabled from context instead of isPerfEnabled()
  if (isPerfEnabled) {
    // eslint-disable-next-line no-console
    console.log(
      `[buildUsageMap] ${Math.round(durationMs / 1000)}s | pages ${counters.success}/${uniquePages.length} | `
      + `items frag=${fragCount} pdf=${pdfCount} svg=${svgCount} img=${imgCount} ext=${extCount}`,
    );
  }

  return usageMap;
}
