import { getMediaType, isSvgFile, getBasePath, formatDocPath, pluralize } from './utils.js';
import {
  Operation,
  MEDIA_UNDERSCORE_PREFIX,
} from './constants.js';

const processDataCache = new Map();
const MAX_CACHE_SIZE = 5;

function normalizeFolderPath(path) {
  return !path || path === '/' ? '/' : path.replace(/\/$/, '');
}

function resolveSearchPath(value, basePath) {
  let searchPath = value.startsWith('/') ? value : `/${value}`;
  if (basePath && !searchPath.startsWith(basePath)) {
    searchPath = searchPath === '/' ? basePath : `${basePath}${searchPath}`;
  }
  return searchPath;
}

export const FILTER_CONFIG = {
  all: (item) => !isSvgFile(item),
  documents: (item) => getMediaType(item) === 'document',
  fragments: (item) => getMediaType(item) === 'fragment',
  images: (item) => getMediaType(item) === 'image' && !isSvgFile(item),
  icons: (item) => isSvgFile(item),
  links: (item) => item.operation === Operation.EXTLINKS
    || item.operation === Operation.MARKDOWN_PARSED || getMediaType(item) === 'link',
  noReferences: (item) => item.status === 'unused',
  videos: (item) => getMediaType(item) === 'video',

  documentImages: (item, selectedDocument) => FILTER_CONFIG.images(item)
  && item.doc === selectedDocument,
  documentIcons: (item, selectedDocument) => FILTER_CONFIG.icons(item)
  && item.doc === selectedDocument,
  documentVideos: (item, selectedDocument) => FILTER_CONFIG.videos(item)
   && item.doc === selectedDocument,
  documentDocuments: (item, selectedDocument) => FILTER_CONFIG.documents(item)
   && item.doc === selectedDocument,
  documentFragments: (item, selectedDocument) => FILTER_CONFIG.fragments(item)
   && item.doc === selectedDocument,
  documentLinks: (item, selectedDocument) => FILTER_CONFIG.links(item)
   && item.doc === selectedDocument,

  documentTotal: (item, selectedDocument) => item.doc === selectedDocument,
};

