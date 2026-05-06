import {
  entryTypeFromExtension,
  isFolder,
  RESOURCE_TYPE,
} from '../../utils.js';
import { itemHashPath } from '../../../../utils/daFiles.js';

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
  window.open(url.href, '_blank', 'noopener,noreferrer');
}

function openMedia(path) {
  const url = new URL(window.location.href);
  url.pathname = '/media';
  url.search = '';
  url.hash = `#${path}`;
  window.open(url.href, '_blank', 'noopener,noreferrer');
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
