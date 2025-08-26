// nx/blocks/media-library/utils/processing.js

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
  getMediaType,
  isSvgFile,
  getSubtype,
  urlsMatch,
  sortMediaData,
} from './utils.js';

// ============================================================================
// PERSISTENCE FUNCTIONS
// ============================================================================

/**
 * Centralized path configuration for media-library module
 * All paths should be generated through these functions to avoid hardcoding
 */

export function getMediaLibraryPath(org, repo) {
  return `/${org}/${repo}/.da/mediaindex`;
}

export function getMediaSheetPath(org, repo) {
  return `${getMediaLibraryPath(org, repo)}/media.json`;
}

export function getScanLockPath(org, repo) {
  return `${getMediaLibraryPath(org, repo)}/scan-lock.json`;
}

export function getLastModifiedDataPath(org, repo, folderName = 'root') {
  return `${getMediaLibraryPath(org, repo)}/lastmodified-data/${folderName}.json`;
}

export async function saveMediaSheet(data, org, repo) {
  const path = getMediaSheetPath(org, repo);
  const formData = await createSheet(data);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

export async function loadMediaSheet(org, repo) {
  const path = getMediaSheetPath(org, repo);

  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);

    if (resp.ok) {
      const data = await resp.json();
      const result = data.data || data || [];
      return result;
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error loading media.json:', error);
  }
  return [];
}

// ============================================================================
// MEDIA PARSING FUNCTIONS
// ============================================================================

export function resolveMediaUrl(src, docPath) {
  if (!src) return null;

  // Handle absolute URLs
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }

  // Handle data URLs
  if (src.startsWith('data:')) {
    return src;
  }

  // Handle relative URLs
  if (src.startsWith('/')) {
    return `${CONTENT_ORIGIN}${src}`;
  }

  // Handle relative paths
  const docDir = docPath.substring(0, docPath.lastIndexOf('/') + 1);
  const relativePath = docDir + src;
  return `${CONTENT_ORIGIN}${relativePath}`;
}

export function extractRelativePath(fullPath) {
  if (!fullPath) return '';

  // Remove protocol and domain
  const url = new URL(fullPath);
  return url.pathname;
}

function extractSurroundingContext(element, maxLength = 100) {
  const context = [];

  let parent = element.parentElement;
  let depth = 0;
  while (parent && depth < 3) {
    const text = parent.textContent?.trim();
    if (text && text.length > 10) {
      context.push(text.substring(0, maxLength));
    }
    parent = parent.parentElement;
    depth += 1;
  }

  const siblings = Array.from(element.parentElement?.children || []);
  siblings.forEach((sibling) => {
    if (sibling !== element && sibling.textContent) {
      const text = sibling.textContent.trim();
      if (text && text.length > 5) {
        context.push(text.substring(0, maxLength));
      }
    }
  });

  return context.slice(0, 3).join(' ').substring(0, maxLength);
}

function captureContext(element, type) {
  const context = [];

  // Add the element type
  context.push(type);

  // Capture div classes for context - look for any div with classes
  let divElement = element;
  while (divElement && divElement !== document.body) {
    if (divElement.tagName === 'DIV' && divElement.className) {
      const classes = divElement.className.split(' ').filter((c) => c.trim());
      if (classes.length > 0) {
        context.push(`In div: ${classes.join(' ')}`);
        break; // Only capture the closest div with classes
      }
    }
    divElement = divElement.parentElement;
  }

  // Capture meaningful text around the media
  const surroundingText = extractSurroundingContext(element);
  if (surroundingText) {
    context.push(`text: ${surroundingText}`);
  }

  return context.join(' > ');
}