export function applyFilter(data, filterName, selectedDocument) {
  const filterFn = FILTER_CONFIG[filterName];

  if (filterFn) {
    if (filterName.startsWith('document')) {
      return data.filter((item) => filterFn(item, selectedDocument));
    }
    return data.filter(filterFn);
  }

  return data;
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

function initializeProcessedData() {
  const filterArrays = {};
  const usageData = {};
  const filterCounts = {};

  Object.keys(FILTER_CONFIG).forEach((filterName) => {
    if (!filterName.startsWith('document')) {
      filterArrays[filterName] = [];
    }
  });

  return {
    filterArrays,
    usageData,
    filterCounts,
    totalCount: 0,
  };
}

export function getDedupeKey(url) {
  if (!url) return '';

  try {
    const urlObj = new URL(url);
    const { pathname } = urlObj;
    const filename = pathname.split('/').pop();

    if (filename && filename.includes(MEDIA_UNDERSCORE_PREFIX)) {
      return filename;
    }

    return pathname;
  } catch (error) {
    return url.split('?')[0];
  }
}

export async function processMediaData(mediaData, onProgress = null) {
  if (!mediaData || mediaData.length === 0) {
    return initializeProcessedData();
  }

  const cacheKey = `${mediaData.length}-${mediaData[0]?.hash || ''}-${mediaData[mediaData.length - 1]?.hash || ''}`;

  if (processDataCache.has(cacheKey)) {
    const cached = processDataCache.get(cacheKey);
    if (onProgress) onProgress(100);
    return cached;
  }

  const processedData = initializeProcessedData();
  const uniqueMediaUrls = new Set();
  const uniqueNonSvgUrls = new Set();

  let batchSize = 1000;
  const hasComplexData = mediaData.some((item) => item.doc);

  if (mediaData.length > 100000) {
    batchSize = hasComplexData ? 300 : 500;
  } else if (mediaData.length > 10000) {
    batchSize = hasComplexData ? 200 : 250;
  } else if (mediaData.length > 1000) {
    batchSize = hasComplexData ? 100 : 200;
  }

  const batches = chunkArray(mediaData, batchSize);
  const totalBatches = batches.length;

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];

    batch.forEach((item) => {
      if (!item.hash) return;

      if (item.url) {
        const groupingKey = getDedupeKey(item.url);
        if (!processedData.usageData[groupingKey]) {
          processedData.usageData[groupingKey] = {
            hashes: [],
            uniqueDocs: new Set(),
            count: 0,
          };
        }
        processedData.usageData[groupingKey].hashes.push(item.hash);
        if (item.doc) {
          processedData.usageData[groupingKey].uniqueDocs.add(item.doc);
        }
        const usageData = processedData.usageData[groupingKey];
        usageData.count = usageData.hashes.length;
      }

      Object.keys(processedData.filterArrays).forEach((filterName) => {
        try {
          if (FILTER_CONFIG[filterName](item)) {
            processedData.filterArrays[filterName].push(item.hash);
          }
        } catch {
          /* continue */
        }
      });

      if (item.url) {
        uniqueMediaUrls.add(item.url);
        if (!isSvgFile(item)) {
          uniqueNonSvgUrls.add(item.url);
        }
      }
    });

    if (onProgress) {
      onProgress(((i + 1) / totalBatches) * 100);
    }

    if (i < batches.length - 1) {
      if (mediaData.length > 100000 && i % 5 === 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1);
        });
      } else if (mediaData.length > 10000 && i % 3 === 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, 1);
        });
      } else {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });
      }
    }
  }

  const hashToItemMap = new Map();
  const groupingKeyToUrl = new Map();

  mediaData.forEach((item) => {
    if (item.hash) {
      hashToItemMap.set(item.hash, item);
    }
    if (item.url) {
      const groupingKey = getDedupeKey(item.url);
      groupingKeyToUrl.set(groupingKey, item.url);
    }
  });

  Object.keys(processedData.filterArrays).forEach((filterName) => {
    const uniqueUrls = new Set();
    processedData.filterArrays[filterName].forEach((hash) => {
      const item = hashToItemMap.get(hash);
      if (item && item.url) {
        uniqueUrls.add(item.url);
      }
    });
    processedData.filterCounts[filterName] = uniqueUrls.size;
  });

  processedData.filterCounts.all = uniqueNonSvgUrls.size;
  processedData.totalCount = uniqueMediaUrls.size;

  if (processDataCache.size >= MAX_CACHE_SIZE) {
    const firstKey = processDataCache.keys().next().value;
    processDataCache.delete(firstKey);
  }
  processDataCache.set(cacheKey, processedData);

  return processedData;
}

export function parseColonSyntax(query) {
  if (!query) return null;

  const colonMatch = query.match(/^([a-zA-Z]+):(.*)$/);
  if (colonMatch) {
    const [, field, value] = colonMatch;
    return {
      field: field.toLowerCase(),
      value: value.trim().toLowerCase(),
      originalQuery: query,
    };
  }

  return null;
}

function filterByColonSyntax(mediaData, colonSyntax) {
  const { field, value } = colonSyntax;

  const filteredResults = mediaData.filter((item) => {
    switch (field) {
      case 'doc': {
        if (!item.doc) return false;
        const searchPath = resolveSearchPath(value, getBasePath());
        return item.doc.toLowerCase().includes(searchPath);
      }
      case 'name':
        return item.name && item.name.toLowerCase().includes(value);
      case 'url':
        return item.url && item.url.toLowerCase().includes(value);
      case 'folder': {
        if (!item.doc) return false;

        const normalizedValue = normalizeFolderPath(value);

        if (normalizedValue === '' || normalizedValue === '/') {
          return !item.doc.includes('/', 1);
        }

        const cleanPath = item.doc.replace(/\.html$/, '');
        const parts = cleanPath.split('/');

        if (parts.length > 2) {
          const folderPath = parts.slice(0, -1).join('/');
          const searchPath = resolveSearchPath(normalizedValue, getBasePath());
          return folderPath.startsWith(searchPath);
        }

        return false;
      }
      default:
        return false;
    }
  });

  return filteredResults;
}

