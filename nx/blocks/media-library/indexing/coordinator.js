import buildMediaIndex, { loadMediaIfUpdated } from './load.js';
import { ensureAuthenticated } from '../core/utils.js';
import { updateAppState, getAppState, showNotification } from '../core/state.js';
import { clearProcessDataCache } from '../features/filters.js';
import { getDedupeKey } from '../core/urls.js';

const CONFIG = { POLLING_INTERVAL: 60000, LOCK_CHECK_INTERVAL: 5000 };

let pollingInterval = null;
let lockCheckInterval = null;
let pollingStarted = false;
let onMediaDataUpdated = null;

export async function startPolling() {
  if (pollingInterval) return;

  pollingInterval = setInterval(async () => {
    const state = getAppState();
    if (state.sitePath && !state.isIndexing) {
      try {
        const isAuthenticated = await ensureAuthenticated();
        if (!isAuthenticated) return;

        const [org, repo] = state.sitePath.split('/').slice(1, 3);
        const { hasChanged, mediaData } = await loadMediaIfUpdated(state.sitePath, org, repo);

        // Update on any change (including empty results)
        if (hasChanged && onMediaDataUpdated) {
          onMediaDataUpdated(mediaData || []);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('[MediaIndexer] Polling failed:', error);
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

function stopLockCheckPolling() {
  if (lockCheckInterval) {
    clearInterval(lockCheckInterval);
    lockCheckInterval = null;
  }
}

function startLockCheckPolling(sitePath, org, repo) {
  stopLockCheckPolling();
  lockCheckInterval = setInterval(async () => {
    const state = getAppState();
    if (!state.indexLockedByOther || !sitePath) {
      stopLockCheckPolling();
      return;
    }
    try {
      const { hasChanged, mediaData } = await loadMediaIfUpdated(sitePath, org, repo);
      // Clear lock on any valid completion (including empty results)
      if (hasChanged && onMediaDataUpdated) {
        stopLockCheckPolling();
        updateAppState({ indexLockedByOther: false });
        // Update with data (empty array is valid)
        onMediaDataUpdated(mediaData || []);
      }
    } catch {
      // Ignore; will retry on next interval
    }
  }, CONFIG.LOCK_CHECK_INTERVAL);
}

export function resumePolling() {
  const state = getAppState();
  if (!pollingInterval && pollingStarted && !state.isIndexing) {
    startPolling();
  }
}

export async function triggerBuild(sitePath, org, repo, ref = 'main') {
  if (!sitePath || !(org && repo)) {
    return;
  }

  try {
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      updateAppState({ isIndexing: false });
      showNotification('Error', 'Authentication required to build media index.', 'danger');
      return;
    }
  } catch (error) {
    updateAppState({ isIndexing: false });
    showNotification('Error', 'Failed to verify authentication.', 'danger');
    return;
  }

  updateAppState({
    isIndexing: true,
    indexProgress: { stage: 'starting', message: '', percent: 0, duration: null },
    indexStartTime: Date.now(),
    progressiveMediaData: [],
  });

  pausePolling();

  try {
    const onProgress = (progressInfo) => {
      updateAppState({
        indexProgress: {
          stage: progressInfo.stage,
          message: progressInfo.message,
          percent: progressInfo.percent,
        },
      });
    };

    const PROGRESSIVE_DISPLAY_CAP = 3000;
    const progressiveMap = new Map();

    const onProgressiveData = (mediaData) => {
      if (!mediaData || !Array.isArray(mediaData) || mediaData.length === 0) return;

      for (const item of mediaData) {
        const key = item?.url ? getDedupeKey(item.url) : (item?.hash || '');
        const existing = progressiveMap.get(key);
        const itemTs = item?.timestamp ?? 0;
        const existingTs = existing?.timestamp ?? 0;

        if (!existing) {
          if (progressiveMap.size >= PROGRESSIVE_DISPLAY_CAP) continue;
          progressiveMap.set(key, item);
        } else if (itemTs >= existingTs) {
          progressiveMap.set(key, item);
        }
      }

      const toRender = Array.from(progressiveMap.values());
      updateAppState({ progressiveMediaData: toRender });
    };

    const result = await buildMediaIndex(sitePath, org, repo, ref, onProgress, onProgressiveData);

    // Clear cache after successful build to prevent stale derived data
    clearProcessDataCache();

    const finalProgress = {
      hasChanges: result.hasChanges,
      mediaReferences: result.mediaData?.length || 0,
      duration: result.duration,
    };

    if (finalProgress.hasChanges && result.mediaData) {
      updateAppState({
        indexProgress: {
          stage: 'complete',
          message: `${finalProgress.mediaReferences} items`,
          percent: 100,
          duration: finalProgress.duration || '0s',
          hasChanges: true,
          mediaReferences: finalProgress.mediaReferences,
        },
        isIndexing: false,
        progressiveMediaData: [],
      });
      if (onMediaDataUpdated) {
        await onMediaDataUpdated(result.mediaData);
      }
    } else {
      updateAppState({
        indexProgress: {
          stage: 'complete',
          message: 'No items found',
          percent: 100,
          duration: finalProgress.duration || '0s',
          hasChanges: false,
          mediaReferences: 0,
        },
        isIndexing: false,
        progressiveMediaData: [],
      });
    }
  } catch (error) {
    if (!error.message?.includes('Index build already in progress')) {
      // eslint-disable-next-line no-console
      console.error('[MediaIndexer] Index build failed:', error);
      updateAppState({ isIndexing: false, indexLockedByOther: false });
      showNotification('Error', error.message || 'Index build failed.', 'danger');
    } else {
      updateAppState({ isIndexing: false, indexLockedByOther: true });
      startLockCheckPolling(sitePath, org, repo);
    }
  } finally {
    resumePolling();
  }
}

export function initService(sitePath, options = {}) {
  const { onMediaDataUpdated: callback } = options;
  onMediaDataUpdated = callback;

  if (sitePath && !pollingStarted) {
    startPolling();
    const [org, repo] = sitePath.split('/').slice(1, 3);
    const ref = 'main';
    triggerBuild(sitePath, org, repo, ref);
  }
}

export function disposeService() {
  pausePolling();
  stopLockCheckPolling();
  pollingStarted = false;
  onMediaDataUpdated = null;
}
