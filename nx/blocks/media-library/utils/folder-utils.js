// nx/blocks/media-library/utils/folder-utils.js

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