export function parseHtmlMedia(html, docPath, lastModified) {
  const mediaItems = [];
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const docTimestamp = lastModified;

  // Parse images
  const images = doc.querySelectorAll('img');
  images.forEach((img) => {
    if (img.src && isMediaFile(extractFileExtension(img.src))) {
      const resolvedUrl = resolveMediaUrl(img.src, docPath);
      const fileExt = extractFileExtension(img.src);
      const mediaType = detectMediaTypeFromExtension(fileExt);
      const hash = createHash(`${img.src}|${img.alt || ''}|${docPath}`);
      const context = captureContext(img, 'img');

      mediaItems.push({
        url: resolvedUrl,
        name: img.src.split('/').pop(),
        alt: img.alt || '',
        type: `${mediaType} > ${fileExt.toLowerCase()}`,
        doc: docPath,
        ctx: context,
        hash,
        firstUsedAt: docTimestamp,
        lastUsedAt: docTimestamp,
      });
    }
  });

  // Parse videos
  const videos = doc.querySelectorAll('video');
  videos.forEach((video) => {
    if (video.src && isMediaFile(extractFileExtension(video.src))) {
      const resolvedUrl = resolveMediaUrl(video.src, docPath);
      const fileExt = extractFileExtension(video.src);
      const hash = createHash(`${video.src}|${''}|${docPath}`);
      const context = captureContext(video, 'video');

      mediaItems.push({
        url: resolvedUrl,
        name: video.src.split('/').pop(),
        alt: '',
        type: `video > ${fileExt.toLowerCase()}`,
        doc: docPath,
        ctx: context,
        hash,
        firstUsedAt: docTimestamp,
        lastUsedAt: docTimestamp,
      });
    }
  });

  // Parse video sources
  const sources = doc.querySelectorAll('video source');
  sources.forEach((source) => {
    if (source.src && isMediaFile(extractFileExtension(source.src))) {
      const resolvedUrl = resolveMediaUrl(source.src, docPath);
      const fileExt = extractFileExtension(source.src);
      const hash = createHash(`${source.src}|${''}|${docPath}`);
      const context = captureContext(source, 'video-source');

      mediaItems.push({
        url: resolvedUrl,
        name: source.src.split('/').pop(),
        alt: '',
        type: `video-source > ${fileExt.toLowerCase()}`,
        doc: docPath,
        ctx: context,
        hash,
        firstUsedAt: docTimestamp,
        lastUsedAt: docTimestamp,
      });
    }
  });

  // Parse links to media files
  const links = doc.querySelectorAll('a[href]');
  links.forEach((link) => {
    const href = link.getAttribute('href');
    if (href && isMediaFile(extractFileExtension(href))) {
      const resolvedUrl = resolveMediaUrl(href, docPath);
      const fileExt = extractFileExtension(href);
      const hash = createHash(`${href}|${link.textContent || ''}|${docPath}`);
      const context = captureContext(link, 'link');

      mediaItems.push({
        url: resolvedUrl,
        name: href.split('/').pop(),
        alt: link.textContent || '',
        type: `link > ${fileExt.toLowerCase()}`,
        doc: docPath,
        ctx: context,
        hash,
        firstUsedAt: docTimestamp,
        lastUsedAt: docTimestamp,
      });
    }
  });

  return mediaItems;
}

// ============================================================================
// MEDIA STATISTICS FUNCTIONS
// ============================================================================

export function getMediaCounts(mediaData) {
  if (!mediaData) return {};

  const uniqueMedia = new Set();
  const uniqueImages = new Set();
  const uniqueVideos = new Set();
  const uniqueDocuments = new Set();
  const uniqueLinks = new Set();
  const uniqueIcons = new Set();
  const uniqueUsed = new Set();
  const uniqueUnused = new Set();
  const uniqueMissingAlt = new Set();

  mediaData.forEach((media) => {
    const mediaUrl = media.url || '';
    uniqueMedia.add(mediaUrl);

    const mediaType = getMediaType(media);
    const isSvg = isSvgFile(media);

    if (isSvg) {
      uniqueIcons.add(mediaUrl);
    } else if (mediaType === 'image') {
      uniqueImages.add(mediaUrl);
    } else if (mediaType === 'video') {
      uniqueVideos.add(mediaUrl);
    } else if (mediaType === 'document') {
      uniqueDocuments.add(mediaUrl);
    } else if (mediaType === 'link') {
      uniqueLinks.add(mediaUrl);
    }

    if (media.doc && media.doc.trim()) {
      uniqueUsed.add(mediaUrl);
    } else {
      uniqueUnused.add(mediaUrl);
    }

    if (!media.alt && media.type && media.type.startsWith('img >') && !isSvg) {
      uniqueMissingAlt.add(mediaUrl);
    }
  });

  return {
    total: uniqueMedia.size,
    images: uniqueImages.size,
    videos: uniqueVideos.size,
    documents: uniqueDocuments.size,
    links: uniqueLinks.size,
    icons: uniqueIcons.size,
    used: uniqueUsed.size,
    unused: uniqueUnused.size,
    missingAlt: uniqueMissingAlt.size,
  };
}

