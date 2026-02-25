import { fetchPageMarkdown } from './admin-api.js';
import {
  IndexConfig,
  ExternalMedia,
  Domains,
  Operation,
  Paths,
  MediaType,
  ICON_DOC_EXCLUDE,
} from './constants.js';

const MD_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/gi;
const MD_AUTOLINK_RE = /<(https?:\/\/[^>]+|\/[^>\s]*)>/g;
const ICON_RE = /:([a-zA-Z0-9-]+):/g;

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
          || (!path.includes('.') && !path.startsWith(Paths.MEDIA)))
         && !path.includes(Paths.FRAGMENTS);
}

export function extractName(mediaEntry) {
  if (!mediaEntry) return '';
  if (mediaEntry.originalFilename) {
    return mediaEntry.originalFilename.split('/').pop();
  }
  if (!mediaEntry.path) return '';
  return mediaEntry.path.split('?')[0].split('#')[0].split('/').pop();
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

export function detectMediaType(mediaEntry) {
  const contentType = mediaEntry.contentType || '';
  if (contentType.startsWith('image/')) return MediaType.IMAGE;
  if (contentType.startsWith('video/')) return MediaType.VIDEO;
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

function extractUrlsFromMarkdown(md) {
  if (!md || typeof md !== 'string') return [];
  const fromLinks = [...md.matchAll(MD_LINK_RE)].map((m) => m[1].trim());
  const fromAutolinks = [...md.matchAll(MD_AUTOLINK_RE)].map((m) => m[1].trim());
  return [...fromLinks, ...fromAutolinks];
}

function isExternalUrl(url) {
  if (!url || !url.startsWith('http')) return false;
  return !Domains.SAME_ORIGIN.some((d) => url.includes(d));
}

export function getExternalMediaType(url) {
  if (!url || !url.startsWith('http') || !isExternalUrl(url)) return null;

  try {
    const parsed = new URL(url);
    const pathPart = parsed.pathname.split('?')[0].split('#')[0];
    const pathLower = pathPart.toLowerCase();

    const extMatch = pathLower.match(ExternalMedia.EXTENSION_REGEX);
    if (extMatch) {
      const ext = extMatch[1].toLowerCase();
      let type = MediaType.LINK;
      if (ExternalMedia.EXTENSIONS.pdf.includes(ext)) type = MediaType.DOCUMENT;
      else if (ExternalMedia.EXTENSIONS.svg.includes(ext)) type = MediaType.IMAGE;
      else if (ExternalMedia.EXTENSIONS.image.includes(ext)) type = MediaType.IMAGE;
      else if (ExternalMedia.EXTENSIONS.video.includes(ext)) type = MediaType.VIDEO;
      const name = pathPart.split('/').pop() || parsed.hostname;
      return { type, name };
    }

    const host = parsed.hostname;
    const matched = ExternalMedia.HOST_PATTERNS.find(
      (p) => p.host.test(host) && (!p.pathContains || parsed.pathname.includes(p.pathContains)),
    );
    if (matched) {
      const { type: patternType } = matched;

      if (matched.typeFromPath) {
        const lastSegment = pathPart.split('/').pop() || '';
        const segExt = lastSegment.split('.').pop()?.toLowerCase();
        const imageExts = [...ExternalMedia.EXTENSIONS.image, ...ExternalMedia.EXTENSIONS.svg];
        if (segExt && ExternalMedia.EXTENSIONS.video.includes(segExt)) {
          return { type: MediaType.VIDEO, name: lastSegment };
        }
        if (segExt && ExternalMedia.EXTENSIONS.pdf.includes(segExt)) {
          return { type: MediaType.DOCUMENT, name: lastSegment };
        }
        if (segExt && imageExts.includes(segExt)) {
          return { type: MediaType.IMAGE, name: lastSegment };
        }
      }
      if (patternType === ExternalMedia.CATEGORY_IMG) {
        return { type: MediaType.IMAGE, name: pathPart.split('/').pop() || host };
      }
      if (patternType === MediaType.VIDEO) {
        return { type: MediaType.VIDEO, name: host };
      }
      return { type: MediaType.LINK, name: host };
    }
  } catch {
    /* parse error */
  }
  return null;
}

export function isExternalMediaUrl(url) {
  return getExternalMediaType(url) !== null;
}

export function extractExternalMediaUrls(md) {
  if (!md || typeof md !== 'string') return [];
  const urls = extractUrlsFromMarkdown(md);
  return [...new Set(urls.filter((u) => isExternalMediaUrl(u)))];
}

export function extractIconReferences(md) {
  if (!md || typeof md !== 'string') return [];
  const matches = [...md.matchAll(ICON_RE)];
  return [...new Set(
    matches
      .filter((m) => !ICON_DOC_EXCLUDE.has(m[1].toLowerCase()))
      .map((m) => `/icons/${m[1]}.svg`),
  )];
}

export function extractFragmentReferences(md) {
  const urls = extractUrlsFromMarkdown(md);
  return [...new Set(urls.filter((u) => u.includes(Paths.FRAGMENTS)).map((u) => toPath(u)))];
}

export function extractLinks(md, pattern) {
  const urls = extractUrlsFromMarkdown(md);
  const pathPart = (u) => u.split('?')[0].split('#')[0];
  return [...new Set(
    urls
      .filter((u) => pattern.test(pathPart(u)) && !isExternalUrl(u))
      .map((u) => toPath(u)),
  )];
}

/**
 * Runs fn concurrently over items, limiting to `concurrency` in-flight promises.
 * When items.length < concurrency, all run in parallel (no limiting).
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

export async function buildUsageMap(pageEntries, org, repo, ref, onProgress) {
  const usageMap = {
    fragments: new Map(),
    pdfs: new Map(),
    svgs: new Map(),
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

  const uniquePages = [...pagesByPath.keys()];
  // eslint-disable-next-line no-console
  console.log(`[MediaIndexer] Parsing ${uniquePages.length} unique pages for content usage`);

  const results = await processConcurrently(
    uniquePages,
    async (normalizedPath, i) => {
      onProgress?.({ message: `Parsing page ${i + 1}/${uniquePages.length}: ${normalizedPath}` });
      const md = await fetchPageMarkdown(normalizedPath, org, repo, ref);
      return { normalizedPath, md };
    },
    IndexConfig.MAX_CONCURRENT_FETCHES,
  );

  const failed = results.filter((r) => !r.md);
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[MediaIndexer] Failed to fetch markdown for ${failed.length} pages`);
  }

  results.forEach(({ normalizedPath, md }) => {
    if (!md) return;

    const fragments = extractFragmentReferences(md);
    const pdfs = extractLinks(md, /\.pdf$/);
    const svgs = extractLinks(md, /\.svg$/);
    const icons = extractIconReferences(md);
    const externalUrls = extractExternalMediaUrls(md);

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
        usageMap.externalMedia.set(url, { pages: [normalizedPath], latestTimestamp: pageTs });
      } else if (!existing.pages.includes(normalizedPath)) {
        existing.pages.push(normalizedPath);
        existing.latestTimestamp = Math.max(existing.latestTimestamp, pageTs);
      }
    };

    fragments.forEach((f) => addToMap(usageMap.fragments, f));
    pdfs.forEach((p) => addToMap(usageMap.pdfs, p));
    svgs.forEach((s) => addToMap(usageMap.svgs, s));
    icons.forEach((s) => addToMap(usageMap.svgs, s));
    externalUrls.forEach((u) => addToExternalMedia(u));
  });

  // eslint-disable-next-line no-console
  console.log(`[MediaIndexer] Content usage: ${usageMap.pdfs.size} PDFs, ${usageMap.svgs.size} SVGs, ${usageMap.fragments.size} fragments, ${usageMap.externalMedia.size} external media`);

  return usageMap;
}

export function matchPageEvents(pagesByPath, resourcePath, mediaTimestamp) {
  const events = pagesByPath.get(resourcePath);
  if (!events || events.length === 0) return [];
  const minTs = mediaTimestamp - IndexConfig.MEDIA_ASSOCIATION_WINDOW_MS;
  return events.filter(
    (e) => e.timestamp <= mediaTimestamp && e.timestamp > minTs,
  );
}

export function toExternalMediaEntry(url, doc, latestPageTimestamp = 0) {
  const info = getExternalMediaType(url);
  if (!info) return null;

  return {
    hash: url,
    doc: doc || '',
    url,
    name: info.name,
    timestamp: latestPageTimestamp,
    user: '',
    operation: Operation.EXTLINKS,
    type: info.type,
    status: 'referenced',
  };
}

export function toLinkedContentEntry(filePath, doc, fileEvent, status, org, repo) {
  let urlPath = filePath;
  if (filePath.startsWith(Paths.FRAGMENTS) && filePath.endsWith(Paths.EXT_HTML)) {
    urlPath = filePath.replace(/\.html$/, '');
  }
  const url = `https://main--${repo}--${org}.aem.page${urlPath}`;

  return {
    hash: filePath,
    doc: doc || '',
    url,
    name: filePath.split('/').pop() || filePath,
    timestamp: fileEvent.timestamp,
    user: fileEvent.user || '',
    operation: 'auditlog-parsed',
    type: getLinkedContentType(filePath),
    status,
    source: 'auditlog-parsed',
  };
}

export function checkMemory() {
  if (typeof performance !== 'undefined' && performance.memory) {
    const used = performance.memory.usedJSHeapSize / (1024 * 1024);
    const limit = performance.memory.jsHeapSizeLimit / (1024 * 1024);
    return { warning: used > limit * 0.8, usedMB: used, limitMB: limit };
  }
  return { warning: false };
}
