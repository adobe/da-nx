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

/**
 * Build folder hierarchy from document path
 * @param {Map} hierarchy - Hierarchy map to populate
 * @param {string} docPath - Document path
 */
function buildFolderHierarchy(hierarchy, docPath) {
  if (!docPath) return;

  // Remove leading slash
  const cleanPath = docPath.startsWith('/') ? docPath.substring(1) : docPath;
  const parts = cleanPath.split('/').filter(Boolean);

  if (parts.length === 0) return;

  // Simple rule: if the last part ends with .html, it's a file
  // Everything else in the path are folders
  const lastPart = parts[parts.length - 1];
  const isFile = lastPart.endsWith('.html');

  if (isFile) {
    // Create folders for all parts except the last one
    const folderParts = parts.slice(0, -1);

    let currentPath = '';
    folderParts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (!hierarchy.has(currentPath)) {
        hierarchy.set(currentPath, {
          path: currentPath,
          name: part,
          level: currentPath.split('/').length,
          children: new Set(),
          parent: currentPath.includes('/') ? currentPath.substring(0, currentPath.lastIndexOf('/')) : null,
          count: 0,
          type: 'folder',
          hasFiles: false,
        });
      }
    });

    // Add the file itself to the hierarchy
    const filePath = cleanPath;
    if (!hierarchy.has(filePath)) {
      hierarchy.set(filePath, {
        path: filePath,
        name: lastPart,
        level: parts.length,
        children: new Set(),
        parent: folderParts.length > 0 ? folderParts.join('/') : null,
        count: 0,
        type: 'file',
        hasFiles: false,
      });
    }

    // Always update the parent-child relationship, even if file already exists
    if (folderParts.length > 0) {
      const parentPath = folderParts.join('/');
      if (hierarchy.has(parentPath)) {
        hierarchy.get(parentPath).hasFiles = true;
        hierarchy.get(parentPath).children.add(filePath);
      } else {
        // File is at root level
      }
    }
  }

  // Build parent-child relationships for both folders and files
  hierarchy.forEach((node, path) => {
    if (node.parent && hierarchy.has(node.parent)) {
      hierarchy.get(node.parent).children.add(path);
    }
  });
}

/**
 * Calculate media counts for each folder in the hierarchy
 * @param {Map} hierarchy - Folder hierarchy map
 * @param {Array} mediaData - Media data array
 */
function calculateFolderCounts(hierarchy, mediaData) {
  if (!hierarchy || !mediaData) return;

  // Reset all counts
  hierarchy.forEach((folder) => {
    folder.count = 0;
  });

  // Count media items for each folder and file
  mediaData.forEach((media) => {
    if (media.doc) {
      const docPath = media.doc;

      // Remove leading slash
      const cleanPath = docPath.startsWith('/') ? docPath.substring(1) : docPath;
      const parts = cleanPath.split('/').filter(Boolean);

      if (parts.length === 0) return;

      // If it's a file (ends with .html), count for the file itself and all parent folders
      const lastPart = parts[parts.length - 1];
      if (lastPart.endsWith('.html')) {
        const filePath = cleanPath;
        const folderParts = parts.slice(0, -1); // All parts except the file

        // Count for the file itself
        const file = hierarchy.get(filePath);
        if (file) {
          file.count += 1;
        }

        // Count for all parent folders
        let currentPath = '';
        folderParts.forEach((part) => {
          currentPath = currentPath ? `${currentPath}/${part}` : part;
          const folder = hierarchy.get(currentPath);
          if (folder) {
            folder.count += 1;
          }
        });
      }
    }
  });

  // Counts are now calculated for both folders and files
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
      docPaths: new Set(),
      mediaTypes: new Set(),
    };
  }

  // Initialize collections
  const filterCounts = {};
  const searchSuggestions = [];
  const usageMap = new Map();
  const folderHierarchy = new Map();
  const docPaths = new Set();
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

    // 4. Build folder hierarchy
    if (item.doc) {
      docPaths.add(item.doc);
      buildFolderHierarchy(folderHierarchy, item.doc);
    }

    // 5. Collect media types
    const mediaType = getMediaType(item);
    if (mediaType) {
      mediaTypes.add(mediaType);
    }
  });

  // 6. Calculate folder counts after building hierarchy
  calculateFolderCounts(folderHierarchy, mediaData);

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
    folderHierarchy,
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