export function getDocumentMediaBreakdown(mediaData, documentPath) {
  if (!mediaData || !documentPath) return null;

  const documentMedia = mediaData.filter((media) => media.doc === documentPath);
  const breakdown = getMediaCounts(documentMedia);

  return {
    ...breakdown,
    total: documentMedia.length,
  };
}

export function getAvailableSubtypes(mediaData, activeFilter = 'links') {
  if (!mediaData || activeFilter !== 'links') return [];

  const subtypes = new Map();

  mediaData.forEach((media) => {
    const type = media.type || '';
    if (type.includes(' > ')) {
      const baseType = type.split(' > ')[0];
      if (activeFilter === 'links' && baseType === 'link') {
        const subtype = getSubtype(media);
        if (subtype) {
          const normalizedSubtype = subtype.toUpperCase().trim();
          const mediaUrl = media.url || '';

          if (!subtypes.has(normalizedSubtype)) {
            subtypes.set(normalizedSubtype, new Set());
          }
          subtypes.get(normalizedSubtype).add(mediaUrl);
        }
      }
    }
  });

  return Array.from(subtypes.entries())
    .map(([subtype, uniqueUrls]) => ({ subtype, count: uniqueUrls.size }))
    .sort((a, b) => a.subtype.localeCompare(b.subtype));
}

// ============================================================================
// MEDIA SCANNING FUNCTIONS
// ============================================================================

// LastModified tracking functions
async function getLastModifiedPath(org, repo, folderName = 'root') {
  return getLastModifiedDataPath(org, repo, folderName);
}

async function saveLastModifiedData(org, repo, folderName, data) {
  const path = await getLastModifiedPath(org, repo, folderName);
  const formData = await createSheet(data);
  return daFetch(`${DA_ORIGIN}/source${path}`, {
    method: 'PUT',
    body: formData,
  });
}

async function loadAllLastModifiedData(org, repo) {
  const lastModifiedMap = new Map();

  // Use crawl API to discover and load JSON files in .da/mediaindex/lastmodified-data
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
        // Individual file load failed, continue with others
        console.warn(`Failed to load ${item.path}:`, error);
      }
    }
  };

  const lastModifiedDataPath = `${getMediaLibraryPath(org, repo)}/lastmodified-data`;
  const { results } = crawl({ path: lastModifiedDataPath, callback });
  await results;

  return lastModifiedMap;
}

