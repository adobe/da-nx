import { daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import {
  MediaType,
  Domains,
  Paths,
  Storage,
  DA_LIVE_EDIT_BASE,
  CORS_PROXY_URL,
} from './constants.js';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi'];
const DOCUMENT_EXTENSIONS = ['pdf'];
const AUDIO_EXTENSIONS = ['mp3', 'wav'];

function extractFileExtension(filePath) {
  if (!filePath) return '';
  const cleanPath = filePath.split(/[#?]/)[0];
  return cleanPath.split('.').pop()?.toLowerCase() || '';
}

function isSvgFile(media) {
  const url = media?.url || '';
  return extractFileExtension(url) === 'svg';
}

function typeFromExt(ext) {
  if (IMAGE_EXTENSIONS.includes(ext)) return MediaType.IMAGE;
  if (VIDEO_EXTENSIONS.includes(ext)) return MediaType.VIDEO;
  if (DOCUMENT_EXTENSIONS.includes(ext)) return MediaType.DOCUMENT;
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  return 'unknown';
}

export function getMediaType(media) {
  const type = media?.type || '';
  const semanticTypes = [
    MediaType.IMAGE, MediaType.VIDEO, MediaType.DOCUMENT,
    MediaType.FRAGMENT, MediaType.LINK,
  ];
  if (semanticTypes.includes(type)) return type;
  if (type.includes(' > ')) {
    const [baseType] = type.split(' > ');
    const baseMap = {
      img: MediaType.IMAGE,
      image: MediaType.IMAGE,
      video: MediaType.VIDEO,
      document: MediaType.DOCUMENT,
      fragment: MediaType.FRAGMENT,
      content: MediaType.FRAGMENT,
      link: MediaType.LINK,
    };
    return baseMap[baseType] || MediaType.LINK;
  }
  const ext = extractFileExtension(media?.url || '');
  return typeFromExt(ext);
}

const ALLOWED_SUBTYPE_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
]);

export function getSubtype(media) {
  const ext = extractFileExtension(media?.url || '');
  if (ext && ALLOWED_SUBTYPE_EXTENSIONS.has(ext)) return ext.toUpperCase();
  if (media?.type === MediaType.FRAGMENT) return 'Fragment';
  if (media?.type === MediaType.VIDEO || isExternalVideoUrl(media?.url || '')) return 'Video';
  return 'External';
}

export { isSvgFile, extractFileExtension };

export function sortMediaData(mediaData) {
  return [...mediaData].sort((a, b) => {
    const tsA = a.timestamp ?? 0;
    const tsB = b.timestamp ?? 0;
    const timeDiff = tsB - tsA;

    if (timeDiff !== 0) return timeDiff;

    const docPathA = a.doc || '';
    const docPathB = b.doc || '';

    const depthA = docPathA ? docPathA.split('/').filter((p) => p).length : 999;
    const depthB = docPathB ? docPathB.split('/').filter((p) => p).length : 999;

    const depthDiff = depthA - depthB;
    if (depthDiff !== 0) return depthDiff;

    const nameA = (a.name || '').toLowerCase();
    const nameB = (b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

export function getVideoThumbnail(videoUrl) {
  if (!videoUrl) return null;

  const youtubeMatch = videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|)([^&\n?#\/]+)|youtu\.be\/([^&\n?#\/]+))/);
  if (youtubeMatch) {
    const id = youtubeMatch[1] || youtubeMatch[2];
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
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
  if (!url || typeof url !== 'string') return false;

  const supportedPatterns = [
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|)[^&\n?#\/]+|youtu\.be\/[^&\n?#\/]+)/,
    /(?:^https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)(?:\/|$)/,
    /vimeo\.com\/(\d+)/,
    /(?:dailymotion\.com\/video\/|dai\.ly\/)/,
    /scene7\.com\/is\/content\//,
    /marketing\.adobe\.com\/is\/content\//,
  ];

  return supportedPatterns.some((pattern) => pattern.test(url));
}

export function getVideoEmbedUrl(videoUrl) {
  if (!videoUrl) return null;

  const youtubeMatch = videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|)([^&\n?#\/]+)|youtu\.be\/([^&\n?#\/]+))/);
  if (youtubeMatch) {
    const id = youtubeMatch[1] || youtubeMatch[2];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  const vimeoMatch = videoUrl.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  const dailymotionMatch = videoUrl.match(/(?:dailymotion\.com\/video\/|dai\.ly\/)([^&\n?#]+)/);
  if (dailymotionMatch) {
    return `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}`;
  }

  return null;
}

export const EXIFR_URL = 'https://cdn.jsdelivr.net/npm/exifr@latest/dist/lite.umd.js';

export function getImageOrientation(width, height) {
  if (Math.abs(width - height) < 5) {
    return 'Square';
  }
  if (height > width) {
    return 'Portrait';
  }
  return 'Landscape';
}

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

export function isExternalUrl(url) {
  if (!url) return false;
  return !url.includes(Domains.AEM_LIVE) && !url.includes(Domains.AEM_PAGE);
}

export function resolveMediaUrl(mediaUrl, org, repo) {
  if (!mediaUrl) return '';

  try {
    const url = new URL(mediaUrl);
    return url.href;
  } catch {
    if (org && repo) {
      const cleanUrl = mediaUrl.startsWith('/') ? mediaUrl : `/${mediaUrl}`;
      return `https://main--${repo}--${org}${Domains.AEM_LIVE}${cleanUrl}`;
    }
    return mediaUrl;
  }
}

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / (k ** i)).toFixed(2))} ${sizes[i]}`;
}

export function pluralize(singular, plural, count) {
  return count === 1 ? singular : plural;
}

export function parseMediaUrl(mediaUrl) {
  try {
    const url = new URL(mediaUrl);
    return {
      origin: url.origin,
      path: url.pathname,
      fullUrl: mediaUrl,
    };
  } catch (error) {
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
    if (pathname.toLowerCase().endsWith('.svg')) {
      return `${urlObj.protocol}//${urlObj.host}${pathname}`;
    }
    return urlObj.pathname;
  } catch {
    return url;
  }
}

export function urlsMatch(url1, url2) {
  if (!url1 || !url2) return false;

  const path1 = normalizeUrl(url1);
  const path2 = normalizeUrl(url2);
  if (path1 === path2) return true;

  const normalizedPath1 = path1.startsWith('/') ? path1 : `/${path1}`;
  const normalizedPath2 = path2.startsWith('/') ? path2 : `/${path2}`;

  if (normalizedPath1 === normalizedPath2) return true;

  const fileName1 = path1.split('/').pop();
  const fileName2 = path2.split('/').pop();

  return fileName1 === fileName2 && fileName1 && fileName2;
}

function normalizeDocPath(docPath) {
  if (!docPath) return '';
  return docPath.replace(new RegExp(`${Paths.EXT_HTML.replace('.', '\\.')}$`), '')
    .replace(new RegExp(`${Paths.EXT_MD.replace('.', '\\.')}$`), '');
}

export function formatDocPath(docPath) {
  const normalized = normalizeDocPath(docPath);
  return normalized === Paths.INDEX || normalized === 'index' ? '/' : (normalized || '/');
}

export function getEditUrl(org, repo, docPath) {
  const cleanPath = normalizeDocPath(docPath);
  return `${DA_LIVE_EDIT_BASE}${org}/${repo}${cleanPath}`;
}

export function getViewUrl(org, repo, docPath) {
  const normalized = normalizeDocPath(docPath);
  const cleanPath = normalized === Paths.INDEX || normalized === 'index' ? '/' : normalized;
  return `https://main--${repo}--${org}${Domains.AEM_PAGE}${cleanPath}`;
}

async function copyImageToClipboard(imageUrl) {
  let fetchUrl = imageUrl;
  try {
    const url = new URL(imageUrl);
    if (url.origin !== window.location.origin) {
      fetchUrl = `${CORS_PROXY_URL}?url=${encodeURIComponent(imageUrl)}`;
    }
  } catch (error) {
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
      await copyImageToClipboard(mediaUrl);
      return { heading: 'Copied', message: 'Resource Copied.' };
    }
    await navigator.clipboard.writeText(mediaUrl);
    return { heading: 'Copied', message: 'Resource URL Copied.' };
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to copy to clipboard:', error);
    return { heading: 'Error', message: 'Failed to copy Resource.' };
  }
}

export function getFileName(url) {
  try {
    const urlObj = new URL(url);
    const { pathname } = urlObj;
    return pathname.split('/').pop() || '';
  } catch {
    return url.split('/').pop() || '';
  }
}

export function isImage(url) {
  const ext = extractFileExtension(url);
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext);
}

const CARD_IMAGE_WIDTHS = [400, 500, 750];

export function optimizeImageUrls(src, widths = CARD_IMAGE_WIDTHS) {
  if (!src) return null;
  try {
    const url = src.startsWith('http') ? new URL(src) : new URL(src, window.location.href);
    const base = `${url.origin}${url.pathname}`;
    const ext = url.pathname.split('.').pop()?.toLowerCase() || 'jpg';
    if (ext === 'svg') return null;

    const w = Array.isArray(widths) ? widths : [widths];
    const webpSrcset = w
      .map((width) => `${base}?width=${width}&format=webply&optimize=medium ${width}w`)
      .join(', ');
    const fallbackSrcset = w
      .map((width) => `${base}?width=${width}&format=${ext}&optimize=medium ${width}w`)
      .join(', ');
    const fallbackUrl = `${base}?width=${w[w.length - 1]}&format=${ext}&optimize=medium`;

    return {
      webpSrcset,
      fallbackSrcset,
      fallbackUrl,
    };
  } catch {
    return null;
  }
}

export const CARD_IMAGE_SIZES = '(max-width: 480px) 100vw, (max-width: 768px) 50vw, 300px';

export function isVideo(url) {
  const ext = extractFileExtension(url);
  return ['mp4', 'webm', 'mov', 'avi'].includes(ext);
}

export function isPdfUrl(url) {
  const ext = extractFileExtension(url);
  return ext === 'pdf';
}

export function isFragmentMedia(media) {
  const type = media?.type || '';
  return type === MediaType.FRAGMENT || type === 'content > fragment';
}

export function parseOrgRepoFromUrl(siteUrl) {
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
  const recentSites = JSON.parse(localStorage.getItem(Storage.DA_SITES)) || [];

  const pathWithoutSlash = sitePath.substring(1);
  const parts = pathWithoutSlash.split('/');
  const basePath = parts.length > 2 ? `${parts[0]}/${parts[1]}` : pathWithoutSlash;

  const filtered = recentSites.filter((site) => site !== basePath);

  filtered.unshift(basePath);

  const limited = filtered.slice(0, 10);

  localStorage.setItem(Storage.DA_SITES, JSON.stringify(limited));
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

function escapeCsvCell(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportFilename(org, repo, filterName) {
  const slug = (s) => (s || 'unknown').replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-');
  const filterSlug = (filterName || 'all').replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '');
  const date = new Date().toISOString().slice(0, 10);
  return `${slug(org)}-${slug(repo)}-media-${filterSlug || 'all'}-${date}.csv`;
}

export function exportToCsv(mediaData, options = {}) {
  if (!mediaData || mediaData.length === 0) return;

  const { org, repo, filterName } = options;
  const filename = (org && repo)
    ? exportFilename(org, repo, filterName)
    : `media-export-${Date.now()}.csv`;

  const headers = ['Name', 'URL', 'Type', 'References', 'Status', 'Usage Count', 'Alt'];
  const rows = mediaData.map((item) => [
    escapeCsvCell(item.name || ''),
    escapeCsvCell(item.url || ''),
    escapeCsvCell(getSubtype(item)),
    escapeCsvCell(item.doc || ''),
    escapeCsvCell(item.status || ''),
    escapeCsvCell(item.usageCount ?? ''),
    escapeCsvCell(item.alt ?? ''),
  ]);
  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
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
