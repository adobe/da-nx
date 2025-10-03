import { getMediaType, isSvgFile } from './utils.js';

export const FILTER_CONFIG = {
  images: (item) => getMediaType(item) === 'image' && !isSvgFile(item),
  videos: (item) => getMediaType(item) === 'video',
  documents: (item) => getMediaType(item) === 'document',
  fragments: (item) => getMediaType(item) === 'fragment',
  links: (item) => getMediaType(item) === 'link',
  icons: (item) => isSvgFile(item),

  decorative: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && item.alt === '',
  filled: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && item.alt && item.alt !== '',

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
  documentDecorative: (item, selectedDocument) => item.type?.startsWith('img >')
   && !item.type?.includes('svg') && item.alt === '' && item.doc === selectedDocument,
  documentFilled: (item, selectedDocument) => item.doc === selectedDocument && item.type?.startsWith('img >')
   && !item.type?.includes('svg') && item.alt && item.alt !== '',

  documentTotal: (item, selectedDocument) => item.doc === selectedDocument,
  all: (item) => !isSvgFile(item),
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

export function getAvailableFilters() {
  return Object.keys(FILTER_CONFIG);
}

// Chunk array utility for batch processing
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Initialize processed data structure
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

// Get grouping key for URL deduplication (moved from media-library.js)
export function getGroupingKey(url) {
  if (!url) return '';

  try {
    const urlObj = new URL(url);
    const { pathname } = urlObj;
    const filename = pathname.split('/').pop();

    if (filename && filename.includes('media_')) {
      return filename;
    }

    return pathname;
  } catch (error) {
    return url.split('?')[0];
  }
}

// Process media data with batching and pre-calculation
export async function processMediaData(mediaData, onProgress = null) {
  if (!mediaData || mediaData.length === 0) {
    return initializeProcessedData();
  }

  const processedData = initializeProcessedData();
  const uniqueMediaUrls = new Set();
  const uniqueNonSvgUrls = new Set();

  let batchSize = 1000;
  if (mediaData.length > 100000) {
    batchSize = 500;
  } else if (mediaData.length > 10000) {
    batchSize = 250;
  }
  const batches = chunkArray(mediaData, batchSize);
  const totalBatches = batches.length;

  for (let i = 0; i < batches.length; i += 1) {
    const batch = batches[i];

    batch.forEach((item) => {
      if (!item.hash) return;

      if (item.url) {
        const groupingKey = getGroupingKey(item.url);
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
        } catch (error) {
          // Silently continue on filter error
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
  mediaData.forEach((item) => {
    if (item.hash) {
      hashToItemMap.set(item.hash, item);
    }
  });

  mediaData.forEach((item) => {
    if (item.url) {
      const groupingKey = getGroupingKey(item.url);
      const usageInfo = processedData.usageData[groupingKey];
      if (usageInfo) {
        item.usageCount = usageInfo.count || 1;
      } else {
        item.usageCount = 1;
      }
    } else {
      item.usageCount = 1;
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

  return processedData;
}

export function calculateFilteredMediaDataFromIndex(
  mediaData,
  processedData,
  filterName,
  selectedDocument,
) {
  if (!processedData || !processedData.filterArrays) {
    return [];
  }

  let filterHashes = [];

  if (filterName.startsWith('document')) {
    const baseFilterName = filterName.replace('document', '').toLowerCase();
    if (baseFilterName === 'total') {
      filterHashes = mediaData
        .filter((item) => item.doc === selectedDocument)
        .map((item) => item.hash);
    } else {
      const baseFilterFn = FILTER_CONFIG[`${baseFilterName}`];
      if (baseFilterFn) {
        filterHashes = mediaData
          .filter((item) => baseFilterFn(item) && item.doc === selectedDocument)
          .map((item) => item.hash);
      }
    }
  } else {
    filterHashes = processedData.filterArrays[filterName] || [];
  }

  const hashToItemMap = new Map();
  mediaData.forEach((item) => {
    if (item.hash) {
      hashToItemMap.set(item.hash, item);
    }
  });

  const filteredItems = filterHashes
    .map((hash) => hashToItemMap.get(hash))
    .filter((item) => item !== undefined);

  const seenUrls = new Set();
  const result = filteredItems.filter((item) => {
    if (!item.url) return true;
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    return true;
  });

  return result;
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

  if (query.startsWith('/') || query.includes('/')) {
    return {
      field: 'folder',
      value: query.toLowerCase().trim(),
      originalQuery: query,
    };
  }

  return null;
}

function filterByColonSyntax(mediaData, colonSyntax) {
  const { field, value } = colonSyntax;

  const filteredResults = mediaData.filter((item) => {
    switch (field) {
      case 'doc':
        return item.doc && item.doc.toLowerCase().includes(value);
      case 'name':
        return item.name && item.name.toLowerCase().includes(value);
      case 'alt':
        return item.alt && item.alt.toLowerCase().includes(value);
      case 'url':
        return item.url && item.url.toLowerCase().includes(value);
      case 'folder': {
        if (!item.doc) return false;

        if (value === '' || value === '/') {
          return !item.doc.includes('/', 1);
        }

        const cleanPath = item.doc.replace(/\.html$/, '');
        const parts = cleanPath.split('/');

        if (parts.length > 2) {
          const folderPath = parts.slice(0, -1).join('/');
          const searchPath = value.startsWith('/') ? value : `/${value}`;
          return folderPath === searchPath;
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
  return mediaData.filter((item) => (item.name && item.name.toLowerCase().includes(query))
    || (item.alt && item.alt.toLowerCase().includes(query))
    || (item.doc && item.doc.toLowerCase().includes(query))
            || (item.url && item.url.toLowerCase().includes(query)));
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

export function aggregateMediaData(mediaData) {
  if (!mediaData) return [];

  const aggregatedMedia = new Map();
  mediaData.forEach((item) => {
    const normalizedUrl = item.url.split('?')[0];
    if (!aggregatedMedia.has(normalizedUrl)) {
      aggregatedMedia.set(normalizedUrl, {
        ...item,
        url: normalizedUrl,
        mediaUrl: item.url,
        usageCount: 0,
        isUsed: false,
      });
    }
    const aggregated = aggregatedMedia.get(normalizedUrl);

    if (item.doc && item.doc.trim()) {
      aggregated.usageCount += 1;
      aggregated.isUsed = true;
    }
  });

  return Array.from(aggregatedMedia.values());
}

export function calculateFilteredMediaData(
  mediaData,
  selectedFilterType,
  searchQuery,
  selectedDocument,
) {
  if (!mediaData) {
    return [];
  }

  let filteredData = [...mediaData];

  if (searchQuery && searchQuery.trim()) {
    filteredData = filterBySearch(filteredData, searchQuery);
  }

  if (selectedFilterType && selectedFilterType !== 'all') {
    filteredData = applyFilter(filteredData, selectedFilterType, selectedDocument);
  }

  return filteredData;
}

function generateFolderSuggestions(mediaData, value) {
  const folderPaths = new Set();

  mediaData.forEach((item) => {
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

  const filteredPaths = Array.from(folderPaths).filter((folderPath) => {
    if (value === '' || value === '/') {
      return true;
    }
    const searchPath = value.startsWith('/') ? value : `/${value}`;
    return folderPath.startsWith(searchPath);
  });

  const folderSuggestions = filteredPaths.map((folderPath) => ({
    type: 'folder',
    value: folderPath,
    display: folderPath,
  }));

  return folderSuggestions.slice(0, 10);
}

export function generateSearchSuggestions(mediaData, query, createSuggestionFn) {
  if (!query || !query.trim() || !mediaData) {
    return [];
  }

  const suggestions = [];
  const matchingDocs = new Set();

  const colonSyntax = parseColonSyntax(query);

  if (colonSyntax) {
    const { field, value } = colonSyntax;

    if (field === 'folder') {
      return generateFolderSuggestions(mediaData, value);
    }

    mediaData.forEach((item) => {
      switch (field) {
        case 'doc': {
          if (item.doc && item.doc.toLowerCase().includes(value)) {
            matchingDocs.add(item.doc);
          }
          break;
        }
        case 'alt': {
          if (item.alt && item.alt.toLowerCase().includes(value) && !isSvgFile(item)) {
            suggestions.push(createSuggestionFn(item));
          }
          break;
        }
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

    const docSuggestions = Array.from(matchingDocs).map((doc) => ({
      type: 'doc',
      value: doc,
      display: doc,
    }));

    return [...docSuggestions, ...suggestions].slice(0, 10);
  }

  const q = query.toLowerCase().trim();

  if (q === '/') {
    mediaData.forEach((item) => {
      if (item.doc && !item.doc.includes('/', 1)) {
        suggestions.push(createSuggestionFn(item));
      }
    });
    return suggestions.slice(0, 10);
  }

  mediaData.forEach((item) => {
    if (item.doc && item.doc.toLowerCase().includes(q)) {
      matchingDocs.add(item.doc);
    }

    if (!isSvgFile(item) && (
      (item.name && item.name.toLowerCase().includes(q))
        || (item.alt && item.alt.toLowerCase().includes(q))
        || (item.url && item.url.toLowerCase().includes(q))
    )) {
      suggestions.push(createSuggestionFn(item));
    }
  });

  const docSuggestions = Array.from(matchingDocs).map((doc) => ({
    type: 'doc',
    value: doc,
    display: doc,
  }));

  return [...docSuggestions, ...suggestions].slice(0, 10);
}

export function createSearchSuggestion(item) {
  if (!item.name && !item.url && !item.doc) return null;

  if (isSvgFile(item)) return null;

  return {
    type: 'media',
    value: item,
    display: item.name || item.url || 'Unnamed Media',
    details: {
      alt: item.alt,
      doc: item.doc,
      url: item.url,
      type: getMediaType(item),
    },
  };
}

// Get document filtered items (moved from media-library.js)
export function getDocumentFilteredItems(
  processedData,
  mediaData,
  selectedDocument,
  selectedFilterType,
) {
  if (!selectedDocument || !mediaData) {
    return [];
  }

  // Simple approach: filter mediaData directly by document
  const documentItems = mediaData.filter((item) => item.doc === selectedDocument);

  // Deduplicate by URL
  const seenUrls = new Set();
  const uniqueDocumentItems = documentItems.filter((item) => {
    if (!item.url) return true;
    if (seenUrls.has(item.url)) return false;
    seenUrls.add(item.url);
    return true;
  });

  // Apply specific document filter if not documentTotal
  if (selectedFilterType && selectedFilterType !== 'documentTotal') {
    return applyFilter(uniqueDocumentItems, selectedFilterType, selectedDocument);
  }

  return uniqueDocumentItems;
}

// Get folder filtered items (moved from media-library.js)
export function getFolderFilteredItems(data, selectedFolder, usageIndex) {
  if (!selectedFolder || !data) {
    return data;
  }

  if (usageIndex && usageIndex.size > 0) {
    const mediaUrlsInFolder = new Set();
    const folderUsageCounts = new Map();

    usageIndex.forEach((usageEntries, groupingKey) => {
      usageEntries.forEach((entry) => {
        if (!entry.doc) return;

        let isInFolder = false;
        if (selectedFolder === '/' || selectedFolder === '') {
          if (!entry.doc.includes('/', 1)) {
            isInFolder = true;
          }
        } else {
          const cleanPath = entry.doc.replace(/\.html$/, '');
          const parts = cleanPath.split('/');

          if (parts.length > 2) {
            const folderPath = parts.slice(0, -1).join('/');
            const searchPath = selectedFolder.startsWith('/') ? selectedFolder : `/${selectedFolder}`;
            if (folderPath === searchPath) {
              isInFolder = true;
            }
          }
        }

        if (isInFolder) {
          const mediaItem = data.find((item) => getGroupingKey(item.url) === groupingKey);
          if (mediaItem) {
            mediaUrlsInFolder.add(mediaItem.url);
            const currentCount = folderUsageCounts.get(mediaItem.url) || 0;
            folderUsageCounts.set(mediaItem.url, currentCount + 1);
          }
        }
      });
    });

    const filteredData = data.filter((item) => mediaUrlsInFolder.has(item.url));

    filteredData.forEach((item) => {
      const folderCount = folderUsageCounts.get(item.url) || 0;
      item.folderUsageCount = folderCount;
    });

    return filteredData;
  }

  return data;
}
