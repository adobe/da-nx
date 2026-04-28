export const IndexConfig = Object.freeze({
  ALIGNMENT_TOLERANCE_MS: 120_000,
  MEDIA_ASSOCIATION_WINDOW_MS: 5000,
  INCREMENTAL_WINDOW_MS: 10000,
  AUDITLOG_BUFFER_MS: 5 * 60 * 1000, /* 5min - overlap to catch delayed auditlog entries */
  API_PAGE_SIZE: 1000,
  MAX_CONCURRENT_FETCHES: 10,
  MAX_CONCURRENT_PAGE_FETCHES: 20, /* Aggressive - backfill uses 25, etcFetch has high rate limit */
  STATUS_POLL_INTERVAL_MS: 1000,
  STATUS_POLL_MAX_DURATION_MS: 30 * 60 * 1000, /* 30 minutes */
  STATUS_POLL_CONCURRENCY: 3,
  DISCOVERY_SMALL_SITE_THRESHOLD: 20_000,
  DISCOVERY_TARGET_PATHS_PER_JOB: 10_000, /* Match backfill to avoid incomplete partition jobs */
  DISCOVERY_MAX_PATHS_PER_JOB: 250,
  /* Larger batch to minimize UI update overhead - updates every ~100 seconds */
  USAGE_MAP_PROGRESSIVE_BATCH_SIZE: 1000,
  /* Index chunking configuration */
  MEDIA_INDEX_CHUNK_SIZE: 20_000, /* Entries per chunk (~15-20MB per chunk) */
  LOCK_HEARTBEAT_INTERVAL_MS: 60_000,
  LOCK_STALE_THRESHOLD_MS: 10 * 60_000,
  BUILD_MAX_DURATION_MS: 30 * 60 * 1000,
  INDEX_POLLING_INTERVAL_MS: 60_000,
  LOGS_POLLING_INTERVAL_MS: 120_000,
  LOCK_CHECK_INTERVAL_MS: 5_000,
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

const AEM_PAGE = '.aem.page';
const AEM_LIVE = '.aem.live';
const PREVIEW_DA_LIVE = '.preview.da.live';

export const Domains = Object.freeze({
  AEM_PAGE,
  AEM_LIVE,
  PREVIEW_DA_LIVE,
  SAME_ORIGIN: [AEM_PAGE, AEM_LIVE],
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
  MEDIA_INDEX_CHUNK_PREFIX: 'index-',
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
export const MEDIA_UNDERSCORE_PREFIX = 'media_';
export const YOUTUBE_VIDEO_RE = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)([^&\n?#/]+)|youtu\.be\/([^&\n?#/]+))/;
export const VIMEO_VIDEO_RE = /(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)(?:$|[/?#])/;
export const DAILYMOTION_VIDEO_RE = /(?:dailymotion\.com\/video\/|dai\.ly\/)([^&\n?#/]+)/;
export const SCENE7_VIDEO_RE = /scene7\.com\/is\/content\//;
export const DYNAMIC_MEDIA_VIDEO_RE = /\/is\/content\//;

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
    { host: /images\.unsplash\.com$/i, type: categoryImg },
  ],
});

/**
 * Worker-safe origin resolution
 * These functions accept a location object and work in both main thread and worker contexts.
 */

const DA_ADMIN_ENVS = {
  local: 'http://localhost:8787',
  stage: 'https://stage-admin.da.live',
  prod: 'https://admin.da.live',
};

const DA_ETC_ENVS = {
  local: 'http://localhost:8787',
  prod: 'https://da-etc.adobeaem.workers.dev',
};

/**
 * Resolve DA admin origin from location (worker-safe)
 * @param {Location|{href: string, origin: string}} location
 * @returns {string}
 */
export function resolveDaOrigin(location) {
  const { href, origin } = location;
  const url = new URL(href);
  const query = url.searchParams.get('da-admin');

  let env = 'prod';
  if (query && query !== 'reset') {
    env = query;
  } else if (typeof localStorage !== 'undefined') {
    env = localStorage.getItem('da-admin') || 'prod';
  }

  const daOrigin = DA_ADMIN_ENVS[env] || DA_ADMIN_ENVS.prod;
  return origin === 'https://da.page' ? daOrigin.replace('.live', '.page') : daOrigin;
}

/**
 * Resolve DA ETC (CORS proxy) origin from location (worker-safe)
 * @param {Location|{href: string}} location
 * @returns {string}
 */
export function resolveDaEtcOrigin(location) {
  const { href } = location;
  const url = new URL(href);
  const param = url.searchParams.get('da-etc');

  if (param) {
    return param === 'local' ? DA_ETC_ENVS.local : param;
  }

  if (href.includes('localhost')) {
    return DA_ETC_ENVS.local;
  }

  return DA_ETC_ENVS.prod;
}

/**
 * Resolve AEM origin (currently static, but kept as function for consistency)
 * @returns {string}
 */
export function resolveAemOrigin() {
  return 'https://admin.hlx.page';
}

// Main-thread convenience exports (use window.location)
// IMPORTANT: These will fail in worker context - use resolve* functions instead
export const DA_ORIGIN = typeof window !== 'undefined'
  ? resolveDaOrigin(window.location)
  : DA_ADMIN_ENVS.prod;

export const AEM_ORIGIN = resolveAemOrigin();

export const DA_ETC_ORIGIN = typeof window !== 'undefined'
  ? resolveDaEtcOrigin(window.location)
  : DA_ETC_ENVS.prod;
