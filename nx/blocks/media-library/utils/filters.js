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
    const { isUsed, alt, doc, type } = item;
    const mediaType = getMediaType(item);
    const isSvg = isSvgFile(item);
    const hasAlt = alt && alt.trim();
    const isImage = mediaType === 'image' || mediaType === 'img';
    const isInDocument = doc && doc.trim();

    // Determine which filters this item matches and count them
    if (isImage && !isSvg) {
      filterCounts.images += 1;
      if (isInDocument) filterCounts.documentImages += 1;
      if (!hasAlt && type?.startsWith('img >')) {
        filterCounts.missingAlt += 1;
        if (isInDocument) filterCounts.documentMissingAlt += 1;
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

    // Usage filters
    if (isUsed) {
      filterCounts.used += 1;
    } else {
      filterCounts.unused += 1;
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
    const mediaUrl = item.url;
    if (!aggregatedMedia.has(mediaUrl)) {
      aggregatedMedia.set(mediaUrl, {
        ...item,
        mediaUrl,
        usageCount: 0,
        isUsed: false,
      });
    }
    const aggregated = aggregatedMedia.get(mediaUrl);

    // Only increment usage count if there's a valid document path
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

export function calculateFilteredMediaData(mediaData, selectedFilterType, folderFilterPaths, searchQuery) {
  if (!mediaData) {
    return [];
  }

  const aggregateStart = performance.now();
  let filtered = aggregateMediaData(mediaData);
  const aggregateTime = performance.now() - aggregateStart;
  console.log(`📦 Aggregate time: ${aggregateTime.toFixed(2)}ms`);

  const filterStart = performance.now();
  // Apply filter using configuration
  filtered = applyFilter(filtered, selectedFilterType);
  const filterTime = performance.now() - filterStart;
  console.log(`🎛️ Filter apply time: ${filterTime.toFixed(2)}ms`);

  if (folderFilterPaths.length > 0) {
    const folderFilterStart = performance.now();
    const hasMatchingPath = (item) => {
      // Skip folder filtering for items with no document path
      if (!item.doc || !item.doc.trim()) {
        return true;
      }

      const matches = folderFilterPaths.some(
        (path) => {
          // Normalize paths for comparison
          const itemPath = item.doc.replace(/^\//, '');
          const filterPath = path.replace(/^\//, '');
          return itemPath.startsWith(filterPath);
        },
      );
      return matches;
    };

    filtered = filtered.filter(hasMatchingPath);
    const folderFilterTime = performance.now() - folderFilterStart;
    console.log(`📁 Folder filter time: ${folderFilterTime.toFixed(2)}ms`);
  }

  // Apply search filter using consolidated logic
  if (searchQuery && searchQuery.trim()) {
    const searchFilterStart = performance.now();
    filtered = filterBySearch(filtered, searchQuery);
    const searchFilterTime = performance.now() - searchFilterStart;
    console.log(`🔎 Search filter time: ${searchFilterTime.toFixed(2)}ms`);
  }

  const sortStart = performance.now();
  filtered.sort((a, b) => {
    // Sort by recently used first, then alphabetical
    const lastUsedA = new Date(a.lastUsedAt || 0);
    const lastUsedB = new Date(b.lastUsedAt || 0);
    const timeDiff = lastUsedB - lastUsedA;

    if (timeDiff !== 0) return timeDiff;

    // Fallback to alphabetical
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
  const sortTime = performance.now() - sortStart;
  console.log(`📋 Sort time: ${sortTime.toFixed(2)}ms`);

  return filtered;
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
