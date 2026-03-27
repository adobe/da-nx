import {
  MediaType,
  Operation,
  ExternalMedia,
  Domains,
  YOUTUBE_VIDEO_RE,
  VIMEO_VIDEO_RE,
  DAILYMOTION_VIDEO_RE,
  SCENE7_VIDEO_RE,
  DYNAMIC_MEDIA_VIDEO_RE,
} from './constants.js';

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'avi'];
const DOCUMENT_EXTENSIONS = ['pdf'];
const AUDIO_EXTENSIONS = ['mp3', 'wav'];

const ALLOWED_SUBTYPE_EXTENSIONS = new Set([
  ...IMAGE_EXTENSIONS,
  ...VIDEO_EXTENSIONS,
  ...DOCUMENT_EXTENSIONS,
  ...AUDIO_EXTENSIONS,
]);

export const EXIFR_URL = 'https://cdn.jsdelivr.net/npm/exifr@latest/dist/lite.umd.js';

// Extracts lowercase extension from path (ignores query/hash).
export function extractFileExtension(filePath) {
  if (!filePath) return '';
  const cleanPath = filePath.split(/[#?]/)[0];
  return cleanPath.split('.').pop()?.toLowerCase() || '';
}

export const UI_EXCLUDED_MEDIA_BASENAMES = Object.freeze([
  'default-meta-image.png',
]);

export function isUiExcludedMediaItem(item) {
  if (!item?.url || typeof item.url !== 'string') return false;
  const path = item.url.split('?')[0].split('#')[0];
  const base = (path.split('/').pop() || '').toLowerCase();
  return UI_EXCLUDED_MEDIA_BASENAMES.includes(base);
}

function typeFromExt(ext) {
  if (IMAGE_EXTENSIONS.includes(ext)) return MediaType.IMAGE;
  if (VIDEO_EXTENSIONS.includes(ext)) return MediaType.VIDEO;
  if (DOCUMENT_EXTENSIONS.includes(ext)) return MediaType.DOCUMENT;
  if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  return 'unknown';
}

function isExternalUrl(url) {
  if (!url || !url.startsWith('http')) return false;
  return !Domains.SAME_ORIGIN.some((domain) => url.includes(domain));
}

// Returns media type: image, video, document, fragment, link, or from extension.
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

// True for YouTube, Vimeo, Dailymotion, and Dynamic Media /is/content/ URLs.
export function isExternalVideoUrl(url) {
  if (!url || typeof url !== 'string') return false;

  const supportedPatterns = [
    YOUTUBE_VIDEO_RE,
    VIMEO_VIDEO_RE,
    DAILYMOTION_VIDEO_RE,
    SCENE7_VIDEO_RE,
    DYNAMIC_MEDIA_VIDEO_RE,
  ];

  return supportedPatterns.some((pattern) => pattern.test(url));
}

export function getExternalMediaTypeInfo(url) {
  if (!url || !url.startsWith('http') || !isExternalUrl(url)) return null;

  try {
    const parsed = new URL(url);
    const pathPart = parsed.pathname.split('?')[0].split('#')[0];
    const pathLower = pathPart.toLowerCase();

    const extMatch = pathLower.match(ExternalMedia.EXTENSION_REGEX);
    if (extMatch) {
      const ext = extMatch[1].toLowerCase();
      let type = MediaType.LINK;
      if (ExternalMedia.EXTENSIONS.pdf.includes(ext)) type = MediaType.DOCUMENT;
      else if (ExternalMedia.EXTENSIONS.svg.includes(ext)) type = MediaType.IMAGE;
      else if (ExternalMedia.EXTENSIONS.image.includes(ext)) type = MediaType.IMAGE;
      else if (ExternalMedia.EXTENSIONS.video.includes(ext)) type = MediaType.VIDEO;
      const name = pathPart.split('/').pop() || parsed.hostname;
      return { type, name };
    }

    // For videos without extension (YouTube, Vimeo), use full URL for display
    if (isExternalVideoUrl(url)) {
      return { type: MediaType.VIDEO, name: url };
    }

    const host = parsed.hostname;
    const matched = ExternalMedia.HOST_PATTERNS.find(
      (pattern) => pattern.host.test(host)
        && (!pattern.pathContains || parsed.pathname.includes(pattern.pathContains)),
    );
    if (matched) {
      const { type: patternType } = matched;

      if (matched.typeFromPath) {
        const lastSegment = pathPart.split('/').pop() || '';
        const segExt = lastSegment.split('.').pop()?.toLowerCase();
        const imageExts = [...ExternalMedia.EXTENSIONS.image, ...ExternalMedia.EXTENSIONS.svg];
        if (segExt && ExternalMedia.EXTENSIONS.video.includes(segExt)) {
          return { type: MediaType.VIDEO, name: lastSegment };
        }
        if (segExt && ExternalMedia.EXTENSIONS.pdf.includes(segExt)) {
          return { type: MediaType.DOCUMENT, name: lastSegment };
        }
        if (segExt && imageExts.includes(segExt)) {
          return { type: MediaType.IMAGE, name: lastSegment };
        }
      }

      if (patternType === ExternalMedia.CATEGORY_IMG) {
        return { type: MediaType.IMAGE, name: pathPart.split('/').pop() || host };
      }

      return { type: MediaType.LINK, name: host };
    }
  } catch {
    /* parse error */
  }

  return null;
}

export function isIndexedExternalMediaOperation(media) {
  const operation = media?.operation || media?.source;
  return operation === Operation.EXTLINKS || operation === Operation.MARKDOWN_PARSED;
}

export function isIndexedExternalMediaEntry(media) {
  if (!isIndexedExternalMediaOperation(media)) {
    return false;
  }

  return !!getExternalMediaTypeInfo(media?.url || '');
}

export function getSubtype(media) {
  const ext = extractFileExtension(media?.url || '');
  if (ext && ALLOWED_SUBTYPE_EXTENSIONS.has(ext)) return ext.toUpperCase();
  if (media?.type === MediaType.FRAGMENT) return 'Fragment';
  if (media?.type === MediaType.VIDEO || isExternalVideoUrl(media?.url || '')) return 'Video';
  return 'External';
}

export function isSvgFile(media) {
  const url = media?.url || '';
  return extractFileExtension(url) === 'svg';
}

export function isImage(url) {
  const ext = extractFileExtension(url);
  return IMAGE_EXTENSIONS.includes(ext);
}

export function isVideo(url) {
  const ext = extractFileExtension(url);
  return VIDEO_EXTENSIONS.includes(ext);
}

export function isPdfUrl(url) {
  const ext = extractFileExtension(url);
  return ext === 'pdf';
}

export function isFragmentMedia(media) {
  const type = media?.type || '';
  return type === MediaType.FRAGMENT || type === 'content > fragment';
}

/**
 * Normalizes external video URLs to canonical format for consistent hashing.
 * Converts all variations (youtube.com, youtu.be, player.vimeo.com, etc.) to standard format.
 */
export function normalizeExternalVideoUrl(url) {
  if (!url) return url;

  // Normalize YouTube URLs to standard watch format
  const youtubeMatch = url.match(YOUTUBE_VIDEO_RE);
  if (youtubeMatch) {
    const id = youtubeMatch[1] || youtubeMatch[2];
    return id ? `https://www.youtube.com/watch?v=${id}` : url;
  }

  // Normalize Vimeo URLs to standard format
  const vimeoMatch = url.match(VIMEO_VIDEO_RE);
  if (vimeoMatch) {
    return `https://vimeo.com/${vimeoMatch[1]}`;
  }

  // Normalize Dailymotion URLs to standard format
  const dailymotionMatch = url.match(DAILYMOTION_VIDEO_RE);
  if (dailymotionMatch) {
    return `https://www.dailymotion.com/video/${dailymotionMatch[1]}`;
  }

  return url;
}

// Returns thumbnail URL for YouTube/Vimeo/Dailymotion or null.
export function getVideoThumbnail(videoUrl) {
  if (!videoUrl) return null;

  const youtubeMatch = videoUrl.match(YOUTUBE_VIDEO_RE);
  if (youtubeMatch) {
    const id = youtubeMatch[1] || youtubeMatch[2];
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
  }

  const vimeoMatch = videoUrl.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    const videoId = vimeoMatch[1];
    return `https://i.vimeocdn.com/video/${videoId}_640.jpg`;
  }

  const dailymotionMatch = videoUrl.match(DAILYMOTION_VIDEO_RE);
  if (dailymotionMatch) {
    const videoId = dailymotionMatch[1];
    return `https://www.dailymotion.com/thumbnail/video/${videoId}`;
  }

  if (DYNAMIC_MEDIA_VIDEO_RE.test(videoUrl)) {
    const dynamicMediaBase = videoUrl.split('?')[0];
    return `${dynamicMediaBase}?fmt=jpeg&wid=300&hei=200`;
  }

  return null;
}

// Returns embed URL for YouTube/Vimeo/Dailymotion or null.
export function getVideoEmbedUrl(videoUrl) {
  if (!videoUrl) return null;

  const youtubeMatch = videoUrl.match(YOUTUBE_VIDEO_RE);
  if (youtubeMatch) {
    const id = youtubeMatch[1] || youtubeMatch[2];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }

  const vimeoMatch = videoUrl.match(VIMEO_VIDEO_RE);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  const dailymotionMatch = videoUrl.match(DAILYMOTION_VIDEO_RE);
  if (dailymotionMatch) {
    return `https://www.dailymotion.com/embed/video/${dailymotionMatch[1]}`;
  }

  return null;
}

export function getImageOrientation(width, height) {
  if (Math.abs(width - height) < 5) {
    return 'Square';
  }
  if (height > width) {
    return 'Portrait';
  }
  return 'Landscape';
}
