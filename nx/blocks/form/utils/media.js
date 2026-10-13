import { media } from '../../../deps/da-sc-sdk/dist/index.js';

export const extensionOf = (fileName) => (fileName?.includes('.') ? fileName.split('.').pop().toLowerCase() : '');

const MEDIA_BUS_PREFIX = './media_';
const UNSAFE_MEDIA_BUS_CHARS = /[\s<>"']/;
const WEB_PROTOCOLS = ['http:', 'https:'];

function parseHref(href, base) {
  try {
    return new URL(href, base);
  } catch {
    return undefined;
  }
}

const isWebHref = (href) => WEB_PROTOCOLS.includes(parseHref(href)?.protocol);

const isMediaBusHref = (href) => href.startsWith(MEDIA_BUS_PREFIX)
  && !UNSAFE_MEDIA_BUS_CHARS.test(href);

export function isAssetHref(href) {
  if (typeof href !== 'string' || !href.trim()) return false;
  return isMediaBusHref(href) || isWebHref(href);
}

function resolvePreviewHref({ href, previewOrigin }) {
  if (isWebHref(href)) return href;
  return previewOrigin ? parseHref(href, `${previewOrigin}/`)?.href : undefined;
}

export const MEDIA_KINDS = Object.freeze({ image: 'image', video: 'video', file: 'file' });

const VIDEO_EXTENSIONS = new Set(['mp4', 'mov']);
// Safari draws no frame for a video that only loads its metadata unless it starts past zero.
const VIDEO_FIRST_FRAME = 't=0.1';

function firstFrameHref(href) {
  const url = href ? parseHref(href) : undefined;
  if (url) {
    url.hash = VIDEO_FIRST_FRAME;
  }
  return url?.href;
}

function fileNameFromHref(href) {
  const lastSegment = href.split(/[?#]/)[0].split('/').pop();
  try {
    return decodeURIComponent(lastSegment);
  } catch {
    return lastSegment;
  }
}

// Images follow the SDK, so the field previews exactly what is delivered as an image.
function mediaKindOf(href) {
  if (media.isImage(href)) {
    return MEDIA_KINDS.image;
  }
  if (VIDEO_EXTENSIONS.has(extensionOf(fileNameFromHref(href)))) {
    return MEDIA_KINDS.video;
  }
  return MEDIA_KINDS.file;
}

// A video previews its own first frame, so no host needs to offer a thumbnail.
function previewHrefOf({ href, kind, previewOrigin }) {
  if (kind === MEDIA_KINDS.image) {
    return resolvePreviewHref({ href, previewOrigin });
  }
  if (kind === MEDIA_KINDS.video) {
    return firstFrameHref(resolvePreviewHref({ href, previewOrigin }));
  }
  return undefined;
}

// Describes a stored media value for display, with its name, its kind and the URL to preview.
export function describeMedia({ href, name, previewOrigin }) {
  if (!isAssetHref(href)) {
    return { name: name || '', kind: MEDIA_KINDS.file, previewHref: undefined };
  }
  const kind = mediaKindOf(href);
  return {
    name: name || fileNameFromHref(href),
    kind,
    previewHref: previewHrefOf({ href, kind, previewOrigin }),
  };
}

function decodeForDisplay(href) {
  try {
    return decodeURI(href);
  } catch {
    return href;
  }
}

// Splits a URL for display into the path before its file name, the file name's stem and the
// tail with its extension and query. Long URLs are cut in that order, so the extension stays.
export function splitHrefForDisplay(href) {
  const text = decodeForDisplay(href);
  const queryStart = text.search(/[?#]/);
  const pathEnd = queryStart === -1 ? text.length : queryStart;
  const stemStart = text.lastIndexOf('/', pathEnd - 1) + 1;
  const dot = text.lastIndexOf('.', pathEnd - 1);
  const tailStart = dot > stemStart ? dot : pathEnd;
  return {
    base: text.slice(0, stemStart),
    stem: text.slice(stemStart, tailStart),
    tail: text.slice(tailStart),
  };
}
