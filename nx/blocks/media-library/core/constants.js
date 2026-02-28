export const IndexConfig = Object.freeze({
  ALIGNMENT_TOLERANCE_MS: 120_000,
  MEDIA_ASSOCIATION_WINDOW_MS: 5000,
  INCREMENTAL_WINDOW_MS: 10000,
  API_PAGE_SIZE: 1000,
  MAX_CONCURRENT_FETCHES: 10,
});

export const Operation = Object.freeze({
  EXTLINKS: 'extlinks-parsed',
  MARKDOWN_PARSED: 'markdown-parsed',
});

export const MediaType = Object.freeze({
  IMAGE: 'image',
  VIDEO: 'video',
  DOCUMENT: 'document',
  FRAGMENT: 'fragment',
  LINK: 'link',
});

export const Domains = Object.freeze({
  AEM_PAGE: '.aem.page',
  AEM_LIVE: '.aem.live',
  SAME_ORIGIN: ['.aem.page', '.aem.live'],
});

export const Paths = Object.freeze({
  FRAGMENTS: '/fragments/',
  MEDIA: '/media/',
  INDEX: '/index',
  EXT_HTML: '.html',
  EXT_MD: '.md',
});

export const IndexFiles = Object.freeze({
  FOLDER: '.da/media-insights',
  MEDIA_INDEX: 'index.json',
  MEDIA_INDEX_META: 'index-meta.json',
  INDEX_LOCK: 'index-lock.json',
});

export const SheetNames = Object.freeze({
  MEDIA: 'media',
  USAGE: 'usage',
});

export const Storage = Object.freeze({
  DA_SITES: 'da-sites',
  DA_ORGS: 'da-orgs',
  PINNED_FOLDERS_PREFIX: 'media-library-pinned-folders-',
  DA_CONTENT: 'da-content',
});

export const DA_LIVE_EDIT_BASE = 'https://da.live/edit#/';
export const CORS_PROXY_URL = 'https://media-library-cors-proxy.aem-poc-lab.workers.dev/';
export const QUERY_RESET = 'reset';
export const MEDIA_UNDERSCORE_PREFIX = 'media_';

const mediaExtensions = {
  pdf: ['pdf'],
  svg: ['svg'],
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'],
  video: ['mp4', 'webm', 'mov', 'avi', 'm4v'],
};

const mediaExtensionRegex = (() => {
  const exts = [
    ...mediaExtensions.pdf,
    ...mediaExtensions.svg,
    ...mediaExtensions.image,
    ...mediaExtensions.video,
  ];
  return new RegExp(`\\.(${exts.join('|')})([?#]|$)`, 'i');
})();

const categoryImg = 'img';

export const ExternalMedia = Object.freeze({
  CATEGORY_IMG: categoryImg,
  EXTENSIONS: mediaExtensions,
  EXTENSION_REGEX: mediaExtensionRegex,
  HOST_PATTERNS: [
    { host: /adobeaemcloud\.com$/i, pathContains: 'urn:aaid:aem', typeFromPath: true },
    { host: /youtube\.com$/i, type: MediaType.VIDEO },
    { host: /youtu\.be$/i, type: MediaType.VIDEO },
    { host: /vimeo\.com$/i, type: MediaType.VIDEO },
    { host: /player\.vimeo\.com$/i, type: MediaType.VIDEO },
    { host: /unsplash\.com$/i, type: categoryImg },
    { host: /images\.unsplash\.com$/i, type: categoryImg },
  ],
});

export const ICON_DOC_EXCLUDE = new Set(['svg', 'pdf', 'image', 'link', 'syntax']);
