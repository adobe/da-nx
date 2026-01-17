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
  
  isScanning: false,
  scanProgress: null,
  scanStartTime: null,
  
  isValidating: false,
  sitePathValid: false,
  validationError: null,
  validationSuggestion: null,
  
  notification: null,
  
  pinnedFolders: [],
};

const listeners = new Set();

export function getAppState() {
  return appState;
}

export function updateAppState(updates) {
  const hasChanges = Object.keys(updates).some((key) => appState[key] !== updates[key]);
  
  if (!hasChanges) return;
  
  appState = { ...appState, ...updates };
  listeners.forEach((callback) => callback(appState));
}

export function subscribeToAppState(callback) {
  listeners.add(callback);
  callback(appState);
  return () => listeners.delete(callback);
}

export function resetAppState() {
  updateAppState({
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
    isScanning: false,
    scanProgress: null,
    scanStartTime: null,
    notification: null,
  });
}
