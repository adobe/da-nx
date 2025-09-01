import { getMediaType, isSvgFile } from './utils.js';

// Filter configuration - easy to maintain and extend
export const FILTER_CONFIG = {
  // Basic type filters
  images: (item) => getMediaType(item) === 'image' && !isSvgFile(item),
  videos: (item) => getMediaType(item) === 'video',
  documents: (item) => getMediaType(item) === 'document',
  links: (item) => getMediaType(item) === 'link',
  icons: (item) => isSvgFile(item),

  // Special filters
  missingAlt: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && item.alt === null,
  decorative: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && item.alt === '',
  filled: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && item.alt && item.alt !== '',

  // Document-specific filters (reuse base filters)
  documentImages: (item) => FILTER_CONFIG.images(item),
  documentIcons: (item) => FILTER_CONFIG.icons(item),
  documentVideos: (item) => FILTER_CONFIG.videos(item),
  documentDocuments: (item) => FILTER_CONFIG.documents(item),
  documentLinks: (item) => FILTER_CONFIG.links(item),
  documentMissingAlt: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && item.alt === null,
  documentDecorative: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && item.alt === '',
  documentFilled: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && item.alt && item.alt !== '',

  // Special cases
  documentTotal: () => true, // No filtering
  all: (item) => !isSvgFile(item), // Exclude SVGs from All Media
};

// Helper function to apply filters
export function applyFilter(data, filterName) {
  const filterFn = FILTER_CONFIG[filterName];
  return filterFn ? data.filter(filterFn) : data;
}

// Helper function to get available filter names
export function getAvailableFilters() {
  return Object.keys(FILTER_CONFIG);
}

// ============================================================================
// HELPER FUNCTIONS (defined before use)
// ============================================================================

/**
 * Parse colon syntax from search query
 * @param {string} query - Search query
 * @returns {Object|null} Parsed colon syntax object
 */
export function parseColonSyntax(query) {
  if (!query) return null;

  // First check for explicit colon syntax
  const colonMatch = query.match(/^(\w+):(.*)$/);
  if (colonMatch) {
    const [, field, value] = colonMatch;
    return {
      field: field.toLowerCase(),
      value: value.trim().toLowerCase(),
      originalQuery: query,
    };
  }

  // Auto-detect folder paths (starts with / or contains /)
  if (query.startsWith('/') || query.includes('/')) {
    return {
      field: 'folder',
      value: query.toLowerCase().trim(),
      originalQuery: query,
    };
  }

  return null;
}

/**
 * Filter by colon syntax (doc:, name:, alt:, url:, folder:)
 * @param {Array} mediaData - Media data to filter
 * @param {Object} colonSyntax - Parsed colon syntax object
 * @returns {Array} Filtered media data
 */
function filterByColonSyntax(mediaData, colonSyntax) {
  const { field, value } = colonSyntax;

  // Debug: Log the search parameters
  if (field === 'folder' && value === '/drafts/km') {
    console.log('=== FILTER FUNCTION DEBUG ===');
    console.log('Search field:', field);
    console.log('Search value:', value);
    console.log('Total items to filter:', mediaData.length);

    // Check if any items have /drafts/km in their doc path
    const itemsWithDraftsKm = mediaData.filter((item) => item.doc && item.doc.includes('/drafts/km'));
    console.log('Items with /drafts/km in doc:', itemsWithDraftsKm.length);
    if (itemsWithDraftsKm.length > 0) {
      console.log('Sample items with /drafts/km:', itemsWithDraftsKm.slice(0, 3).map((item) => ({
        name: item.name,
        doc: item.doc,
      })));
    }
  }

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
        // Simple folder matching using doc path
        if (!item.doc) return false;

        // Handle root-level search
        if (value === '' || value === '/') {
          return !item.doc.includes('/', 1); // No slash after the first character
        }

        // For specific folder: extract folder path from doc and check exact match
        const cleanPath = item.doc.replace(/\.html$/, '');
        const parts = cleanPath.split('/');

        if (parts.length > 2) {
          // Extract folder path (remove file part)
          const folderPath = parts.slice(0, -1).join('/');
          const searchPath = value.startsWith('/') ? value : `/${value}`;
          const matches = folderPath === searchPath;
          return matches;
        }

        return false;
      }
      default:
        return false;
    }
  });

  // Debug: Log the final results
  if (field === 'folder' && value === '/drafts/km') {
    // eslint-disable-next-line no-console
    console.log('=== FILTER RESULTS DEBUG ===');
    // eslint-disable-next-line no-console
    console.log('Filtered results count:', filteredResults.length);
    if (filteredResults.length > 0) {
      // eslint-disable-next-line no-console
      console.log('Filtered results:', filteredResults.map((item) => ({
        name: item.name,
        doc: item.doc,
      })));
    } else {
      // eslint-disable-next-line no-console
      console.log('No items matched the folder search criteria');
    }
    // eslint-disable-next-line no-console
    console.log('=== END FILTER RESULTS DEBUG ===');
  }

  return filteredResults;
}

