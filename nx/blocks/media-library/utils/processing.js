import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';

import { crawl } from '../../../public/utils/tree.js';
import {
  isMediaFile,
  extractFileExtension,
  detectMediaTypeFromExtension,
  createHash,
  createSheet,
  splitPathParts,
  CONTENT_ORIGIN,
  sortMediaData,
} from './utils.js';
import { getGroupingKey } from './filters.js';

export function buildDataStructures(mediaData) {
  const uniqueItemsMap = new Map();
  const usageIndex = new Map();
  const folderPaths = new Set();

  mediaData.forEach((item) => {
    if (!item.url) return;

    const groupingKey = getGroupingKey(item.url);

    if (!uniqueItemsMap.has(groupingKey)) {
      uniqueItemsMap.set(groupingKey, { ...item, usageCount: 1 });
    } else {
      const existingItem = uniqueItemsMap.get(groupingKey);
      existingItem.usageCount += 1;
    }

    if (!usageIndex.has(groupingKey)) {
      usageIndex.set(groupingKey, []);
    }

    usageIndex.get(groupingKey).push({
      doc: item.doc,
      alt: item.alt,
      type: item.type,
      firstUsedAt: item.firstUsedAt,
      lastUsedAt: item.lastUsedAt,
      hash: item.hash,
    });

    if (item.doc) {
      const cleanPath = item.doc.replace(/\.html$/, '');
      const parts = cleanPath.split('/');

      if (parts.length > 2) {
        for (let i = 1; i < parts.length - 1; i += 1) {
          const folderPath = parts.slice(0, i + 1).join('/');
          folderPaths.add(folderPath);
        }
      } else if (parts.length === 2) {
        folderPaths.add('/');
      }
    }
  });

  return {
    uniqueItems: Array.from(uniqueItemsMap.values()),
    usageIndex,
    folderPaths,
  };
}

export function getMediaLibraryPath(sitePath) {
  return `${sitePath}/.da/mediaindex`;
}

export function getMediaSheetPath(sitePath) {
  return `${getMediaLibraryPath(sitePath)}/media.json`;
}

export function getScanLockPath(sitePath) {
  return `${getMediaLibraryPath(sitePath)}/scan-lock.json`;
}

export function getLastModifiedDataPath(sitePath, folderName = 'root') {
  return `${getMediaLibraryPath(sitePath)}/lastmodified-data/${folderName}.json`;
}

export async function saveMediaSheet(data, sitePath) {
  const path = getMediaSheetPath(sitePath);
  const formData = await createSheet(data);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

function normalizeMediaItem(item) {
  if (item.type?.startsWith('img >')) {
    if (item.alt === 'null' || item.alt === undefined) {
      item.alt = null;
    }
  }
  return item;
}

export async function loadMediaSheet(sitePath) {
  const path = getMediaSheetPath(sitePath);

  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);

    if (resp.ok) {
      const data = await resp.json();
      const result = data.data || data || [];
      return result.map(normalizeMediaItem);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[LOAD] Error loading media.json:', error);
  }
  return [];
}

export function resolveMediaUrl(src, docPath) {
  if (!src) return null;

  if (src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }

  if (src.startsWith('data:')) {
    return src;
  }

  if (src.startsWith('/')) {
    return `${CONTENT_ORIGIN}${src}`;
  }

  const docDir = docPath.substring(0, docPath.lastIndexOf('/') + 1);
  const relativePath = docDir + src;
  return `${CONTENT_ORIGIN}${relativePath}`;
}

export function extractRelativePath(fullPath) {
  if (!fullPath) return '';

  const url = new URL(fullPath);
  return url.pathname;
}

function processMediaElements(elements, config, docPath, docTimestamp) {
  const mediaItems = [];

  elements.forEach((element) => {
    const url = config.getUrl(element);
    if (!url) return;

    const fileName = url.split('/').pop();
    const fileExt = extractFileExtension(fileName);

    if (!isMediaFile(fileExt)) return;

    const altText = config.getAlt(element);
    const resolvedUrl = resolveMediaUrl(url, docPath);
    const mediaType = detectMediaTypeFromExtension(fileExt);
    const typeLabel = config.typeOverride || mediaType;
    const hash = createHash(`${url}|${altText}|${docPath}`);

    mediaItems.push({
      url: resolvedUrl,
      name: fileName,
      alt: altText,
      type: `${typeLabel} > ${fileExt.toLowerCase()}`,
      doc: docPath,
      hash,
      firstUsedAt: docTimestamp,
      lastUsedAt: docTimestamp,
    });
  });

  return mediaItems;
}

