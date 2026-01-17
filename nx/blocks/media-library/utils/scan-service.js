import runScan, { loadMediaSheetIfModified } from './processing.js';
import { ensureAuthenticated } from './utils.js';
import { updateAppState, getAppState } from './state.js';

const CONFIG = {
  POLLING_INTERVAL: 60000,
  BATCH_SIZE: 10,
  BATCH_DELAY: 50,
};

let pollingInterval = null;
let pollingStarted = false;
let batchQueue = [];
let batchTimeout = null;
let currentProgress = { pages: 0, mediaFiles: 0, mediaReferences: 0 };

function dispatchScanEvent(eventName, detail = {}) {
  const event = new CustomEvent(eventName, { detail });
  window.dispatchEvent(event);
}

function updateScanProgress(type, count) {
  if (type === 'page') {
    currentProgress.pages = count;
  } else if (type === 'mediaFile') {
    currentProgress.mediaFiles = count;
  } else if (type === 'mediaReference') {
    currentProgress.mediaReferences = count;
  }
  
  dispatchScanEvent('scanProgress', {
    progress: {
      pages: currentProgress.pages,
      mediaFiles: currentProgress.mediaFiles,
      mediaReferences: currentProgress.mediaReferences,
    },
  });
}

function updateProgressiveData(mediaItems) {
  if (!mediaItems || mediaItems.length === 0) return;
  
  batchQueue.push(...mediaItems);

  if (batchTimeout) {
    clearTimeout(batchTimeout);
  }

  batchTimeout = setTimeout(() => {
    if (batchQueue.length > 0) {
      dispatchScanEvent('progressiveDataUpdate', { mediaItems: [...batchQueue] });
      batchQueue = [];
    }
    batchTimeout = null;
  }, CONFIG.BATCH_DELAY);
}

export async function startPolling() {
  if (pollingInterval) return;

  pollingInterval = setInterval(async () => {
    const state = getAppState();
    if (state.sitePath && !state.isScanning) {
      try {
        const isAuthenticated = await ensureAuthenticated();
        if (!isAuthenticated) return;

        const { hasChanged, mediaData } = await loadMediaSheetIfModified(state.sitePath);

        if (hasChanged && mediaData) {
          dispatchScanEvent('mediaDataUpdated', { mediaData, hasChanges: hasChanged });
        }
      } catch (error) {
        // Silent fail for polling
      }
    }
  }, CONFIG.POLLING_INTERVAL);

  pollingStarted = true;
}

export function pausePolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

export function resumePolling() {
  const state = getAppState();
  if (!pollingInterval && pollingStarted && !state.isScanning) {
    startPolling();
  }
}

export async function startScan(sitePath, org, repo) {
  if (!sitePath || !(org && repo)) {
    return;
  }

  try {
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      dispatchScanEvent('scanError', { error: 'Authentication required to scan media library.' });
      return;
    }
  } catch (error) {
    dispatchScanEvent('scanError', { error: 'Failed to verify authentication.' });
    return;
  }

  updateAppState({ isScanning: true });
  currentProgress = { pages: 0, mediaFiles: 0, mediaReferences: 0 };

  pausePolling();
  dispatchScanEvent('scanStart');

  try {
    const result = await runScan(sitePath, updateScanProgress, updateProgressiveData);

    const finalProgress = {
      hasChanges: result.hasChanges,
      mediaFiles: currentProgress.mediaFiles,
      mediaReferences: result.mediaData?.length || 0,
      pages: currentProgress.pages,
      duration: result.duration,
    };

    if (finalProgress.hasChanges && result.mediaData) {
      dispatchScanEvent('scanComplete', {
        mediaData: result.mediaData,
        hasChanges: finalProgress.hasChanges,
        duration: finalProgress.duration,
        mediaFiles: finalProgress.mediaFiles,
        mediaReferences: finalProgress.mediaReferences,
        pages: finalProgress.pages,
      });

      dispatchScanEvent('mediaDataUpdated', {
        mediaData: result.mediaData,
        hasChanges: finalProgress.hasChanges,
        duration: finalProgress.duration,
        mediaFiles: finalProgress.mediaFiles,
        mediaReferences: finalProgress.mediaReferences,
        pages: finalProgress.pages,
      });
    } else {
      dispatchScanEvent('scanComplete', {
        mediaData: null,
        hasChanges: false,
        duration: result.duration,
        mediaFiles: finalProgress.mediaFiles,
        mediaReferences: 0,
        pages: finalProgress.pages,
      });
    }
  } catch (error) {
    if (error.message && error.message.includes('Scan already in progress')) {
      // Ignore
    } else {
      // eslint-disable-next-line no-console
      console.error('Scan failed:', error);
      dispatchScanEvent('scanError', { error: error.message });
    }
  } finally {
    updateAppState({ isScanning: false, scanProgress: null });
    resumePolling();
  }
}

export function stopScan() {
  updateAppState({ isScanning: false, scanProgress: null });
  pausePolling();
}

export function initializeScanService(sitePath) {
  if (sitePath && !pollingStarted) {
    startPolling();
    const [org, repo] = sitePath.split('/').slice(1, 3);
    startScan(sitePath, org, repo);
  }
}

export function cleanupScanService() {
  pausePolling();
  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }
  batchQueue = [];
  pollingStarted = false;
}