/**
 * Filter by general search across all fields
 * @param {Array} mediaData - Media data to filter
 * @param {string} query - Search query
 * @returns {Array} Filtered media data
 */
function filterByGeneralSearch(mediaData, query) {
  return mediaData.filter((item) => (item.name && item.name.toLowerCase().includes(query))
    || (item.alt && item.alt.toLowerCase().includes(query))
    || (item.doc && item.doc.toLowerCase().includes(query))
            || (item.url && item.url.toLowerCase().includes(query)));
}

/**
 * Filter media data based on search query
 * @param {Array} mediaData - Media data to filter
 * @param {string} searchQuery - Search query
 * @returns {Array} Filtered media data
 */
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

// ============================================================================
// SINGLE-PASS DATA PROCESSING
// ============================================================================

/**
 * Process media data in a single pass to collect all derived information
 * @param {Array} mediaData - Raw media data array
 * @returns {Object} Processed data containing filters, suggestions, usage, hierarchy
 */
export function processMediaData(mediaData) {
  if (!mediaData || !Array.isArray(mediaData)) {
    return { filterCounts: {} };
  }

  // Initialize collections
  const filterCounts = {};

  // Initialize filter counts
  Object.keys(FILTER_CONFIG).forEach((filterName) => {
    filterCounts[filterName] = 0;
  });

  // Single pass through all media data
  mediaData.forEach((item) => {
    // Cache expensive operations once per item
    const { alt, doc, type } = item;
    const mediaType = getMediaType(item);
    const isSvg = isSvgFile(item);
    const isImage = mediaType === 'image' || mediaType === 'img';
    const isInDocument = doc && doc.trim();

    // Determine which filters this item matches and count them
    if (isImage && !isSvg) {
      filterCounts.images += 1;
      if (isInDocument) filterCounts.documentImages += 1;
      if (type?.startsWith('img >') && !type?.includes('svg')) {
        if (alt === null) {
          filterCounts.missingAlt += 1;
          if (isInDocument) filterCounts.documentMissingAlt += 1;
        } else if (alt === '') {
          filterCounts.decorative += 1;
          if (isInDocument) filterCounts.documentDecorative += 1;
        } else if (alt && alt !== '') {
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

    // All filter (excludes SVGs)
    if (!isSvg) {
      filterCounts.all += 1;
    }

    // Document total (no filtering)
    if (isInDocument) {
      filterCounts.documentTotal += 1;
    }
  });

  // Note: Folder hierarchy and counts moved to folder dialog component for on-demand processing
  // Note: Search suggestions moved to on-demand processing in topbar component
  return { filterCounts };
}

// ============================================================================
// MEDIA AGGREGATION
// ============================================================================

export function aggregateMediaData(mediaData) {
  if (!mediaData) return [];

  const aggregatedMedia = new Map();
  mediaData.forEach((item) => {
    const mediaHash = item.hash; // Group by hash instead of URL
    if (!aggregatedMedia.has(mediaHash)) {
      aggregatedMedia.set(mediaHash, {
        ...item,
        mediaUrl: item.url,
        usageCount: 0,
        isUsed: false,
      });
    }
    const aggregated = aggregatedMedia.get(mediaHash);

    // Count all instances of this hash
    if (item.doc && item.doc.trim()) {
      aggregated.usageCount += 1;
      aggregated.isUsed = true;
    }
  });

  return Array.from(aggregatedMedia.values());
}

// ============================================================================
// FILTERED MEDIA DATA CALCULATION
// ============================================================================

export function calculateFilteredMediaData(
  mediaData,
  selectedFilterType,
  searchQuery,
) {
  if (!mediaData) {
    return [];
  }

  let filtered = aggregateMediaData(mediaData);

  // Apply filter using configuration
  filtered = applyFilter(filtered, selectedFilterType);

  // Apply search filter using consolidated logic
  if (searchQuery && searchQuery.trim()) {
    filtered = filterBySearch(filtered, searchQuery);
  }

  // Sort is now done at scan time - data is pre-sorted
  // Removed sort operation to improve filter performance

  return filtered;
}

// ============================================================================
// SEARCH SUGGESTIONS
// ============================================================================

/**
 * Generate folder suggestions
 * @param {Array} mediaData - Media data to search
 * @param {string} value - Folder search value
 * @returns {Array} Array of folder suggestion objects
 */
function generateFolderSuggestions(mediaData, value) {
  // Collect all unique folder paths from doc paths
  const folderPaths = new Set();

  mediaData.forEach((item) => {
    if (item.doc) {
      // Keep leading slash, just remove .html extension
      const cleanPath = item.doc.replace(/\.html$/, '');
      const parts = cleanPath.split('/');

      if (parts.length > 2) { // ["", "sports", "nba", "players"] -> length 4
        // Extract ALL folder levels (root, subfolders, etc.)
        for (let i = 1; i < parts.length - 1; i += 1) {
          const folderPath = parts.slice(0, i + 1).join('/'); // "/sports", "/sports/nba"
          folderPaths.add(folderPath);
        }
      } else if (parts.length === 2) {
        // Root-level files like "/index.html"
        folderPaths.add('/');
      }
    }
  });

  // Filter folder paths based on search value
  const filteredPaths = Array.from(folderPaths).filter((folderPath) => {
    if (value === '' || value === '/') {
      return true; // Show all folders when starting fresh
    }
    // Show folders that start with the search value
    const searchPath = value.startsWith('/') ? value : `/${value}`;
    return folderPath.startsWith(searchPath);
  });

  // Add folder suggestions (already have leading /)
  const folderSuggestions = filteredPaths.map((folderPath) => ({
    type: 'folder',
    value: folderPath,
    display: folderPath,
  }));

  return folderSuggestions.slice(0, 10);
}

/**
 * Generate search suggestions for dropdown
 * @param {Array} mediaData - Media data to search
 * @param {string} query - Search query
 * @param {Function} createSuggestionFn - Function to create suggestion objects
 * @returns {Array} Array of suggestion objects
 */
export function generateSearchSuggestions(mediaData, query, createSuggestionFn) {
  if (!query || !query.trim() || !mediaData) {
    return [];
  }

  const suggestions = [];
  const matchingDocs = new Set();

  // Use centralized parsing logic
  const colonSyntax = parseColonSyntax(query);

  if (colonSyntax) {
    const { field, value } = colonSyntax;

    if (field === 'folder') {
      // Generate folder suggestions
      return generateFolderSuggestions(mediaData, value);
    }

    // Handle other field types (doc:, name:, alt:, url:)
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

    // Add doc suggestions
    const docSuggestions = Array.from(matchingDocs).map((doc) => ({
      type: 'doc',
      value: doc,
      display: doc,
    }));

    return [...docSuggestions, ...suggestions].slice(0, 10);
  }

  // General search across all fields
  const q = query.toLowerCase().trim();

  // Handle root-level search (just "/")
  if (q === '/') {
    mediaData.forEach((item) => {
      if (item.doc && !item.doc.includes('/', 1)) {
        suggestions.push(createSuggestionFn(item));
      }
    });
    return suggestions.slice(0, 10);
  }

  mediaData.forEach((item) => {
    // Check doc paths
    if (item.doc && item.doc.toLowerCase().includes(q)) {
      matchingDocs.add(item.doc);
    }

    // Check media fields (exclude SVGs)
    if (!isSvgFile(item) && (
      (item.name && item.name.toLowerCase().includes(q))
        || (item.alt && item.alt.toLowerCase().includes(q))
        || (item.url && item.url.toLowerCase().includes(q))
    )) {
      suggestions.push(createSuggestionFn(item));
    }
  });

  // Add doc suggestions
  const docSuggestions = Array.from(matchingDocs).map((doc) => ({
    type: 'doc',
    value: doc,
    display: doc,
  }));

  return [...docSuggestions, ...suggestions].slice(0, 10);
}

/**
 * Create a search suggestion object for a media item
 * @param {Object} item - Media item
 * @returns {Object|null} Suggestion object or null if invalid
 */
export function createSearchSuggestion(item) {
  if (!item.name && !item.url && !item.doc) return null;

  // Exclude SVG files from search suggestions (consistent with 'all' filter)
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

// ============================================================================
// SEARCH HELPER FUNCTIONS (defined before use)
// ============================================================================