function processFragments(elements, docPath, docTimestamp) {
  const mediaItems = [];

  elements.forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || !href.includes('/fragments')) return;

    const resolvedUrl = resolveMediaUrl(href, docPath);
    const altText = link.textContent || '';
    const hash = createHash(`${href}|${altText}|${docPath}`);

    mediaItems.push({
      url: resolvedUrl,
      name: href.split('/').pop() || 'Fragment',
      alt: altText,
      type: 'fragment > html',
      doc: docPath,
      hash,
      firstUsedAt: docTimestamp,
      lastUsedAt: docTimestamp,
    });
  });

  return mediaItems;
}

export function parseHtmlMedia(html, docPath, lastModified) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const docTimestamp = lastModified;

  const imageConfig = {
    getUrl: (el) => el.src,
    getAlt: (el) => {
      const hasAlt = el.hasAttribute('alt');
      const alt = hasAlt ? el.alt : '';
      return (hasAlt && alt !== 'null') ? alt : null;
    },
  };

  const videoConfig = {
    getUrl: (el) => el.src,
    getAlt: () => '',
  };

  const sourceConfig = {
    getUrl: (el) => el.src,
    getAlt: () => '',
    typeOverride: 'video-source',
  };

  const linkConfig = {
    getUrl: (el) => el.getAttribute('href'),
    getAlt: (el) => el.textContent || '',
  };

  return [
    ...processMediaElements(doc.querySelectorAll('img'), imageConfig, docPath, docTimestamp),
    ...processMediaElements(doc.querySelectorAll('video'), videoConfig, docPath, docTimestamp),
    ...processMediaElements(doc.querySelectorAll('video source'), sourceConfig, docPath, docTimestamp),
    ...processMediaElements(doc.querySelectorAll('a[href]'), linkConfig, docPath, docTimestamp),
    ...processFragments(doc.querySelectorAll('a[href*="/fragments"]'), docPath, docTimestamp),
  ];
}

async function getLastModifiedPath(sitePath, folderName = 'root') {
  return getLastModifiedDataPath(sitePath, folderName);
}

async function saveLastModifiedData(sitePath, folderName, data) {
  const path = await getLastModifiedPath(sitePath, folderName);

  const formData = await createSheet(data);
  const response = await daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });

  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.error('[SAVE] Failed to save', path, 'status:', response.status);
  }

  return response;
}

