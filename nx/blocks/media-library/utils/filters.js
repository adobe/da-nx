import { getMediaType, isSvgFile } from './utils.js';

export const FILTER_CONFIG = {
  images: (item) => getMediaType(item) === 'image' && !isSvgFile(item),
  videos: (item) => getMediaType(item) === 'video',
  documents: (item) => getMediaType(item) === 'document',
  links: (item) => getMediaType(item) === 'link',
  icons: (item) => isSvgFile(item),

  missingAlt: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && item.alt === 'null',
  decorative: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && item.alt === '',
  filled: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && item.alt && item.alt !== '' && item.alt !== 'null',

  documentImages: (item, selectedDocument) => FILTER_CONFIG.images(item)
  && item.doc === selectedDocument,
  documentIcons: (item, selectedDocument) => FILTER_CONFIG.icons(item)
  && item.doc === selectedDocument,
  documentVideos: (item, selectedDocument) => FILTER_CONFIG.videos(item)
   && item.doc === selectedDocument,
  documentDocuments: (item, selectedDocument) => FILTER_CONFIG.documents(item)
   && item.doc === selectedDocument,
  documentLinks: (item, selectedDocument) => FILTER_CONFIG.links(item)
   && item.doc === selectedDocument,
  documentMissingAlt: (item, selectedDocument) => item.type?.startsWith('img >')
  && !item.type?.includes('svg') && item.alt === 'null' && item.doc === selectedDocument,
  documentDecorative: (item, selectedDocument) => item.type?.startsWith('img >')
   && !item.type?.includes('svg') && item.alt === '' && item.doc === selectedDocument,
  documentFilled: (item, selectedDocument) => item.doc === selectedDocument && item.type?.startsWith('img >')
   && !item.type?.includes('svg') && item.alt && item.alt !== '' && item.alt !== 'null',

  documentTotal: () => true,
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

/**
 * Parse colon syntax from search query (e.g., "doc:path", "name:value")
 */
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

/**
 * Process media data in a single pass to collect all derived information
 */
export function processMediaData(mediaData) {
  if (!mediaData || !Array.isArray(mediaData)) {
    return { filterCounts: {} };
  }

  const filterCounts = {};

  Object.keys(FILTER_CONFIG).forEach((filterName) => {
    filterCounts[filterName] = 0;
  });

  mediaData.forEach((item) => {
    const { alt, doc, type } = item;
    const mediaType = getMediaType(item);
    const isSvg = isSvgFile(item);
    const isImage = mediaType === 'image' || mediaType === 'img';
    const isInDocument = doc && doc.trim();

    if (isImage && !isSvg) {
      filterCounts.images += 1;
      if (isInDocument) filterCounts.documentImages += 1;
      if (type?.startsWith('img >') && !type?.includes('svg')) {
        if (alt === 'null') {
          filterCounts.missingAlt += 1;
          if (isInDocument) filterCounts.documentMissingAlt += 1;
        } else if (alt === '') {
          filterCounts.decorative += 1;
          if (isInDocument) filterCounts.documentDecorative += 1;
        } else if (alt && alt !== '' && alt !== 'null') {
          filterCounts.filled += 1;
          if (isInDocument) filterCounts.documentFilled += 1;
        }
      }
    }

    if (isSvg) {
      filterCounts.icons += 1;
      if (isInDocument) filterCounts.documentIcons += 1;
    }

    if (mediaType === 'video') {
      filterCounts.videos += 1;
      if (isInDocument) filterCounts.documentVideos += 1;
    }

    if (mediaType === 'document') {
      filterCounts.documents += 1;
      if (isInDocument) filterCounts.documentDocuments += 1;
    }

    if (mediaType === 'link') {
      filterCounts.links += 1;
      if (isInDocument) filterCounts.documentLinks += 1;
    }

    if (!isSvg) {
      filterCounts.all += 1;
    }

    if (isInDocument) {
      filterCounts.documentTotal += 1;
    }
  });

  return { filterCounts };
}

export function aggregateMediaData(mediaData) {
  if (!mediaData) return [];

  const aggregatedMedia = new Map();
  mediaData.forEach((item) => {
    const mediaHash = item.hash;
    if (!aggregatedMedia.has(mediaHash)) {
      aggregatedMedia.set(mediaHash, {
        ...item,
        mediaUrl: item.url,
        usageCount: 0,
        isUsed: false,
      });
    }
    const aggregated = aggregatedMedia.get(mediaHash);

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

  let filtered = aggregateMediaData(mediaData);

  filtered = applyFilter(filtered, selectedFilterType, selectedDocument);

  if (searchQuery && searchQuery.trim()) {
    filtered = filterBySearch(filtered, searchQuery);
  }

  return filtered;
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
