import { fetchFromAdminAPI, loadMeta, saveMeta, isMetaStale } from './admin-api.js';
import { getGroupingKey } from './filters.js';

export async function fetchMediaLog(org, repo, ref = 'main', since = null, limit = 1000, onPageLoaded = null) {
  return fetchFromAdminAPI('medialog', org, repo, ref, since, limit, onPageLoaded);
}

export function getMediaLogMetaPath(sitePath) {
  return `${sitePath}/.da/mediaindex/medialog-meta.json`;
}

export async function loadLogMeta(sitePath) {
  return loadMeta(getMediaLogMetaPath(sitePath));
}

export async function saveLogMeta(sitePath, meta) {
  return saveMeta(meta, getMediaLogMetaPath(sitePath));
}

export { isMetaStale };

function normalizeDocPath(sourcePath) {
  if (!sourcePath) return '';

  // Strip query params and hash
  const [cleanPath] = sourcePath.split('?')[0].split('#');
  let path = cleanPath;

  if (path.includes('://')) {
    try {
      const urlObj = new URL(path);
      path = urlObj.pathname;
    } catch {
      // Invalid URL, continue with original path
    }
  }

  if (!path.startsWith('/')) {
    path = `/${path}`;
  }

  // Check if this is a media file (not a document)
  const isMediaFile = /\.(png|jpg|jpeg|gif|svg|webp|mp4|webm|pdf|mov|ico|bmp|avi|mkv|flv)$/i.test(path);
  if (isMediaFile) {
    return ''; // Media file, not a document
  }

  // Normalize to .html if it's a path without extension
  if (!path.endsWith('/') && !path.endsWith('.html') && !path.includes('.')) {
    path = `${path}.html`;
  }

  return path;
}

function inferMediaType(path, contentType) {
  // Strip query params and hash before extracting extension
  const cleanPath = path.split('?')[0].split('#')[0];
  const extension = cleanPath.split('.').pop()?.toLowerCase() || '';

  if (contentType) {
    if (contentType.startsWith('image/')) {
      return `img > ${extension}`;
    }
    if (contentType.startsWith('video/')) {
      return `video > ${extension}`;
    }
    if (contentType.includes('pdf')) {
      return 'document > pdf';
    }
  }

  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
  const videoExts = ['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv'];
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'];

  if (imageExts.includes(extension)) {
    return `img > ${extension}`;
  }
  if (videoExts.includes(extension)) {
    return `video > ${extension}`;
  }
  if (docExts.includes(extension)) {
    return `document > ${extension}`;
  }
  if (extension === 'html' && cleanPath.includes('/fragments')) {
    return 'fragment > html';
  }

  return `media > ${extension}`;
}

function isPdfSvgOrFragment(path) {
  return /\.(pdf|svg)$/i.test(path)
         || (path.includes('/fragments/') && !path.includes('.'));
}

function inferTypeFromPath(path, ext) {
  if (ext === 'pdf') return 'document > pdf';
  if (ext === 'svg') return 'img > svg';
  if (path.includes('/fragments/') && !path.includes('.')) return 'fragment > html';
  return `media > ${ext}`;
}

export function processMediaLog(entries) {
  if (!entries || entries.length === 0) return [];

  const ONE_EIGHTY_DAYS_MS = 180 * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - ONE_EIGHTY_DAYS_MS;

  return entries
    .filter((entry) => entry.timestamp > cutoffTime)
    // TODO: Add delete operation handling when API team confirms behavior
    .filter((entry) => entry.operation !== 'delete')
    .map((entry) => {
      const {
        path,
        originalFilename,
        operation,
        timestamp,
        contentType,
        resourcePath,
        user,
        mediaHash,
        width,
        height,
      } = entry;

      if (!path) return null;

      // Name extraction based on operation type
      let name;
      let sourcePath;
      if (operation === 'ingest' && originalFilename) {
        name = originalFilename.split('/').pop() || originalFilename;
        sourcePath = originalFilename;
      } else {
        // For 'reuse' or when originalFilename is absent, extract from path URL
        const cleanPath = path.split('?')[0].split('#')[0];
        name = cleanPath.split('/').pop() || path;
        sourcePath = cleanPath;
      }

      // Document path based on operation type
      const docPath = resourcePath ? normalizeDocPath(resourcePath) : '';

      // Type inference
      const type = inferMediaType(sourcePath, contentType);

      return {
        url: path,
        name,
        sourcePath,
        alt: '',
        type,
        doc: docPath,
        timestamp,
        user: user || 'Unknown',
        operation,
        mediaHash: mediaHash || '',
        width: width || '',
        height: height || '',
        source: 'medialog',
      };
    })
    .filter((entry) => entry !== null);
}

export function processAuditLog(entries, org, repo, ref = 'main') {
  if (!entries || entries.length === 0) return [];

  const ONE_EIGHTY_DAYS_MS = 180 * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - ONE_EIGHTY_DAYS_MS;

  return entries
    .filter((entry) => entry.timestamp > cutoffTime)
    .filter((entry) => entry.route === 'preview')
    .filter((entry) => isPdfSvgOrFragment(entry.path))
    .map((entry) => {
      const cleanPath = entry.path.split('?')[0].split('#')[0];
      const ext = cleanPath.split('.').pop()?.toLowerCase() || '';

      return {
        url: `https://${ref}--${repo}--${org}.aem.page${entry.path}`,
        name: cleanPath.split('/').pop() || entry.path,
        sourcePath: entry.path,
        alt: '',
        type: inferTypeFromPath(entry.path, ext),
        doc: '',
        timestamp: entry.timestamp,
        user: entry.user || 'Unknown',
        operation: 'ingest',
        mediaHash: '',
        width: '',
        height: '',
        source: 'auditlog',
      };
    });
}

export function combineMediaSources(medialogEntries, auditlogEntries, org, repo, ref = 'main') {
  const medialogProcessed = processMediaLog(medialogEntries);
  const auditlogProcessed = processAuditLog(auditlogEntries, org, repo, ref);

  const combined = [...medialogProcessed, ...auditlogProcessed];

  const ingestMap = new Map();
  const reuseEntries = [];

  combined.forEach((entry) => {
    const groupKey = getGroupingKey(entry);

    if (entry.operation === 'ingest' && (!entry.doc || entry.doc === '')) {
      if (!ingestMap.has(groupKey) || entry.timestamp > ingestMap.get(groupKey).timestamp) {
        ingestMap.set(groupKey, entry);
      }
    } else {
      reuseEntries.push(entry);
    }
  });

  return [...Array.from(ingestMap.values()), ...reuseEntries]
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function mergeLogEntries(existingData, newLogEntries) {
  if (!newLogEntries || newLogEntries.length === 0) {
    return existingData;
  }

  const newProcessedData = processMediaLog(newLogEntries);

  if (!existingData || existingData.length === 0) {
    return newProcessedData;
  }

  const eventMap = new Map();

  existingData.forEach((item) => {
    const groupKey = getGroupingKey(item);
    const key = `${groupKey}|${item.doc || ''}|${item.timestamp}|${item.operation || item.action || ''}`;
    eventMap.set(key, item);
  });

  newProcessedData.forEach((item) => {
    const groupKey = getGroupingKey(item);
    const key = `${groupKey}|${item.doc || ''}|${item.timestamp}|${item.operation}`;
    eventMap.set(key, item);
  });

  const ONE_EIGHTY_DAYS_MS = 180 * 24 * 60 * 60 * 1000;
  const cutoffTime = Date.now() - ONE_EIGHTY_DAYS_MS;

  return Array.from(eventMap.values())
    .filter((item) => item.timestamp > cutoffTime);
}