async function loadAllLastModifiedData(sitePath) {
  const lastModifiedMap = new Map();

  try {
    const callback = async (item) => {
      const ext = extractFileExtension(item.path);

      if (ext === 'json') {
        try {
          const resp = await daFetch(`${DA_ORIGIN}/source${item.path}`);
          if (resp.ok) {
            const data = await resp.json();
            const fileData = data.data || data || [];
            fileData.forEach((fileItem) => {
              lastModifiedMap.set(fileItem.path, fileItem.lastModified);
            });
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn(`[LASTMOD] Failed to load lastModified data from ${item.path}:`, error);
        }
      }
    };

    const lastModifiedDataPath = `${getMediaLibraryPath(sitePath)}/lastmodified-data`;
    const { results } = crawl({ path: lastModifiedDataPath, callback });
    await results;

    return lastModifiedMap;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[LASTMOD] Error in loadAllLastModifiedData:', error);
    return lastModifiedMap;
  }
}

function groupFilesByFolder(crawlItems) {
  const rootFiles = [];
  const folderFiles = {};

  crawlItems.forEach((item) => {
    const ext = extractFileExtension(item.path);

    if (ext === 'html' || isMediaFile(ext)) {
      const fileInfo = {
        path: item.path,
        lastModified: item.lastModified,
      };

      const { relativePathParts } = splitPathParts(item.path);

      if (relativePathParts.length === 1) {
        rootFiles.push(fileInfo);
      } else if (relativePathParts.length > 1) {
        const folderName = relativePathParts[0];
        if (!folderFiles[folderName]) {
          folderFiles[folderName] = [];
        }
        folderFiles[folderName].push(fileInfo);
      }
    }
  });

  return { rootFiles, folderFiles };
}

function getMediaSheetLastModifiedKey(sitePath) {
  return `${sitePath.replace(/\//g, '-')}-media-lastupdated`;
}

function getMediaSheetLastModified(sitePath) {
  const key = getMediaSheetLastModifiedKey(sitePath);
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : null;
}

function setMediaSheetLastModified(sitePath, timestamp) {
  const key = getMediaSheetLastModifiedKey(sitePath);
  localStorage.setItem(key, timestamp.toString());
}

export async function checkMediaSheetModified(sitePath) {
  try {
    const mediaFolderPath = getMediaLibraryPath(sitePath);
    const mediaSheetPath = getMediaSheetPath(sitePath);

    const lastMediaSheetModified = getMediaSheetLastModified(sitePath);

    let mediaSheetEntry = null;

    const callback = async (item) => {
      if (item.path === mediaSheetPath) {
        mediaSheetEntry = item;
      }
    };

    const { results } = crawl({ path: mediaFolderPath, callback });
    await results;

    if (!mediaSheetEntry) {
      return { hasChanged: true, fileTimestamp: null };
    }

    const { lastModified } = mediaSheetEntry;

    const hasChanged = !lastMediaSheetModified || lastModified > lastMediaSheetModified;

    setMediaSheetLastModified(sitePath, lastModified);

    return { hasChanged, fileTimestamp: lastModified };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error checking media.json modification:', error);
    return { hasChanged: true, fileTimestamp: null };
  }
}

export async function loadMediaSheetIfModified(sitePath) {
  const { hasChanged } = await checkMediaSheetModified(sitePath);

  if (hasChanged) {
    const mediaData = await loadMediaSheet(sitePath);
    return { hasChanged: true, mediaData };
  }

  return { hasChanged: false, mediaData: null };
}

export async function createScanLock(sitePath) {
  const path = getScanLockPath(sitePath);
  const lockData = {
    timestamp: Date.now(),
    locked: true,
  };
  const formData = await createSheet(lockData);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function checkScanLock(sitePath) {
  const path = getScanLockPath(sitePath);
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (resp.ok) {
      const data = await resp.json();
      return data.data || data;
    }
  } catch (error) {
    return { exists: false, locked: false, timestamp: null };
  }
  return { exists: false, locked: false, timestamp: null };
}

export async function removeScanLock(sitePath) {
  const path = getScanLockPath(sitePath);
  return daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
}

export default async function runScan(sitePath, updateTotal, updateProgressive = null) {
  let totalPagesScanned = 0;
  let totalMediaFilesFound = 0;
  let totalMediaReferences = 0;
  const allMediaUsage = [];
  const unusedMedia = [];
  const allCrawlItems = [];

  const existingLock = await checkScanLock(sitePath);
  if (existingLock.exists && existingLock.locked) {
    const lockAge = Date.now() - existingLock.timestamp;
    const maxLockAge = 30 * 60 * 1000;

    if (lockAge < maxLockAge) {
      throw new Error(`Scan already in progress. Lock created ${Math.round(lockAge / 1000 / 60)} minutes ago.`);
    } else {
      await removeScanLock(sitePath);
    }
  }

  await createScanLock(sitePath);

  const existingMediaData = await loadMediaSheet(sitePath) || [];

  const lastModifiedMap = await loadAllLastModifiedData(sitePath);

  const mediaInUse = new Set();

  let hasChanges = false;

  const callback = async (item) => {
    // Skip excluded folders: drafts, library, and hidden/config folders (starting with dot)
    if (
      item.path.includes('/drafts/')
      || item.path.includes('/library/')
      || item.path.split('/').some((segment) => segment.startsWith('.'))
    ) {
      return;
    }

    const ext = extractFileExtension(item.path);

    if (ext !== 'html' && !isMediaFile(ext)) {
      return;
    }

    if (ext === 'html') {
      totalPagesScanned += 1;
      updateTotal('page', totalPagesScanned);
    } else if (isMediaFile(ext)) {
      totalMediaFilesFound += 1;
      updateTotal('mediaFile', totalMediaFilesFound);
    }

    const existingLastModified = lastModifiedMap.get(item.path);

    if (existingLastModified && existingLastModified === item.lastModified) {
      return;
    }

    hasChanges = true;

    if (ext === 'html') {
      try {
        const resp = await daFetch(`${DA_ORIGIN}/source${item.path}`);
        if (resp.ok) {
          const html = await resp.text();
          const relativePath = item.path.split('/').slice(3).join('/');
          const mediaItems = parseHtmlMedia(html, `/${relativePath}`, item.lastModified);

          if (updateProgressive && mediaItems.length > 0) {
            updateProgressive(mediaItems);
          }

          mediaItems.forEach((mediaItem) => {
            mediaInUse.add(mediaItem.url);
            allMediaUsage.push(mediaItem);
            totalMediaReferences += 1;
            updateTotal('mediaReference', totalMediaReferences);
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Error processing ${item.path}:`, error);
      }
    } else if (isMediaFile(ext)) {
      const resolvedUrl = `${CONTENT_ORIGIN}${item.path}`;
      if (!mediaInUse.has(resolvedUrl)) {
        const mediaType = detectMediaTypeFromExtension(item.ext);
        const hash = createHash(`${item.path}|${''}|${''}`);

        const unusedMediaItem = {
          url: resolvedUrl,
          name: item.path.split('/').pop(),
          alt: '',
          type: `${mediaType} > ${item.ext.toLowerCase()}`,
          doc: '',
          hash,
        };

        unusedMedia.push(unusedMediaItem);
      }
    }

    if (existingLastModified !== item.lastModified) {
      lastModifiedMap.set(item.path, item.lastModified);
    }

    allCrawlItems.push(item);
  };

  const { results, getDuration } = crawl({ path: sitePath, callback });
  await results;

  const allMediaEntries = [];
  const processedUrls = new Set();

  const changedDocPaths = new Set();

  allMediaUsage.forEach((usage) => {
    if (usage.doc) {
      changedDocPaths.add(usage.doc);
    }
  });

  existingMediaData.forEach((item) => {
    if (!item.doc || !changedDocPaths.has(item.doc)) {
      allMediaEntries.push(item);
      processedUrls.add(item.url);
    }
  });

  const allMediaUsageInstances = allMediaUsage;

  allMediaUsageInstances.forEach((usage) => {
    allMediaEntries.push(usage);
    processedUrls.add(usage.url);
  });

  const normalizedUrls = new Set();
  const fileNames = new Set();

  processedUrls.forEach((url) => {
    const normalized = url.split('?')[0];
    normalizedUrls.add(normalized);
    normalizedUrls.add(normalized.startsWith('/') ? normalized : `/${normalized}`);

    const fileName = normalized.split('/').pop();
    if (fileName) fileNames.add(fileName);
  });

  unusedMedia.forEach((item) => {
    const normalized = item.url.split('?')[0];
    const normalizedWithSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
    const fileName = normalized.split('/').pop();

    const isAlreadyProcessed = normalizedUrls.has(normalized)
      || normalizedUrls.has(normalizedWithSlash)
      || (fileName && fileNames.has(fileName));

    if (!isAlreadyProcessed) {
      allMediaEntries.push({
        ...item,
        doc: item.doc || '',
        alt: item.alt || 'null',
        type: item.type || '',
      });
    }
  });

  const mediaDataWithCount = allMediaEntries
    .filter((item) => item.url && item.name);

  const sortedMediaData = sortMediaData(mediaDataWithCount);

  if (hasChanges) {
    await saveMediaSheet(sortedMediaData, sitePath);
  }

  const { rootFiles, folderFiles } = groupFilesByFolder(allCrawlItems);
  const savePromises = [];

  const existingLastModifiedMap = await loadAllLastModifiedData(sitePath);

  if (rootFiles.length > 0) {
    try {
      const existingRootFiles = [];
      existingLastModifiedMap.forEach((lastModified, filePath) => {
        const { relativePathParts } = splitPathParts(filePath);
        if (relativePathParts.length === 1) {
          existingRootFiles.push({ path: filePath, lastModified });
        }
      });

      const mergedRootFiles = [...existingRootFiles];
      rootFiles.forEach((newFile) => {
        const existingIndex = mergedRootFiles.findIndex((f) => f.path === newFile.path);
        if (existingIndex >= 0) {
          mergedRootFiles[existingIndex] = newFile;
        } else {
          mergedRootFiles.push(newFile);
        }
      });

      savePromises.push(saveLastModifiedData(sitePath, 'root', mergedRootFiles));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[SCAN] Failed to merge root file lastModified data:', error);
    }
  }

  for (const [folderName, files] of Object.entries(folderFiles)) {
    if (files.length > 0) {
      try {
        const existingFolderFiles = [];
        existingLastModifiedMap.forEach((lastModified, filePath) => {
          const { relativePathParts } = splitPathParts(filePath);
          if (relativePathParts.length > 1 && relativePathParts[0] === folderName) {
            existingFolderFiles.push({ path: filePath, lastModified });
          }
        });

        const mergedFolderFiles = [...existingFolderFiles];
        files.forEach((newFile) => {
          const existingIndex = mergedFolderFiles.findIndex((f) => f.path === newFile.path);
          if (existingIndex >= 0) {
            mergedFolderFiles[existingIndex] = newFile;
          } else {
            mergedFolderFiles.push(newFile);
          }
        });

        savePromises.push(saveLastModifiedData(sitePath, folderName, mergedFolderFiles));
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`[SCAN] Failed to merge folder lastModified data for ${folderName}:`, error);
      }
    }
  }

  if (savePromises.length > 0) {
    try {
      await Promise.all(savePromises);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('[SCAN] Failed to save some lastModified data files:', error);
    }
  }

  await removeScanLock(sitePath);

  const duration = getDuration();
  return {
    duration: `${duration}s`,
    hasChanges,
    mediaData: hasChanges ? sortedMediaData : null,
  };
}