function filterByGeneralSearch(mediaData, query) {
  const results = [];
  for (let i = 0; i < mediaData.length; i += 1) {
    const item = mediaData[i];
    if ((item.name && item.name.toLowerCase().includes(query))
        || (item.url && item.url.toLowerCase().includes(query))
        || (item.doc && item.doc.toLowerCase().includes(query))) {
      results.push(item);
    }
  }
  return results;
}

export function filterBySearch(mediaData, searchQuery) {
  if (!searchQuery || !searchQuery.trim() || !mediaData) {
    return mediaData;
  }

  const query = searchQuery.toLowerCase().trim();
  const colonSyntax = parseColonSyntax(query);

  if (colonSyntax) {
    return filterByColonSyntax(mediaData, colonSyntax);
  }

  return filterByGeneralSearch(mediaData, query);
}

function generateFolderSuggestions(folderPathsCache, value) {
  const basePath = getBasePath();

  if (!folderPathsCache || folderPathsCache.size === 0) {
    return [];
  }

  const searchPath = resolveSearchPath(value, basePath);

  const filteredPaths = Array.from(folderPathsCache).filter((folderPath) => {
    if (value === '' || value === '/') {
      return true;
    }

    if (searchPath.endsWith('/')) {
      return folderPath.startsWith(searchPath) && folderPath !== searchPath.slice(0, -1);
    }

    return folderPath.startsWith(searchPath);
  });

  const sortedPaths = filteredPaths.sort((a, b) => {
    const depthA = (a.match(/\//g) || []).length;
    const depthB = (b.match(/\//g) || []).length;
    if (depthA !== depthB) {
      return depthA - depthB;
    }
    return a.localeCompare(b);
  });

  const folderSuggestions = sortedPaths
    .map((folderPath) => {
      let displayPath = folderPath;
      if (basePath && folderPath.startsWith(basePath)) {
        displayPath = folderPath.substring(basePath.length) || '/';
        if (displayPath && !displayPath.startsWith('/')) {
          displayPath = `/${displayPath}`;
        }
      }
      return {
        type: 'folder',
        value: displayPath,
        display: displayPath,
        absolutePath: folderPath,
      };
    })
    .filter((suggestion) => {
      if (basePath && suggestion.value === '/') {
        return false;
      }
      return true;
    });

  return folderSuggestions;
}

function generateDocSuggestions(mediaData, value) {
  const basePath = getBasePath();

  if (!mediaData || mediaData.length === 0) {
    return [];
  }

  const searchPath = resolveSearchPath(value, basePath);

  const matchingDocs = new Set();

  mediaData.forEach((item) => {
    if (!item.doc) return;

    const docPath = item.doc.trim();
    if (value === '' || value === '/') {
      const cleanPath = docPath.replace(/\.html$/, '');
      if (!cleanPath.includes('/', 1)) {
        matchingDocs.add(docPath);
      }
    } else if (searchPath.endsWith('/')) {
      const cleanPath = docPath.replace(/\.html$/, '');
      const parts = cleanPath.split('/');
      if (parts.length > 1) {
        const folderPath = parts.slice(0, -1).join('/');
        if (folderPath === searchPath.slice(0, -1)) {
          matchingDocs.add(docPath);
        }
      }
    } else {
      const cleanPath = docPath.replace(/\.html$/, '');
      if (cleanPath.startsWith(searchPath)) {
        matchingDocs.add(docPath);
      }
    }
  });

  const sortedDocs = Array.from(matchingDocs).sort((a, b) => {
    const depthA = (a.match(/\//g) || []).length;
    const depthB = (b.match(/\//g) || []).length;
    if (depthA !== depthB) {
      return depthA - depthB;
    }
    return a.localeCompare(b);
  });

  const docSuggestions = sortedDocs.map((doc) => {
    const normalizedDoc = formatDocPath(doc);
    let displayPath = normalizedDoc;
    if (basePath && normalizedDoc.startsWith(basePath)) {
      displayPath = normalizedDoc.substring(basePath.length) || '/';
      if (displayPath && !displayPath.startsWith('/')) {
        displayPath = `/${displayPath}`;
      }
    }
    return {
      type: 'doc',
      value: displayPath,
      display: displayPath,
      absolutePath: doc,
    };
  });

  return docSuggestions;
}

export function generateSearchSuggestions(
  mediaData,
  query,
  createSuggestionFn,
  folderPathsCache = null,
) {
  if (!query || !query.trim() || !mediaData) {
    return [];
  }

  const q = query.toLowerCase().trim();
  const colonSyntax = parseColonSyntax(query);

  if (colonSyntax) {
    const { field, value } = colonSyntax;

    if (field === 'folder') {
      return generateFolderSuggestions(folderPathsCache, value).slice(0, 10);
    }

    if (field === 'doc') {
      return generateDocSuggestions(mediaData, value).slice(0, 10);
    }

    const suggestions = [];

    mediaData.forEach((item) => {
      switch (field) {
        case 'name': {
          if (item.name && item.name.toLowerCase().includes(value) && !isSvgFile(item)) {
            suggestions.push(createSuggestionFn(item));
          }
          break;
        }
        case 'url': {
          if (item.url && item.url.toLowerCase().includes(value) && !isSvgFile(item)) {
            suggestions.push(createSuggestionFn(item));
          }
          break;
        }
        default:
          break;
      }
    });

    return [...suggestions].slice(0, 10);
  }

  if (q.startsWith('/')) {
    const folderSuggestions = generateFolderSuggestions(folderPathsCache, q);
    const docSuggestions = generateDocSuggestions(mediaData, q);

    const combined = [...folderSuggestions, ...docSuggestions];

    combined.sort((a, b) => {
      const depthA = (a.display.match(/\//g) || []).length;
      const depthB = (b.display.match(/\//g) || []).length;
      if (depthA !== depthB) {
        return depthA - depthB;
      }
      return a.display.localeCompare(b.display);
    });

    return combined.slice(0, 10);
  }

  const suggestions = [];
  const matchingDocs = new Set();

  mediaData.forEach((item) => {
    if (item.doc && item.doc.toLowerCase().includes(q)) {
      matchingDocs.add(item.doc);
    }

    if (!isSvgFile(item) && (
      (item.name && item.name.toLowerCase().includes(q))
        || (item.url && item.url.toLowerCase().includes(q))
    )) {
      suggestions.push(createSuggestionFn(item));
    }
  });

  const docSuggestions = Array.from(matchingDocs).map((doc) => ({
    type: 'doc',
    value: formatDocPath(doc),
    display: formatDocPath(doc),
    absolutePath: doc,
  }));

  return [...docSuggestions, ...suggestions].slice(0, 10);
}

export function createSearchSuggestion(item) {
  if (!item.name && !item.url && !item.doc) return null;

  if (isSvgFile(item)) return null;

  const firstDoc = item.doc || null;

  return {
    type: 'media',
    value: item,
    display: item.name || item.url || 'Unnamed Media',
    details: {
      doc: firstDoc ? formatDocPath(firstDoc) : null,
      url: item.url,
      type: getMediaType(item),
    },
  };
}

export function filterByDocument(
  processedData,
  mediaData,
  selectedDocument,
  selectedFilterType,
) {
  if (!selectedDocument || !mediaData) {
    return [];
  }

  const documentItems = mediaData.filter((item) => item.doc === selectedDocument);

  const seenUrls = new Set();
  const uniqueDocumentItems = documentItems.filter((item) => {
    if (!item.url) return true;
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    return true;
  }).map((item) => {
    const groupingKey = getDedupeKey(item.url);
    let usageCount = item.usageCount || 1;

    if (processedData && processedData.usageData && processedData.usageData[groupingKey]) {
      usageCount = processedData.usageData[groupingKey].count;
    }

    return {
      ...item,
      usageCount,
    };
  });

  if (selectedFilterType && selectedFilterType !== 'documentTotal') {
    return applyFilter(uniqueDocumentItems, selectedFilterType, selectedDocument);
  }

  return uniqueDocumentItems;
}

export function filterByFolder(data, selectedFolder, usageIndex) {
  if (!selectedFolder || !data) {
    return data;
  }

  const normalizedFolder = normalizeFolderPath(selectedFolder);

  if (usageIndex && usageIndex.size > 0) {
    const mediaUrlsInFolder = new Set();

    const groupingKeyToMediaItem = new Map();
    data.forEach((item) => {
      const key = getDedupeKey(item.url);
      if (!groupingKeyToMediaItem.has(key)) {
        groupingKeyToMediaItem.set(key, item);
      }
    });

    usageIndex.forEach((usageEntries, groupingKey) => {
      usageEntries.forEach((entry) => {
        if (!entry.doc) return;

        let isInFolder = false;
        if (normalizedFolder === '/' || normalizedFolder === '') {
          if (!entry.doc.includes('/', 1)) {
            isInFolder = true;
          }
        } else {
          const cleanPath = entry.doc.replace(/\.html$/, '');
          const parts = cleanPath.split('/');

          if (parts.length > 2) {
            const folderPath = parts.slice(0, -1).join('/');
            const searchPath = normalizedFolder.startsWith('/') ? normalizedFolder : `/${normalizedFolder}`;
            if (folderPath.startsWith(searchPath)) {
              isInFolder = true;
            }
          }
        }

        if (isInFolder) {
          const mediaItem = groupingKeyToMediaItem.get(groupingKey);
          if (mediaItem) {
            mediaUrlsInFolder.add(mediaItem.url);
          }
        }
      });
    });

    return data.filter((item) => mediaUrlsInFolder.has(item.url));
  }

  return data.filter((item) => {
    if (!item.doc) return false;

    if (normalizedFolder === '/' || normalizedFolder === '') {
      return !item.doc.includes('/', 1);
    }

    const cleanPath = item.doc.replace(/\.html$/, '');
    const parts = cleanPath.split('/');

    if (parts.length > 2) {
      const folderPath = parts.slice(0, -1).join('/');
      const searchPath = normalizedFolder.startsWith('/') ? normalizedFolder : `/${normalizedFolder}`;
      return folderPath.startsWith(searchPath);
    }

    return false;
  });
}

export function getFilterLabel(filterType, count = 0) {
  const labels = {
    all: { singular: 'item', plural: 'items' },
    documents: { singular: 'PDF', plural: 'PDFs' },
    fragments: { singular: 'fragment', plural: 'fragments' },
    images: { singular: 'image', plural: 'images' },
    icons: { singular: 'SVG', plural: 'SVGs' },
    links: { singular: 'link', plural: 'links' },
    noReferences: { singular: 'item', plural: 'items' },
    videos: { singular: 'video', plural: 'videos' },
  };

  const label = labels[filterType] || labels.all;
  return pluralize(label.singular, label.plural, count);
}

export function computeResultSummary(mediaData, filteredData, searchQuery, filterType, options = {}) {
  const { displayCount } = options;
  const count = displayCount !== undefined ? displayCount : (filteredData?.length || 0);
  if (count === 0 && (!mediaData || mediaData.length === 0)) {
    return '';
  }
  const filterLabel = getFilterLabel(filterType, count);

  if (!searchQuery) {
    return `${count} ${filterLabel}`;
  }

  const colonSyntax = parseColonSyntax(searchQuery);

  if (colonSyntax) {
    const { field, value } = colonSyntax;

    if (field === 'folder') {
      const folderPath = value || '/';
      return `${count} ${filterLabel} in ${folderPath}`;
    }

    if (field === 'doc') {
      const docPath = value.replace(/\.html$/, '');
      return `${count} ${filterLabel} in ${docPath}`;
    }

    return `${count} ${filterLabel}`;
  }

  return `${count} ${filterLabel}`;
}

export function deduplicateAndEnrich(sourceData, processedData) {
  const uniqueItems = [];
  const seenKeys = new Set();

  sourceData.forEach((item) => {
    const groupingKey = getDedupeKey(item.url);
    if (!seenKeys.has(groupingKey)) {
      seenKeys.add(groupingKey);

      let usageCount = item.usageCount || 1;
      if (processedData && processedData.usageData
        && processedData.usageData[groupingKey]) {
        usageCount = processedData.usageData[groupingKey].count;
      }

      uniqueItems.push({
        ...item,
        usageCount,
      });
    }
  });

  return uniqueItems;
}

export function filterByDocumentUsage(uniqueItems, selectedDocument, usageIndex) {
  if (!selectedDocument || !usageIndex) {
    return uniqueItems;
  }

  const docFilteredItems = [];
  const groupingKeyToMediaItem = new Map();

  uniqueItems.forEach((item) => {
    const key = getDedupeKey(item.url);
    if (!groupingKeyToMediaItem.has(key)) {
      groupingKeyToMediaItem.set(key, item);
    }
  });

  usageIndex.forEach((usageEntries, groupingKey) => {
    const hasDocUsage = usageEntries.some((entry) => entry.doc === selectedDocument);
    if (hasDocUsage && groupingKeyToMediaItem.has(groupingKey)) {
      docFilteredItems.push(groupingKeyToMediaItem.get(groupingKey));
    }
  });

  return docFilteredItems;
}

/**
 * Filters media by search, document, folder, and type.
 * Order: search → document filter → dedupe → folder/doc-usage → type filter.
 * When selectedDocument + document* filterType, filterByDocument handles both.
 */
export function filterMedia(sourceData, options) {
  const {
    searchQuery,
    selectedDocument,
    selectedFolder,
    selectedFilterType,
    usageIndex,
    processedData,
  } = options;

  if (!sourceData || sourceData.length === 0) {
    return [];
  }

  let data = sourceData;

  if (searchQuery && searchQuery.trim()) {
    data = filterBySearch(data, searchQuery);
  }

  if (selectedDocument) {
    data = data.filter((item) => item.doc === selectedDocument);
  }

  if (selectedFilterType && selectedFilterType.startsWith('document')
      && selectedFilterType !== 'documents' && processedData) {
    return filterByDocument(
      processedData,
      data,
      selectedDocument,
      selectedFilterType,
    );
  }

  const uniqueItems = deduplicateAndEnrich(data, processedData);

  let dataWithUsageCounts = uniqueItems;
  if (selectedFolder) {
    dataWithUsageCounts = filterByFolder(
      uniqueItems,
      selectedFolder,
      usageIndex,
    );
  } else if (selectedDocument && usageIndex) {
    dataWithUsageCounts = filterByDocumentUsage(uniqueItems, selectedDocument, usageIndex);
  }

  if (selectedFilterType && selectedFilterType !== 'all') {
    return applyFilter(
      dataWithUsageCounts,
      selectedFilterType,
      selectedDocument,
    );
  }

  return dataWithUsageCounts;
}
