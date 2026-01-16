import { getLocalStorageItem, setLocalStorageItem } from './utils.js';

function getStorageKey(org, repo) {
  return `media-library-pinned-folders-${org}-${repo}`;
}

export function loadPinnedFolders(org, repo) {
  if (!org || !repo) return [];
  const key = getStorageKey(org, repo);
  return getLocalStorageItem(key, []);
}

export function savePinnedFolders(pinnedFolders, org, repo) {
  if (!org || !repo) return;
  const key = getStorageKey(org, repo);
  setLocalStorageItem(key, pinnedFolders);
}

