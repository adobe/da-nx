export const FILTER_TYPES = {
  ALL: 'all',
  DOCUMENTS: 'documents',
  DOCUMENT_TOTAL: 'documentTotal',
};

let appState = {
  sitePath: null,
  org: null,
  repo: null,

  mediaData: [],
  rawMediaData: [],
  usageIndex: new Map(),
  folderPathsCache: new Set(),
  processedData: null,
  progressiveMediaData: [],

  searchQuery: '',
  selectedFilterType: FILTER_TYPES.ALL,
  selectedFolder: null,
  selectedDocument: null,
  resultSummary: '',

  isIndexing: false,
  indexProgress: null,
  indexStartTime: null,

  isValidating: false,
  sitePathValid: false,
  validationError: null,
  validationSuggestion: null,

  notification: null,

  pinnedFolders: [],
};

const listeners = new Set();
let notificationTimeout = null;

export function getAppState() {
  return appState;
}

/**
 * Updates app state and notifies listeners. Uses reference equality for change detection.
 * For objects/arrays, pass a new reference (e.g. [...array], { ...obj }) when content changes.
 */
export function updateAppState(updates) {
  const changedKeys = Object.keys(updates).filter((key) => appState[key] !== updates[key]);
  if (changedKeys.length === 0) return;

  appState = { ...appState, ...updates };
  const changedSet = new Set(changedKeys);

  listeners.forEach((entry) => {
    if (entry.keys === null) {
      entry.callback(appState);
      return;
    }
    const hasRelevantChange = entry.keys.some((k) => changedSet.has(k));
    if (hasRelevantChange) {
      entry.callback(appState);
    }
  });
}

/**
 * Shows a toast notification. Auto-dismisses after 3 seconds.
 * Use this instead of window.dispatchEvent('show-notification') for state-driven UI.
 */
export function showNotification(heading, message, type = 'success') {
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }
  updateAppState({ notification: { heading, message, type } });
  notificationTimeout = setTimeout(() => {
    updateAppState({ notification: null });
    notificationTimeout = null;
  }, 3000);
}

export function onStateChange(keysOrCallback, callback) {
  const keys = Array.isArray(keysOrCallback) ? keysOrCallback : null;
  const fn = callback || keysOrCallback;

  const entry = { keys, callback: fn };
  listeners.add(entry);
  fn(appState);

  return () => listeners.delete(entry);
}
