import {
  fetchFromAdminAPI, loadDataSheet, saveDataSheet, loadMeta, saveMeta, isMetaStale,
} from './admin-api.js';
import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';

export function getFragmentsSheetPath(sitePath) {
  return `${sitePath}/.da/mediaindex/fragments.json`;
}

export function getFragmentsMetaPath(sitePath) {
  return `${sitePath}/.da/mediaindex/fragments-meta.json`;
}

export async function loadFragmentsSheet(sitePath) {
  return loadDataSheet(getFragmentsSheetPath(sitePath));
}

export async function saveFragmentsSheet(data, sitePath) {
  return saveDataSheet(data, getFragmentsSheetPath(sitePath));
}

export async function loadFragmentsMeta(sitePath) {
  return loadMeta(getFragmentsMetaPath(sitePath));
}

export async function saveFragmentsMeta(sitePath, meta) {
  return saveMeta(meta, getFragmentsMetaPath(sitePath));
}

export function isFragmentsMetaStale(meta, thresholdMs = 5 * 60 * 1000) {
  return isMetaStale(meta, thresholdMs);
}

export async function fetchFragments(org, repo, ref = 'main', since = null, limit = 1000) {
  return fetchFromAdminAPI('log', org, repo, ref, since, limit);
}

export async function fetchPages(org, repo, ref = 'main', since = null, limit = 1000) {
  return fetchFromAdminAPI('log', org, repo, ref, since, limit);
}

async function parsePageForFragments(pagePath, sitePath) {
  try {
    let pathToFetch = pagePath;
    if (!pathToFetch.endsWith('.html') && !pathToFetch.includes('.')) {
      pathToFetch = `${pathToFetch}.html`;
    }
    const fullPath = `${sitePath}${pathToFetch}`;
    const resp = await daFetch(`${DA_ORIGIN}/source${fullPath}`);

    if (!resp.ok) return [];

    const html = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const fragments = new Set();

    doc.querySelectorAll('a[href*="/fragments/"]').forEach((link) => {
      const href = link.getAttribute('href');
      if (href && href.includes('/fragments/')) {
        const match = href.match(/\/fragments\/[^?#]*/);
        if (match) {
          fragments.add(match[0]);
        }
      }
    });

    doc.querySelectorAll('[data-path*="/fragments/"]').forEach((el) => {
      const dataPath = el.getAttribute('data-path');
      if (dataPath && dataPath.includes('/fragments/')) {
        const match = dataPath.match(/\/fragments\/[^?#]*/);
        if (match) {
          fragments.add(match[0]);
        }
      }
    });

    return Array.from(fragments);
  } catch (err) {
    return [];
  }
}

export async function buildFragmentUsageMap(pageEvents, sitePath, onProgress = null) {
  const usageMap = new Map();
  const activePages = pageEvents
    .filter((e) => e.route === 'preview' || e.route === 'live')
    .filter((e) => !e.path?.includes('/fragments/'))
    .filter((e) => e.path && e.path !== '/')
    .reduce((acc, e) => {
      if (!acc.has(e.path)) {
        acc.set(e.path, true);
      }
      return acc;
    }, new Map());

  const pagePaths = Array.from(activePages.keys());

  // Parallel processing with concurrency limit
  const CONCURRENCY = 10;

  // Process pages in batches with concurrency limit
  for (let i = 0; i < pagePaths.length; i += CONCURRENCY) {
    const batch = pagePaths.slice(i, i + CONCURRENCY);

    // Fetch batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (pagePath) => ({
        pagePath,
        fragments: await parsePageForFragments(pagePath, sitePath),
      })),
    );

    // Process results
    batchResults.forEach(({ pagePath, fragments }) => {
      fragments.forEach((fragmentPath) => {
        const normalizedPath = fragmentPath.endsWith('.html') ? fragmentPath : `${fragmentPath}.html`;
        const pathWithoutExt = fragmentPath.replace(/\.html$/, '');

        [fragmentPath, normalizedPath, pathWithoutExt].forEach((key) => {
          if (!usageMap.has(key)) {
            usageMap.set(key, []);
          }
          if (!usageMap.get(key).includes(pagePath)) {
            usageMap.get(key).push(pagePath);
          }
        });
      });
    });

    // Report progress after batch
    if (onProgress) {
      const processed = i + batchResults.length;
      onProgress(processed, pagePaths.length);
    }
  }

  return usageMap;
}

