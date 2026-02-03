// nx/blocks/media-library/utils/utils.js

import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'];
export const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi'];
export const DOCUMENT_EXTENSIONS = ['pdf'];
export const AUDIO_EXTENSIONS = ['mp3', 'wav'];
export const MEDIA_EXTENSIONS = [
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
];

function extractFileExtension(filePath) {
  return filePath?.split('.').pop()?.toLowerCase();
}

function isSvgFile(media) {
  const type = media.type || '';
  return type === 'img > svg' || type === 'link > svg';
}

export function detectMediaTypeFromExtension(ext) {
  if (IMAGE_EXTENSIONS.includes(ext)) return 'img';
  if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (DOCUMENT_EXTENSIONS.includes(ext)) return 'document';
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  return 'unknown';
}

export function getMediaType(media) {
  const type = media.type || '';
  if (type.startsWith('img >')) return 'image';
  if (type.startsWith('video >') || type.startsWith('video-source >')) return 'video';
  if (type.startsWith('document >')) return 'document';
  if (type.startsWith('fragment >')) return 'fragment';
  if (type.startsWith('link >')) {
    const [, subtype] = type.split(' > ');
    if (subtype) {
      const detectedType = detectMediaTypeFromExtension(subtype);
      if (detectedType === 'video') return 'video';
      if (detectedType === 'document') return 'document';
    }
    return 'link';
  }

  const mediaUrl = media.url || '';
  const ext = extractFileExtension(mediaUrl);
  const result = detectMediaTypeFromExtension(ext);
  return result;
}

export function getSubtype(media) {
  const type = media.type || '';
  if (!type.includes(' > ')) return '';

  const [, subtype] = type.split(' > ');
  return subtype.toUpperCase();
}

export function getDisplayMediaType(media) {
  if (media.type) {
    if (media.type.includes(' > ')) {
      const [baseType, subtype] = media.type.split(' > ');
      const baseLabels = {
        img: 'IMAGE',
        video: 'VIDEO',
        'video-source': 'VIDEO SOURCE',
        link: 'LINK',
        background: 'BACKGROUND',
        fragment: 'FRAGMENT',
      };
      const baseLabel = baseLabels[baseType] || baseType.toUpperCase();
      return `${baseLabel} (${subtype.toUpperCase()})`;
    }

    const typeLabels = {
      img: 'IMAGE',
      video: 'VIDEO',
      'video-source': 'VIDEO SOURCE',
      link: 'LINK',
      background: 'BACKGROUND',
      fragment: 'FRAGMENT',
    };
    return typeLabels[media.type] || media.type.toUpperCase();
  }

  const mediaUrl = media.url || '';
  const ext = extractFileExtension(mediaUrl);
  if (IMAGE_EXTENSIONS.includes(ext)) return 'IMAGE';
  if (ext === 'mp4') return 'VIDEO';
  if (ext === 'pdf') return 'DOCUMENT';
  return 'UNKNOWN';
}

export function isMediaFile(ext) {
  let cleanExt = ext;
  if (cleanExt && cleanExt.startsWith('.')) {
    cleanExt = cleanExt.substring(1);
  }
  const lowerExt = cleanExt?.toLowerCase();
  return MEDIA_EXTENSIONS.includes(lowerExt);
}

export { isSvgFile, extractFileExtension };

/**
 * Sort media data by lastUsedAt (recent first) then alphabetically by name
 * @param {Array} mediaData - Media data to sort
 * @returns {Array} Sorted media data
 */
