import { getMediaType, isSvgFile } from './utils.js';

// Filter configuration - easy to maintain and extend
export const FILTER_CONFIG = {
  // Basic type filters
  images: (item) => getMediaType(item) === 'image' && !isSvgFile(item),
  videos: (item) => getMediaType(item) === 'video',
  documents: (item) => getMediaType(item) === 'document',
  links: (item) => getMediaType(item) === 'link',
  icons: (item) => isSvgFile(item),

  // Usage filters
  used: (item) => item.isUsed,
  unused: (item) => !item.isUsed,

  // Special filters
  missingAlt: (item) => getMediaType(item) === 'image' && !item.alt && item.type?.startsWith('img >') && !isSvgFile(item),

  // Document-specific filters (reuse base filters)
  documentImages: (item) => FILTER_CONFIG.images(item),
  documentIcons: (item) => FILTER_CONFIG.icons(item),
  documentVideos: (item) => FILTER_CONFIG.videos(item),
  documentDocuments: (item) => FILTER_CONFIG.documents(item),
  documentLinks: (item) => FILTER_CONFIG.links(item),
  documentMissingAlt: (item) => getMediaType(item) === 'image' && !item.alt && item.type?.startsWith('img >'),

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
 * Create search suggestion from media item
 * @param {Object} item - Media item
 * @returns {Object|null} Search suggestion object
 */
function createSearchSuggestion(item) {
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
// SINGLE-PASS DATA PROCESSING
// ============================================================================

/**
 * Process media data in a single pass to collect all derived information
 * @param {Array} mediaData - Raw media data array
 * @returns {Object} Processed data containing filters, suggestions, usage, hierarchy
 */
export function processMediaData(mediaData) {
  if (!mediaData || !Array.isArray(mediaData)) {
    return {
      filterCounts: {},
      searchSuggestions: [],
      usageMap: new Map(),
      folderHierarchy: new Map(),
      mediaTypes: new Set(),
    };
  }

  // Initialize collections
  const filterCounts = {};
  const searchSuggestions = [];
  const usageMap = new Map();
  const mediaTypes = new Set();

  // Initialize filter counts
  Object.keys(FILTER_CONFIG).forEach((filterName) => {
    filterCounts[filterName] = 0;
  });

  // Single pass through all media data
  mediaData.forEach((item) => {
    // 1. Collect filter counts
    Object.entries(FILTER_CONFIG).forEach(([filterName, filterFn]) => {
      if (filterFn(item)) {
        filterCounts[filterName] += 1;
      }
    });

    // 2. Collect search suggestions
    const suggestion = createSearchSuggestion(item);
    if (suggestion) {
      searchSuggestions.push(suggestion);
    }

    // 3. Build usage map
    if (item.url) {
      if (!usageMap.has(item.url)) {
        usageMap.set(item.url, {
          media: item,
          usageCount: 0,
          usageDetails: [],
        });
      }

      // If this item has a doc property, it's a usage entry
      if (item.doc && item.doc.trim()) {
        const usageInfo = usageMap.get(item.url);
        usageInfo.usageDetails.push(item);
        usageInfo.usageCount = usageInfo.usageDetails.length;
      }
    }

    // 4. Collect document paths (for folder dialog to use later)
    if (item.doc) {
      docPaths.add(item.doc);
    }

    // 5. Collect media types
    const mediaType = getMediaType(item);
    if (mediaType) {
      mediaTypes.add(mediaType);
    }
  });

  // Note: Folder hierarchy and counts moved to folder dialog component for on-demand processing

  // Sort search suggestions by relevance
  searchSuggestions.sort((a, b) => {
    // Prioritize by usage, then alphabetically
    const aUsed = a.media?.isUsed || false;
    const bUsed = b.media?.isUsed || false;
    if (aUsed !== bUsed) return bUsed - aUsed;

    const aName = (a.display || '').toLowerCase();
    const bName = (b.display || '').toLowerCase();
    return aName.localeCompare(bName);
  });

  return {
    filterCounts,
    searchSuggestions: searchSuggestions.slice(0, 50), // Limit suggestions
    usageMap,
    folderHierarchy: new Map(), // Empty map - folder dialog will build its own
    docPaths: Array.from(docPaths).sort(),
    mediaTypes: Array.from(mediaTypes),
  };
}

// ============================================================================
// SEARCH HELPER FUNCTIONS (defined before use)
// ============================================================================

/**
 * Filter by colon syntax (doc:, name:, alt:, url:)
 * @param {Array} mediaData - Media data to filter
 * @param {Object} colonSyntax - Parsed colon syntax object
 * @returns {Array} Filtered media data
 */
function filterByColonSyntax(mediaData, colonSyntax) {
  const { field, value } = colonSyntax;

  return mediaData.filter((item) => {
    switch (field) {
      case 'doc':
        return item.doc && item.doc.toLowerCase().includes(value);
      case 'name':
        return item.name && item.name.toLowerCase().includes(value);
      case 'alt':
        return item.alt && item.alt.toLowerCase().includes(value);
      case 'url':
        return item.url && item.url.toLowerCase().includes(value);
      default:
        return false;
    }
  });
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
 * Get suggestions for colon syntax queries
 * @param {Array} searchSuggestions - Pre-calculated suggestions
 * @param {Object} colonSyntax - Parsed colon syntax
 * @returns {Array} Filtered suggestions
 */
function getColonSyntaxSuggestions(searchSuggestions, colonSyntax) {
  const { field, value } = colonSyntax;

  if (field === 'doc') {
    // Return unique doc paths that match
    const matchingDocs = new Set();
    searchSuggestions.forEach((suggestion) => {
      if (suggestion.details?.doc && suggestion.details.doc.toLowerCase().includes(value)) {
        matchingDocs.add(suggestion.details.doc);
      }
    });

    return Array.from(matchingDocs).map((doc) => ({
      type: 'doc',
      value: doc,
      display: doc,
    }));
  }

  // Filter media suggestions by field
  return searchSuggestions.filter((suggestion) => {
    const fieldValue = suggestion.details?.[field === 'url' ? 'url' : field];
    return fieldValue && fieldValue.toLowerCase().includes(value);
  });
}

/**
 * Get suggestions for general search queries
 * @param {Array} searchSuggestions - Pre-calculated suggestions
 * @param {string} query - Search query
 * @returns {Array} Filtered suggestions
 */
function getGeneralSearchSuggestions(searchSuggestions, query) {
  const matchingDocs = new Set();
  const matchingMedia = [];

  searchSuggestions.forEach((suggestion) => {
    // Check doc paths
    if (suggestion.details?.doc && suggestion.details.doc.toLowerCase().includes(query)) {
      matchingDocs.add(suggestion.details.doc);
    }

    // Check media fields
    if (suggestion.display.toLowerCase().includes(query)
        || suggestion.details?.alt?.toLowerCase().includes(query)
        || suggestion.details?.url?.toLowerCase().includes(query)) {
      matchingMedia.push(suggestion);
    }
  });

  // Combine doc and media suggestions
  const docSuggestions = Array.from(matchingDocs).map((doc) => ({
    type: 'doc',
    value: doc,
    display: doc,
  }));

  return [...docSuggestions, ...matchingMedia].slice(0, 10);
}

// ============================================================================
// SEARCH PROCESSING
// ============================================================================

/**
 * Parse colon syntax from search query
 * @param {string} query - Search query
 * @returns {Object|null} Parsed colon syntax object
 */
export function parseColonSyntax(query) {
  if (!query) return null;

  const colonMatch = query.match(/^(\w+):(.*)$/);
  if (!colonMatch) return null;

  const [, field, value] = colonMatch;
  return {
    field: field.toLowerCase(),
    value: value.trim().toLowerCase(),
    originalQuery: query,
  };
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

/**
 * Get search suggestions for a query
 * @param {Array} searchSuggestions - Pre-calculated search suggestions
 * @param {string} query - Search query
 * @returns {Array} Filtered suggestions
 */
export function getSearchSuggestions(searchSuggestions, query) {
  if (!query || !query.trim()) return [];

  const q = query.toLowerCase();
  const colonSyntax = parseColonSyntax(query);

  if (colonSyntax) {
    return getColonSyntaxSuggestions(searchSuggestions, colonSyntax);
  }

  return getGeneralSearchSuggestions(searchSuggestions, q);
}
