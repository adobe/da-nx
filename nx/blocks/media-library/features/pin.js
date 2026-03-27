import { getLocalStorageItem, setLocalStorageItem } from '../core/storage.js';
import { Storage } from '../core/constants.js';

function getStorageKey(org, repo) {
  return `${Storage.PINNED_FOLDERS_PREFIX}${org}-${repo}`;
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
