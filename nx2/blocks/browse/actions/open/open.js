import {
  entryTypeFromExtension,
  isFolder,
  RESOURCE_TYPE,
} from '../../utils.js';

function openDocument(path) {
  const url = new URL(window.location.href);
  url.pathname = '/canvas';
  url.hash = `#${path}`;
  window.location.assign(url.href);
}

function openSheet(path) {
  const url = new URL(window.location.href);
  url.pathname = '/sheet';
  url.search = '';
  url.hash = `#${path}`;
  window.open(url.href, '_blank', 'noopener,noreferrer');
}

export function open({ item }) {
  if (!item) return;
  const kind = entryTypeFromExtension(item.ext);
  if (kind === RESOURCE_TYPE.document) {
    openDocument(item.path);
    return;
  }
  if (kind === RESOURCE_TYPE.sheet) {
    openSheet(item.path);
    return;
  }
  if (isFolder(item)) {
    window.location.hash = `#${item.path}`;
  }
}