function groupFilesByFolder(crawlItems) {
  const rootFiles = [];
  const folderFiles = {};

  crawlItems.forEach((item) => {
    // Extract extension from path
    const ext = extractFileExtension(item.path);

    // Only include HTML and media files
    if (ext === 'html' || isMediaFile(ext)) {
      const fileInfo = {
        path: item.path,
        lastModified: item.lastModified,
      };

      const { relativePathParts } = splitPathParts(item.path);

      if (relativePathParts.length === 1) {
        // Root level file
        rootFiles.push(fileInfo);
      } else if (relativePathParts.length > 1) {
        // Folder file
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

function getMediaSheetLastModifiedKey(org, repo) {
  return `${org}-${repo}-media-lastupdated`;
}

function getMediaSheetLastModified(org, repo) {
  const key = getMediaSheetLastModifiedKey(org, repo);
  const stored = localStorage.getItem(key);
  return stored ? parseInt(stored, 10) : null;
}

function setMediaSheetLastModified(org, repo, timestamp) {
  const key = getMediaSheetLastModifiedKey(org, repo);
  localStorage.setItem(key, timestamp.toString());
}

export async function checkMediaSheetModified(org, repo) {
  try {
    const mediaFolderPath = getMediaLibraryPath(org, repo);
    const mediaSheetPath = getMediaSheetPath(org, repo);

    const lastMediaSheetModified = getMediaSheetLastModified(org, repo);

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

    setMediaSheetLastModified(org, repo, lastModified);

    return { hasChanged, fileTimestamp: lastModified };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error checking media.json modification:', error);
    return { hasChanged: true, fileTimestamp: null };
  }
}

export async function createScanLock(org, repo) {
  const path = getScanLockPath(org, repo);
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

export async function checkScanLock(org, repo) {
  const path = getScanLockPath(org, repo);
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (resp.ok) {
      const data = await resp.json();
      return data.data || data;
    }
  } catch (error) {
    // Lock doesn't exist
  }
  return { exists: false, locked: false, timestamp: null };
}

export async function removeScanLock(org, repo) {
  const path = getScanLockPath(org, repo);
  return daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
}

export default async function runScan(path, updateTotal) {
  // Extract org and repo from path (format: /{org}/{repo})
  const pathParts = path.split('/').filter((part) => part);
  const org = pathParts[0];
  const repo = pathParts[1];
  let totalPagesScanned = 0;
  let totalMediaFilesFound = 0; // Count of actual media files found during crawl
  const allMediaUsage = [];
  const unusedMedia = [];
  const allCrawlItems = []; // Collect all crawl items for lastModified tracking

  const existingLock = await checkScanLock(org, repo);
  if (existingLock.exists && existingLock.locked) {
    const lockAge = Date.now() - existingLock.timestamp;
    const maxLockAge = 30 * 60 * 1000;

    if (lockAge < maxLockAge) {
      throw new Error(`Scan already in progress. Lock created ${Math.round(lockAge / 1000 / 60)} minutes ago.`);
    } else {
      await removeScanLock(org, repo);
    }
  }

  await createScanLock(org, repo);

  const existingMediaData = await loadMediaSheet(org, repo) || [];

  // Load existing lastModified data for change detection
  const lastModifiedMap = await loadAllLastModifiedData(org, repo);

  console.log('📋 LastModified map loaded:', {
    mapSize: lastModifiedMap.size,
    isFirstScan: lastModifiedMap.size === 0,
    sampleEntries: Array.from(lastModifiedMap.entries()).slice(0, 3),
  });

  const mediaInUse = new Set();

  const callback = async (item) => {
    const ext = extractFileExtension(item.path);

    // Count ALL files discovered (before lastModified check)
    if (ext === 'html') {
      totalPagesScanned += 1;
      updateTotal('page', totalPagesScanned);
    } else if (isMediaFile(ext)) {
      totalMediaFilesFound += 1;
      updateTotal('media', totalMediaFilesFound);
    }

    // Check if file was modified (for both HTML and media files)
    const existingLastModified = lastModifiedMap.get(item.path);
    if (existingLastModified && existingLastModified === item.lastModified) {
      // File unchanged - skip processing but counters already updated
      return;
    }

    if (ext === 'html') {
      try {
        const resp = await daFetch(`${DA_ORIGIN}/source${item.path}`);
        if (resp.ok) {
          const html = await resp.text();
          // Strip org/repo from path for storage (keep only the relative path)
          const relativePath = item.path.split('/').slice(3).join('/');
          const mediaItems = parseHtmlMedia(html, `/${relativePath}`, item.lastModified);

          mediaItems.forEach((mediaItem) => {
            mediaInUse.add(mediaItem.url);
            allMediaUsage.push(mediaItem);
          });
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Error processing ${item.path}:`, error);
      }
    } else if (isMediaFile(ext)) {
      // This is an actual media file found during crawl
      // This is a media file that might be unused
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
          ctx: 'file',
          hash,
        };

        unusedMedia.push(unusedMediaItem);
      }
    }

    // Update lastModified data for this item since it was processed
    if (existingLastModified !== item.lastModified) {
      // Update the map immediately
      lastModifiedMap.set(item.path, item.lastModified);
    }

    // Collect for lastModified tracking
    allCrawlItems.push(item);
  };

  const { results, getDuration } = crawl({ path, callback });
  await results;

  console.log('🔍 Crawl completed:', {
    totalCrawlItems: allCrawlItems.length,
    totalMediaUsage: allMediaUsage.length,
    totalUnusedMedia: unusedMedia.length,
  });

  // Process results and save to media.json
  const allMediaEntries = [];
  const processedUrls = new Set();
  let hasActualChanges = false;

  // First, preserve ALL existing entries - be very conservative
  existingMediaData.forEach((item) => {
    allMediaEntries.push(item);
    processedUrls.add(item.url);
  });

  // Deduplicate allMediaUsage by hash to prevent multiple comparisons of the same usage
  const uniqueMediaUsage = [];
  const seenHashes = new Set();

  allMediaUsage.forEach((usage) => {
    if (!seenHashes.has(usage.hash)) {
      uniqueMediaUsage.push(usage);
      seenHashes.add(usage.hash);
    }
  });

  // Then, replace/add new usage entries
  uniqueMediaUsage.forEach((usage) => {
    // Find existing entry by hash (unique per url+doc+alt combination)
    const existingIndex = allMediaEntries.findIndex((entry) => entry.hash === usage.hash);
    if (existingIndex !== -1) {
      const existingEntry = allMediaEntries[existingIndex];

      // Hash should be the same since we found it, but check for other changes
      const hasChanges = existingEntry.lastUsedAt !== usage.lastUsedAt
                        || existingEntry.ctx !== usage.ctx
                        || existingEntry.type !== usage.type;

      if (hasChanges) {
        hasActualChanges = true;
      }

      // Preserve firstUsedAt from existing entry
      usage.firstUsedAt = existingEntry.firstUsedAt || usage.firstUsedAt;

      // Find all documents that use this media URL and get the most recent lastModified
      const allUsagesOfThisUrl = allMediaUsage.filter((u) => urlsMatch(u.url, usage.url));
      const allDocPaths = allUsagesOfThisUrl.map((u) => u.doc).filter(Boolean);
      const allLastModifieds = allDocPaths
        .map((docPath) => lastModifiedMap.get(docPath))
        .filter(Boolean);
      const mostRecentLastModified = allLastModifieds.length > 0
        ? Math.max(...allLastModifieds)
        : usage.lastUsedAt;

      usage.lastUsedAt = mostRecentLastModified;

      allMediaEntries.splice(existingIndex, 1);
    } else {
      hasActualChanges = true;
    }
    allMediaEntries.push(usage);
    processedUrls.add(usage.url);
  });

  // Finally, add unused media that aren't already processed
  unusedMedia.forEach((item) => {
    // Check if this URL is already processed using urlsMatch
    const isAlreadyProcessed = Array.from(processedUrls).some(
      (processedUrl) => urlsMatch(processedUrl, item.url),
    );
    if (!isAlreadyProcessed) {
      allMediaEntries.push({
        ...item,
        doc: item.doc || '',
        alt: item.alt || '',
        type: item.type || '',
        ctx: item.ctx || '',
      });
      // New unused media - this is a change
      hasActualChanges = true;
    }
  });

  const mediaDataWithCount = allMediaEntries
    .filter((item) => item.url && item.name);

  // Sort media data at scan time for better performance
  const sortedMediaData = sortMediaData(mediaDataWithCount);

  if (hasActualChanges) {
    await saveMediaSheet(sortedMediaData, org, repo);
  }

  // Save lastModified data for next scan - only if changed
  const { rootFiles, folderFiles } = groupFilesByFolder(allCrawlItems);

  console.log('📁 Grouped files:', {
    rootFiles: rootFiles.length,
    folderFiles: Object.keys(folderFiles).length,
    totalCrawlItems: allCrawlItems.length,
  });

  // Always save lastModified data files during scan (simplified approach)
  const savePromises = [];

  console.log('💾 Saving all lastModified data files...');

  // Always save root files
  if (rootFiles.length > 0) {
    try {
      console.log('💾 Saving root.json with', rootFiles.length, 'files');
      savePromises.push(saveLastModifiedData(org, repo, 'root', rootFiles));
    } catch (error) {
      console.error('Error saving root.json:', error);
    }
  }

  // Always save folder files
  for (const [folderName, files] of Object.entries(folderFiles)) {
    if (files.length > 0) {
      try {
        console.log(`💾 Saving ${folderName}.json with`, files.length, 'files');
        savePromises.push(saveLastModifiedData(org, repo, folderName, files));
      } catch (error) {
        console.error(`Error saving ${folderName}.json:`, error);
      }
    }
  }

  // Save all files in parallel (non-blocking)
  if (savePromises.length > 0) {
    try {
      await Promise.all(savePromises);
      console.log('✅ All lastModified data files saved successfully');
    } catch (error) {
      console.error('Error saving lastModified data files:', error);
    }
  }

  await removeScanLock(org, repo);

  const duration = getDuration();
  return {
    duration: `${duration}s`,
    hasChanges: hasActualChanges,
    mediaData: hasActualChanges ? mediaDataWithCount : null,
  };
}
