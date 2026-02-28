import { Storage } from './constants.js';

export function getLocalStorageItem(key, defaultValue = null) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (error) {
    return defaultValue;
  }
}

export function setLocalStorageItem(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    return false;
  }
}

export function saveRecentSite(sitePath) {
  const recentSites = getLocalStorageItem(Storage.DA_SITES, []);

  const pathWithoutSlash = sitePath.substring(1);
  const parts = pathWithoutSlash.split('/');
  const basePath = parts.length > 2 ? `${parts[0]}/${parts[1]}` : pathWithoutSlash;

  const filtered = recentSites.filter((site) => site !== basePath);

  filtered.unshift(basePath);

  const limited = filtered.slice(0, 10);

  setLocalStorageItem(Storage.DA_SITES, limited);
}
