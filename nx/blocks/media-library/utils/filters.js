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
  missingAlt: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && !item.alt,

  // Document-specific filters (reuse base filters)
  documentImages: (item) => FILTER_CONFIG.images(item),
  documentIcons: (item) => FILTER_CONFIG.icons(item),
  documentVideos: (item) => FILTER_CONFIG.videos(item),
  documentDocuments: (item) => FILTER_CONFIG.documents(item),
  documentLinks: (item) => FILTER_CONFIG.links(item),
  documentMissingAlt: (item) => item.type?.startsWith('img >') && !item.type?.includes('svg') && !item.alt,

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
    const hasAlt = alt && alt.trim();
    const isImage = mediaType === 'image' || mediaType === 'img';
    const isInDocument = doc && doc.trim();

    // Determine which filters this item matches and count them
    if (isImage && !isSvg) {
      filterCounts.images += 1;
      if (isInDocument) filterCounts.documentImages += 1;
      if (type?.startsWith('img >') && !type?.includes('svg') && !hasAlt) {
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

export function calculateFilteredMediaData(
  mediaData,
  selectedFilterType,
  folderFilterPaths,
  searchQuery,
) {
  if (!mediaData) {
    return [];
  }

  let filtered = aggregateMediaData(mediaData);

  // Apply filter using configuration
  filtered = applyFilter(filtered, selectedFilterType);

  if (folderFilterPaths.length > 0) {
    const hasMatchingPath = (item) => {
      // Only include items that have a document path and match the filter
      if (!item.doc || !item.doc.trim()) {
        return false; // Exclude items with no document path
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
  }

  // Apply search filter using consolidated logic
  if (searchQuery && searchQuery.trim()) {
    filtered = filterBySearch(filtered, searchQuery);
  }

  // Sort is now done at scan time - data is pre-sorted
  // Removed sort operation to improve filter performance

  return filtered;
}

// ============================================================================
// SEARCH HELPER FUNCTIONS (defined before use)
// ============================================================================

// ============================================================================
// FOLDER HIERARCHY FUNCTIONS (moved from folder-utils.js)
// ============================================================================

/**
 * Build folder hierarchy from document path
 * @param {Map} hierarchy - Hierarchy map to populate
 * @param {string} docPath - Document path
 */
export function buildFolderHierarchy(hierarchy, docPath) {
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
export function calculateFolderCounts(hierarchy, mediaData) {
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

/**
 * Build complete folder hierarchy from media data
 * @param {Array} mediaData - Media data array
 * @returns {Map} Complete folder hierarchy with counts
 */
export function buildCompleteFolderHierarchy(mediaData) {
  if (!mediaData || !Array.isArray(mediaData)) {
    return new Map();
  }

  const folderHierarchy = new Map();

  // Build hierarchy for all document paths
  mediaData.forEach((item) => {
    if (item.doc) {
      buildFolderHierarchy(folderHierarchy, item.doc);
    }
  });

  // Calculate counts
  calculateFolderCounts(folderHierarchy, mediaData);

  return folderHierarchy;
}