export function sortMediaData(mediaData) {
  return [...mediaData].sort((a, b) => {
    // Sort by recently used first
    const lastUsedA = new Date(a.lastUsedAt || 0);
    const lastUsedB = new Date(b.lastUsedAt || 0);
    const timeDiff = lastUsedB - lastUsedA;

    if (timeDiff !== 0) return timeDiff;

    // Sort by doc path depth (shallow pages first)
    const docPathA = a.doc || '';
    const docPathB = b.doc || '';

    const depthA = docPathA ? docPathA.split('/').filter((p) => p).length : 999;
    const depthB = docPathB ? docPathB.split('/').filter((p) => p).length : 999;

    const depthDiff = depthA - depthB;
    if (depthDiff !== 0) return depthDiff;

    // Fallback to alphabetical by name
    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

export function getVideoThumbnail(videoUrl) {
  if (!videoUrl) return null;

  const youtubeMatch = videoUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
  if (youtubeMatch) {
    return `https://img.youtube.com/vi/${youtubeMatch[1]}/maxresdefault.jpg`;
  }

  const vimeoMatch = videoUrl.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    const videoId = vimeoMatch[1];
    return `https://i.vimeocdn.com/video/${videoId}_640.jpg`;
  }

  const dailymotionMatch = videoUrl.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([^&\n?#]+)/);
  if (dailymotionMatch) {
    const videoId = dailymotionMatch[1];
    return `https://www.dailymotion.com/thumbnail/video/${videoId}`;
  }

  const dynamicMediaMatch = videoUrl.match(/(scene7\.com\/is\/content\/[^?]+)/);
  if (dynamicMediaMatch) {
    return `${dynamicMediaMatch[1]}?fmt=jpeg&wid=300&hei=200`;
  }

  const marketingMatch = videoUrl.match(/(marketing\.adobe\.com\/is\/content\/[^?]+)/);
  if (marketingMatch) {
    return `${marketingMatch[1]}?fmt=jpeg&wid=300&hei=200`;
  }

  return null;
}

export function isExternalVideoUrl(url) {
  if (!url) return false;

  const supportedPatterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)/,
    /vimeo\.com\/(\d+)/,
    /(?:dailymotion\.com\/video\/|dai\.ly\/)/,
    /scene7\.com\/is\/content\//,
    /marketing\.adobe\.com\/is\/content\//,
  ];

  return supportedPatterns.some((pattern) => pattern.test(url));
}

export const EXIFR_URL = 'https://cdn.jsdelivr.net/npm/exifr@latest/dist/lite.umd.js';

/**
 * Get image/video orientation based on dimensions
 * @param {number} width - Width in pixels
 * @param {number} height - Height in pixels
 * @returns {string} Orientation: 'Landscape', 'Portrait', or 'Square'
 */
export function getImageOrientation(width, height) {
  // Square: width equals height (or very close)
  if (Math.abs(width - height) < 5) {
    return 'Square';
  }

  // Portrait: height > width
  if (height > width) {
    return 'Portrait';
  }

  // Landscape: width > height
  return 'Landscape';
}

/**
 * Format ISO date string to human-readable format
 * @param {string} isoString - ISO date string
 * @returns {string} Formatted date string
 */
export function formatDateTime(isoString) {
  if (!isoString) return 'Unknown';

  try {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch (error) {
    return 'Invalid Date';
  }
}

const CORS_PROXY_URL = 'https://media-library-cors-proxy.aem-poc-lab.workers.dev/';

/**
 * Check if a URL is an external resource (not on AEM domains)
 * @param {string} url - URL to check
 * @returns {boolean} True if external
 */
export function isExternalResource(url) {
  if (!url) return false;
  return !url.includes('.aem.live') && !url.includes('.aem.page');
}

/**
 * Build full media URL from relative or partial URL
 * @param {string} mediaUrl - Media URL (can be relative or full)
 * @param {string} org - Organization name
 * @param {string} repo - Repository name
 * @returns {string} Full URL
 */
export function buildFullMediaUrl(mediaUrl, org, repo) {
  if (!mediaUrl) return '';

  try {
    // If already a valid absolute URL, return as is
    const url = new URL(mediaUrl);
    return url.href;
  } catch {
    // Build absolute URL from relative path
    if (org && repo) {
      const cleanUrl = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
      return `https://main--${repo}--${org}.aem.live${cleanUrl}`;
    }
    return mediaUrl;
  }
}

/**
 * Fetch with CORS proxy fallback
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithCorsProxy(url, options = {}) {
  const corsProxyUrl = CORS_PROXY_URL;

  try {
    // Try direct fetch first
    const response = await fetch(url, options);

    // If response is not OK, try CORS proxy
    if (!response.ok) {
      const proxyUrl = `${corsProxyUrl}?url=${encodeURIComponent(url)}`;
      return fetch(proxyUrl, options);
    }

    return response;
  } catch (directError) {
    // Check if it's a CORS-related error
    if (directError.name === 'TypeError'
        && (directError.message.includes('CORS')
        || directError.message.includes('blocked')
        || directError.message.includes('Access-Control-Allow-Origin')
        || directError.message.includes('Failed to fetch'))) {
      // Try CORS proxy as fallback
      const proxyUrl = `${corsProxyUrl}?url=${encodeURIComponent(url)}`;
      return fetch(proxyUrl, options);
    }

    // Re-throw non-CORS errors
    throw directError;
  }
}

export function createHash(str) {
  // Use a more robust hash algorithm
  let hash = 0;
  if (str.length === 0) return hash.toString(36).padStart(10, '0');

  for (let i = 0; i < str.length; i += 1) {
    const char = str.charCodeAt(i);
    hash = ((hash * 33) + char) % 2147483647;
  }

  // Convert to base36 and ensure minimum length of 10 characters
  const base36 = Math.abs(hash).toString(36);
  return base36.padStart(10, '0');
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / (k ** i)).toFixed(2))} ${sizes[i]}`;
}

export function extractMediaLocation(mediaUrl) {
  try {
    const url = new URL(mediaUrl);
    return {
      origin: url.origin,
      path: url.pathname,
      fullUrl: mediaUrl,
    };
  } catch (error) {
    // If it's not a valid URL, treat it as a relative path
    return {
      origin: '',
      path: mediaUrl,
      fullUrl: mediaUrl,
    };
  }
}

export function normalizeUrl(url) {
  if (!url) return '';

  try {
    const urlObj = new URL(url);
    const { pathname } = urlObj;

    // For SVG files, remove any query parameters and fragments
    if (pathname.toLowerCase().endsWith('.svg')) {
      return `${urlObj.protocol}//${urlObj.host}${pathname}`;
    }

    // For other files, return just the pathname
    return urlObj.pathname;
  } catch {
    // If it's not a valid URL, return as is (might be a relative path)
    return url;
  }
}

export function urlsMatch(url1, url2) {
  if (!url1 || !url2) return false;

  // Normalize both URLs to just their paths
  const path1 = normalizeUrl(url1);
  const path2 = normalizeUrl(url2);

  // Direct match
  if (path1 === path2) return true;

  // Handle cases where one might have leading slash and other doesn't
  const normalizedPath1 = path1.startsWith('/') ? path1 : `/${path1}`;
  const normalizedPath2 = path2.startsWith('/') ? path2 : `/${path2}`;

  if (normalizedPath1 === normalizedPath2) return true;

  // Handle relative paths by comparing file names
  const fileName1 = path1.split('/').pop();
  const fileName2 = path2.split('/').pop();

  return fileName1 === fileName2 && fileName1 && fileName2;
}

export function getEditUrl(org, repo, docPath) {
  // Remove .html extension if present
  const cleanPath = docPath.replace(/\.html$/, '');
  return `https://da.live/edit#/${org}/${repo}${cleanPath}`;
}

export function getViewUrl(org, repo, docPath) {
  // Remove .html extension and handle index pages
  const cleanPath = docPath.replace(/\.html$/, '').replace(/\/index$/, '/');
  return `https://main--${repo}--${org}.aem.page${cleanPath}`;
}

async function copyImageToClipboard(imageUrl) {
  // Use CORS proxy for external images to avoid CORS issues
  let fetchUrl = imageUrl;
  try {
    const url = new URL(imageUrl);
    // If it's an external URL (not same origin), use CORS proxy
    if (url.origin !== window.location.origin) {
      fetchUrl = `${CORS_PROXY_URL}?url=${encodeURIComponent(imageUrl)}`;
    }
  } catch (error) {
    // If URL parsing fails, use original URL
    fetchUrl = imageUrl;
  }

  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }

  const blob = await response.blob();

  let clipboardBlob = blob;
  let mimeType = blob.type;

  if (!['image/png', 'image/gif', 'image/webp'].includes(blob.type)) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = URL.createObjectURL(blob);
    });

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    clipboardBlob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });
    mimeType = 'image/png';

    URL.revokeObjectURL(img.src);
  }

  const clipboardItem = new ClipboardItem({ [mimeType]: clipboardBlob });
  await navigator.clipboard.write([clipboardItem]);
}

export async function copyMediaToClipboard(media) {
  const mediaUrl = media.url;
  const mediaType = getMediaType(media);

  try {
    if (mediaType === 'image') {
      // Copy actual image to clipboard
      await copyImageToClipboard(mediaUrl);
      return { heading: 'Copied', message: 'Resource Copied.' };
    }
    // For non-images, copy the URL as text
    await navigator.clipboard.writeText(mediaUrl);
    return { heading: 'Copied', message: 'Resource URL Copied.' };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to copy to clipboard:', error);
    return { heading: 'Error', message: 'Failed to copy Resource.' };
  }
}

export async function updateDocumentAltText(org, repo, docPath, mediaUrl, altText, imageIndex = 0) {
  const response = await daFetch(`${DA_ORIGIN}/source/${org}/${repo}${docPath}`);
  if (!response.ok) {
    throw new Error('Failed to fetch document');
  }

  const htmlContent = await response.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlContent, 'text/html');

  // Find all img elements with matching src
  const imgElements = doc.querySelectorAll('img');
  const matchingImages = [];

  imgElements.forEach((img) => {
    const imgSrc = img.getAttribute('src');
    if (imgSrc && urlsMatch(imgSrc, mediaUrl)) {
      matchingImages.push(img);
    }
  });

  // Update the specific image at the given index
  if (!matchingImages[imageIndex]) {
    throw new Error(`No matching image found at index ${imageIndex}`);
  }

  matchingImages[imageIndex].setAttribute('alt', altText);

  // Save the entire document, not just the main content
  const fullDocumentContent = doc.documentElement.outerHTML;
  const blob = new Blob([fullDocumentContent], { type: 'text/html' });
  const formData = new FormData();
  formData.append('data', blob);

  const saveResponse = await daFetch(`${DA_ORIGIN}/source/${org}/${repo}${docPath}`, {
    method: 'PUT',
    body: formData,
  });

  if (!saveResponse.ok) {
    throw new Error('Failed to save document');
  }
}

export async function createSheet(data, type = 'sheet') {
  const sheetMeta = {
    total: data.length,
    limit: data.length,
    offset: 0,
    data,
    ':type': type,
  };
  const blob = new Blob([JSON.stringify(sheetMeta, null, 2)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);
  return formData;
}

export function splitPathParts(fullPath) {
  const pathParts = fullPath.split('/').filter(Boolean);
  const relativePathParts = pathParts.slice(2);
  return { pathParts, relativePathParts };
}

// URL path extraction utilities
export function getFileName(url) {
  try {
    const urlObj = new URL(url);
    const { pathname } = urlObj;
    return pathname.split('/').pop() || '';
  } catch {
    return url.split('/').pop() || '';
  }
}

// File type detection utilities
export function isImage(url) {
  const ext = extractFileExtension(url);
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext);
}

export function isVideo(url) {
  const ext = extractFileExtension(url);
  return ['mp4', 'webm', 'mov', 'avi'].includes(ext);
}

export function isPdf(url) {
  const ext = extractFileExtension(url);
  return ext === 'pdf';
}

export function isFragment(media) {
  const type = media.type || '';
  return type.startsWith('fragment >');
}

// Content environment detection
export const DA_CONTENT_ENVS = {
  local: 'http://localhost:8788',
  stage: 'https://stage-content.da.live',
  prod: 'https://content.da.live',
};

export function getContentEnv(location, key, envs) {
  const { href } = location;
  const query = new URL(href).searchParams.get(key);
  if (query && query === 'reset') {
    localStorage.removeItem(key);
  } else if (query) {
    localStorage.setItem(key, query);
  }
  const env = envs[localStorage.getItem(key) || 'prod'];
  return location.origin === 'https://da.page' ? env.replace('.live', '.page') : env;
}

export const CONTENT_ORIGIN = (() => getContentEnv(window.location, 'da-content', DA_CONTENT_ENVS))();

export function getOrgRepoFrmUrl(siteUrl) {
  if (!siteUrl) {
    throw new Error('Site URL is required');
  }

  try {
    const url = new URL(siteUrl);
    const { hostname } = url;

    const match = hostname.match(/^main--([^--]+)--([^.]+)\.aem\.page$/);

    if (match) {
      const [, repo, org] = match;
      return { org, repo };
    }

    throw new Error(`Unable to parse AEM URL format from: ${siteUrl}`);
  } catch (error) {
    throw new Error(`Invalid URL format: ${siteUrl}. Expected format: https://main--site--org.aem.page`);
  }
}

export async function validateSitePath(sitePath) {
  if (!sitePath) {
    return { valid: false, error: 'No site path provided' };
  }

  const parts = sitePath.split('/').filter(Boolean);

  if (parts.length < 2) {
    return {
      valid: false,
      error: 'Site path must have at least org and repo',
    };
  }

  const [org, repo, ...restPath] = parts;

  if (restPath.length === 0) {
    try {
      const listUrl = `${DA_ORIGIN}/list/${org}/${repo}`;
      const resp = await daFetch(listUrl);

      if (resp.ok) {
        const json = await resp.json();

        if (!json || (Array.isArray(json) && json.length === 0)) {
          return {
            valid: false,
            error: `Site not found: ${org}/${repo}`,
          };
        }

        return { valid: true, org, repo };
      }

      if (resp.status === 404) {
        return { valid: false, error: `Site not found: ${org}/${repo}` };
      }

      if (resp.status === 401 || resp.status === 403) {
        return {
          valid: false,
          error: `Not authorized for: ${org}/${repo}`,
          suggestion: 'Are you logged into the correct profile?',
        };
      }

      return { valid: false, error: `Validation failed: ${resp.status}` };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  const lastSegment = restPath[restPath.length - 1];
  const parentParts = [org, repo, ...restPath.slice(0, -1)];
  const parentPath = `/${parentParts.join('/')}`;

  try {
    const listUrl = `${DA_ORIGIN}/list${parentPath}`;
    const resp = await daFetch(listUrl);

    if (!resp.ok) {
      if (resp.status === 404) {
        return {
          valid: false,
          error: `Parent path not found: ${parentPath}`,
        };
      }

      if (resp.status === 401 || resp.status === 403) {
        return {
          valid: false,
          error: `Not authorized for: ${org}/${repo}`,
          suggestion: 'Are you logged into the correct profile?',
        };
      }

      return { valid: false, error: `Validation failed: ${resp.status}` };
    }

    const json = await resp.json();

    if (!json || (Array.isArray(json) && json.length === 0)) {
      return {
        valid: false,
        error: `Parent path not found or empty: ${parentPath}`,
      };
    }

    const targetEntry = json.find((child) => {
      const childName = child.path.split('/').pop();
      return childName === lastSegment;
    });

    if (!targetEntry) {
      return {
        valid: false,
        error: `Path not found: ${lastSegment}`,
        suggestion: `Check that ${lastSegment} exists in ${parentPath}`,
      };
    }

    if (targetEntry.ext) {
      return {
        valid: false,
        error: 'Site path cannot point to a file',
        suggestion: parentPath,
        isFile: true,
        fileType: targetEntry.ext,
        fileName: lastSegment,
      };
    }

    return { valid: true, org, repo };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

export function saveRecentSite(sitePath) {
  const recentSites = JSON.parse(localStorage.getItem('da-sites')) || [];

  const pathWithoutSlash = sitePath.substring(1);
  const parts = pathWithoutSlash.split('/');
  const basePath = parts.length > 2 ? `${parts[0]}/${parts[1]}` : pathWithoutSlash;

  const filtered = recentSites.filter((site) => site !== basePath);

  filtered.unshift(basePath);

  const limited = filtered.slice(0, 10);

  localStorage.setItem('da-sites', JSON.stringify(limited));
}

export function getBasePath() {
  const hash = window.location.hash?.replace('#', '');
  if (!hash) return null;
  const parts = hash.split('/').slice(3);
  return `/${parts.join('/')}`;
}

export function resolveAbsolutePath(path, isFolder = false) {
  const basePath = getBasePath();
  if (!basePath || path.startsWith(basePath)) return path;
  if (isFolder && path === '/') return basePath;
  return `${basePath}${path}`;
}

export async function ensureAuthenticated() {
  const { initIms } = await import('../../../utils/daFetch.js');
  const imsResult = await initIms();

  if (!imsResult || imsResult.anonymous) {
    const { loadIms, handleSignIn } = await import('../../../utils/ims.js');
    await loadIms();
    handleSignIn();
    return false;
  }

  return true;
}

export function getLocalStorageItem(key, defaultValue = null) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

export function setLocalStorageItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}
