import { MediaType } from './constants.js';

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

export function extractFileExtension(filePath) {
  if (!filePath) return '';
  const cleanPath = filePath.split(/[#?]/)[0];
  return cleanPath.split('.').pop()?.toLowerCase() || '';
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

export function getImageOrientation(width, height) {
  if (Math.abs(width - height) < 5) {
    return 'Square';
  }
  if (height > width) {
    return 'Portrait';
  }
  return 'Landscape';
}
