import {
  entryTypeFromExtension,
  isFolder,
  RESOURCE_TYPE,
} from '../../utils.js';
import { itemHashPath } from '../../../../utils/daFiles.js';

function addCacheBustQueryParam(href) {
  const raw = typeof href === 'string' ? href.trim() : '';
  if (!raw) return '';
  try {
    const url = new URL(raw, window.location.href);
    url.searchParams.set('nocache', `${Date.now()}`);
    return url.href;
  } catch {
    const separator = raw.includes('?') ? '&' : '?';
    return `${raw}${separator}nocache=${Date.now()}`;
  }
}

export function openUrl({ href, cacheBust = false } = {}) {
  const raw = typeof href === 'string' ? href.trim() : '';
  const next = cacheBust ? addCacheBustQueryParam(raw) : raw;
  if (!next) return;
  window.open(next, '_blank', 'noopener,noreferrer');
}

function openDocument(path) {
  const url = new URL(window.location.href);
  url.pathname = '/canvas';
  url.search = '';
  url.hash = `#/${path}`;
  window.location.assign(url.href);
}

function openSheet(path) {
  const url = new URL(window.location.href);
  url.pathname = '/sheet';
  url.search = '';
  url.hash = `#/${path}`;
  openUrl({ href: url.href });
}

function openMedia(path) {
  const url = new URL(window.location.href);
  url.pathname = '/media';
  url.search = '';
  url.hash = `#${path}`;
  openUrl({ href: url.href });
}

export function open({ item }) {
  if (!item) return;
  if (isFolder(item)) {
    window.location.hash = `#${item.path}`;
    return;
  }
  const entryType = entryTypeFromExtension(item.ext);
  const hashPath = itemHashPath(item);
  if (entryType === RESOURCE_TYPE.document) {
    openDocument(hashPath);
    return;
  }
  if (entryType === RESOURCE_TYPE.sheet) {
    openSheet(hashPath);
    return;
  }
  if (entryType === RESOURCE_TYPE.media) {
    openMedia(item.path);
  }
}
