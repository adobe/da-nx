/**
 * Shared parse utilities - Runtime-neutral functions
 *
 * These functions work in both main thread and web worker contexts.
 * No DOM/window dependencies, no dynamic imports.
 */

import {
  Paths,
  Domains,
} from './constants.js';
import { getExternalMediaTypeInfo } from './media.js';

const MD_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/gi;
const MD_REF_DEF_RE = /^\[([^\]]+)\]:\s*(.+)$/gm; // Reference-style link definitions
const MD_AUTOLINK_RE = /<(https?:\/\/[^>]+|\/[^>\s]*)>/g;
const HTML_MEDIA_ATTR_RE = /<(?:img|video|audio|source|iframe)\b[^>]*\b(src|srcset|poster)=["']([^"']+)["'][^>]*>/gi;
const HTML_ANCHOR_RE = /<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi;

/**
 * Normalizes path (removes query/hash, adds .md for pages)
 */
export function normalizePath(path) {
  if (!path) return '';
  let cleanPath = path.split('?')[0].split('#')[0];
  if (!cleanPath.includes('.') && !cleanPath.startsWith(Paths.MEDIA)) {
    cleanPath = cleanPath === '/' || cleanPath === '' ? '/index.md' : `${cleanPath}.md`;
  }
  return cleanPath;
}

/**
 * Checks if path contains hidden folder (starts with /.)
 */
export function isHiddenPath(path) {
  if (!path || typeof path !== 'string') return false;
  return path.includes('/.');
}

/**
 * Get external media type for URL
 */
export function getExternalMediaType(url) {
  return getExternalMediaTypeInfo(url);
}

/**
 * Check if URL is external media (YouTube, Vimeo, etc.)
 */
export function isExternalMediaUrl(url) {
  return getExternalMediaType(url) !== null;
}

/**
 * Helper: Check if URL is external (not site-relative or AEM domain)
 */
function isExternalUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('//')) {
    return false; // Relative path, not external
  }

  // It's an HTTP URL - check if it's on an AEM domain
  let u = url;
  if (u.startsWith('//')) {
    u = `https:${u}`;
  }
  try {
    const urlObj = new URL(u);
    const host = urlObj.hostname.toLowerCase();
    const isAemDomain = Domains.SAME_ORIGIN.some((d) => host.endsWith(d));
    return !isAemDomain; // External if NOT an AEM domain
  } catch {
    return true; // Couldn't parse, treat as external
  }
}

/**
 * Helper: Convert href to path (strip protocol/domain for internal URLs)
 */
function toPath(href) {
  if (!href) return '';
  let u = href.trim();
  // Remove leading slashes for protocol-relative URLs
  if (u.startsWith('//')) {
    u = `https:${u}`;
  }
  try {
    const url = new URL(u);
    // Check if it's on an allowed domain
    const host = url.hostname.toLowerCase();
    const isAemDomain = Domains.SAME_ORIGIN.some((d) => host.endsWith(d));
    if (isAemDomain) {
      return url.pathname;
    }
    return u; // Return as-is if not AEM domain
  } catch {
    // Not a valid URL, treat as relative path
    return u.split('?')[0].split('#')[0];
  }
}

/**
 * Helper: Extract URLs from Markdown content
 */
function extractUrlsFromMarkdown(md) {
  const urls = [];

  // Standard markdown links: [text](url)
  let match;
  // eslint-disable-next-line no-cond-assign
  while ((match = MD_LINK_RE.exec(md)) !== null) {
    urls.push(match[1]);
  }

  // Reference-style link definitions: [id]: url
  // eslint-disable-next-line no-cond-assign
  while ((match = MD_REF_DEF_RE.exec(md)) !== null) {
    urls.push(match[2].trim());
  }

  // Autolinks: <url>
  // eslint-disable-next-line no-cond-assign
  while ((match = MD_AUTOLINK_RE.exec(md)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

/**
 * Helper: Extract URLs from HTML content
 */
function extractUrlsFromHtml(html) {
  const urls = [];
  let match;

  // Media attributes (src, srcset, poster)
  // eslint-disable-next-line no-cond-assign
  while ((match = HTML_MEDIA_ATTR_RE.exec(html)) !== null) {
    urls.push(match[2]);
  }

  // Anchor hrefs
  // eslint-disable-next-line no-cond-assign
  while ((match = HTML_ANCHOR_RE.exec(html)) !== null) {
    urls.push(match[1]);
  }

  return urls;
}

/**
 * Helper: Extract all URLs from content (markdown or HTML)
 */
function extractUrls(content, isHtml = false) {
  if (!content || typeof content !== 'string') return [];
  return isHtml ? extractUrlsFromHtml(content) : extractUrlsFromMarkdown(content);
}

/**
 * Extract external media URLs (YouTube, Vimeo, etc.) from content
 */
export function extractExternalMediaUrls(content, isHtml = false) {
  if (!content || typeof content !== 'string') return [];
  const urls = extractUrls(content, isHtml);
  return [...new Set(urls.filter((u) => isExternalMediaUrl(u)))];
}

/**
 * Extract fragment references from content
 */
export function extractFragmentReferences(content, isHtml = false) {
  const urls = extractUrls(content, isHtml);
  return [...new Set(urls.filter((u) => u.includes(Paths.FRAGMENTS)).map((u) => toPath(u)))];
}

/**
 * Extract image and video URLs from content
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
 * Extract links matching a pattern from content
 */
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
 * Process items concurrently with concurrency limit
 * Returns results in order
 */
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
