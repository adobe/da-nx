export const FILTER_TYPES = {
  ALL: 'all',
  IMAGES: 'images',
  DOCUMENTS: 'documents',
  DOCUMENT_TOTAL: 'documentTotal',
};

let appState = {
  sitePath: null,
  org: null,
  repo: null,

  mediaData: [],
  usageIndex: new Map(),
  processedData: null,
  progressiveMediaData: [],
  progressiveTotalCount: null,
  progressiveCountCapped: false,

  searchQuery: '',
  selectedFilterType: FILTER_TYPES.IMAGES,
  selectedFolder: null,
  selectedDocument: null,

  selectedMediaKey: null,
  selectedMediaTab: 'usage',

  isIndexing: false,
  indexProgress: null,
  indexStartTime: null,
  indexLockedByOther: false,
  indexMissing: false,

  isValidating: false,
  isLoadingData: false,
  isProgressiveLoading: false,
  sitePathValid: false,
  validationError: null,
  validationSuggestion: null,

  notification: null,
  persistentError: null,

  pinnedFolders: [],
};

const listeners = new Set();
let notificationTimeout = null;

// Returns current app state snapshot.
export function getAppState() {
  return appState;
}

// Merges updates into state and notifies listeners for changed keys.
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

const NOTIFICATION_DURATION = { success: 3000, warning: 5000, danger: 10000 };

// Shows toast; auto-dismisses. Danger/warning stay longer; user can dismiss via close.
export function showNotification(heading, message, type = 'success') {
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
  }
  updateAppState({ notification: { heading, message, type } });
  const duration = NOTIFICATION_DURATION[type] ?? NOTIFICATION_DURATION.success;
  notificationTimeout = setTimeout(() => {
    updateAppState({ notification: null });
    notificationTimeout = null;
  }, duration);
}

// Dismiss notification immediately; clears auto-dismiss timer.
export function dismissNotification() {
  if (notificationTimeout) {
    clearTimeout(notificationTimeout);
    notificationTimeout = null;
  }
  updateAppState({ notification: null });
}

// Subscribes to state changes; returns unsubscribe fn.
export function onStateChange(keysOrCallback, callback) {
  const keys = Array.isArray(keysOrCallback) ? keysOrCallback : null;
  const fn = callback || keysOrCallback;

  const entry = { keys, callback: fn };
  listeners.add(entry);
  fn(appState);

  return () => listeners.delete(entry);
}