export function processFragmentLog(entries, org, repo, usageMap = null) {
  if (!entries || entries.length === 0) return [];

  const fragmentMap = new Map();

  entries
    .filter((e) => {
      if (!e.path?.includes('/fragments/')) return false;
      // Only include HTML files - exclude media files in fragments folder
      const cleanPath = e.path.split('?')[0].split('#')[0];
      return cleanPath.endsWith('.html') || !cleanPath.includes('.');
    })
    .filter((e) => e.route === 'preview' || e.route === 'live')
    .forEach((entry) => {
      const { path, route, timestamp, user } = entry;

      if (!fragmentMap.has(path)) {
        fragmentMap.set(path, {
          path,
          name: path.split('/').pop() || path,
          firstPreview: null,
          lastPreview: null,
          lastPublish: null,
          previewedBy: null,
          publishedBy: null,
        });
      }

      const fragment = fragmentMap.get(path);

      if (route === 'preview') {
        if (!fragment.firstPreview) fragment.firstPreview = timestamp;
        if (!fragment.lastPreview || timestamp > fragment.lastPreview) {
          fragment.lastPreview = timestamp;
          fragment.previewedBy = user;
        }
      } else if (route === 'live') {
        if (!fragment.lastPublish || timestamp > fragment.lastPublish) {
          fragment.lastPublish = timestamp;
          fragment.publishedBy = user;
        }
      }
    });

  return Array.from(fragmentMap.values()).map((fragment) => {
    let status = 'Unknown';
    if (!fragment.lastPublish && fragment.lastPreview) {
      status = 'Preview Only';
    } else if (!fragment.lastPreview && fragment.lastPublish) {
      status = 'Published';
    } else if (fragment.lastPreview > fragment.lastPublish) {
      status = 'Unpublished Changes';
    } else {
      status = 'Published';
    }

    const latestTimestamp = Math.max(fragment.lastPreview || 0, fragment.lastPublish || 0);
    const previewUrl = `https://main--${repo}--${org}.aem.page${fragment.path}`;
    const liveUrl = `https://main--${repo}--${org}.aem.live${fragment.path}`;

    let usedInPages = [];
    if (usageMap) {
      const normalizedPath = fragment.path.replace(/^\/eds\//, '/');
      usedInPages = usageMap.get(fragment.path) || usageMap.get(normalizedPath) || [];
    }
    const usageCount = usedInPages.length;

    return {
      url: previewUrl,
      name: fragment.name,
      alt: status,
      type: 'fragment > html',
      doc: usedInPages.length > 0 ? usedInPages[0] : '',
      firstUsedAt: fragment.firstPreview || fragment.lastPublish || latestTimestamp,
      lastUsedAt: latestTimestamp,
      usageCount,
      _fragmentStatus: status,
      _lastPublish: fragment.lastPublish,
      _lastPreview: fragment.lastPreview,
      _publishedBy: fragment.publishedBy,
      _previewedBy: fragment.previewedBy,
      _previewUrl: previewUrl,
      _liveUrl: liveUrl,
      _usedInPages: usedInPages,
    };
  });
}

export function mergeFragmentEntries(existingData, newLogEntries, org, repo, usageMap = null) {
  if (!newLogEntries || newLogEntries.length === 0) {
    return existingData;
  }

  const newProcessedData = processFragmentLog(newLogEntries, org, repo, usageMap);

  if (!existingData || existingData.length === 0) {
    return newProcessedData;
  }

  const dataMap = new Map();
  existingData.forEach((item) => {
    dataMap.set(item.url, { ...item });
  });

  newProcessedData.forEach((newItem) => {
    if (dataMap.has(newItem.url)) {
      const existing = dataMap.get(newItem.url);
      existing.lastUsedAt = Math.max(existing.lastUsedAt || 0, newItem.lastUsedAt || 0);
      existing.firstUsedAt = Math.min(
        existing.firstUsedAt || Infinity,
        newItem.firstUsedAt || Infinity,
      );
      ['_fragmentStatus', '_lastPublish', '_lastPreview', '_publishedBy', '_previewedBy', '_usedInPages'].forEach((key) => {
        existing[key] = newItem[key];
      });
      existing.usageCount = newItem.usageCount;
      if (newItem.doc) {
        existing.doc = newItem.doc;
      }
    } else {
      dataMap.set(newItem.url, newItem);
    }
  });

  return Array.from(dataMap.values());
}
