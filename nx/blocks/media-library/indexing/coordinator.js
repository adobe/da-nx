import buildMediaIndex, { loadMediaIfUpdated } from './load.js';
import { ensureAuthenticated } from '../core/utils.js';
import { updateAppState, getAppState, showNotification } from '../core/state.js';
import { t } from '../core/messages.js';
import { clearProcessDataCache } from '../features/filters.js';
import { getDedupeKey } from '../core/urls.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';

const CONFIG = { POLLING_INTERVAL: 60000, LOCK_CHECK_INTERVAL: 5000 };

let pollingInterval = null;
let lockCheckInterval = null;
let pollingStarted = false;
let onMediaDataUpdated = null;

// Starts polling for media updates when authenticated.
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

        if (hasChanged && onMediaDataUpdated) {
          onMediaDataUpdated(mediaData || []);
        }
      } catch (error) {
        if (error?.code === ErrorCodes.INDEX_PARSE_ERROR) {
          updateAppState({ persistentError: { message: error.message } });
        } else {
          logMediaLibraryError(ErrorCodes.POLLING_FAILED, { error: error?.message });
          showNotification(t('NOTIFY_WARNING'), t('NOTIFY_POLLING_UNAVAILABLE'), 'danger');
        }
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
      if (hasChanged && onMediaDataUpdated) {
        stopLockCheckPolling();
        updateAppState({ indexLockedByOther: false });
        onMediaDataUpdated(mediaData || []);
      }
    } catch { /* swallow */ }
  }, CONFIG.LOCK_CHECK_INTERVAL);
}

export function resumePolling() {
  const state = getAppState();
  if (!pollingInterval && pollingStarted && !state.isIndexing) {
    startPolling();
  }
}

// Kicks off incremental or full index build; updates progress in state.
export async function triggerBuild(sitePath, org, repo, ref = 'main') {
  if (!sitePath || !(org && repo)) {
    return;
  }

  try {
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      updateAppState({ isIndexing: false });
      logMediaLibraryError(ErrorCodes.AUTH_REQUIRED, { context: 'build' });
      showNotification(t('NOTIFY_ERROR'), t('NOTIFY_SIGN_IN'), 'danger');
      return;
    }
  } catch (error) {
    updateAppState({ isIndexing: false });
    logMediaLibraryError(ErrorCodes.AUTH_REQUIRED, { context: 'build', error: error?.message });
    showNotification(t('NOTIFY_ERROR'), t('NOTIFY_VERIFY_AUTH'), 'danger');
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
          if (progressiveMap.size < PROGRESSIVE_DISPLAY_CAP) {
            progressiveMap.set(key, item);
          }
        } else if (itemTs >= existingTs) {
          progressiveMap.set(key, item);
        }
      }

      const toRender = Array.from(progressiveMap.values());
      updateAppState({ progressiveMediaData: toRender });
    };

    const result = await buildMediaIndex(sitePath, org, repo, ref, onProgress, onProgressiveData);

    clearProcessDataCache();

    const finalProgress = {
      hasChanges: result.hasChanges,
      mediaReferences: result.mediaData?.length || 0,
      duration: result.duration,
    };

    if (result.lockRemoveFailed) {
      showNotification(t('NOTIFY_WARNING'), t('LOCK_REMOVE_FAILED'), 'danger');
    }

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
        persistentError: null,
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
        persistentError: null,
      });
    }
  } catch (error) {
    if (!error.message?.includes('Index build already in progress')) {
      const isMediaLibError = error instanceof MediaLibraryError;
      const persistentCodes = [
        ErrorCodes.DA_WRITE_DENIED,
        ErrorCodes.DA_SAVE_FAILED,
        ErrorCodes.PARTIAL_SAVE,
        ErrorCodes.INDEX_PARSE_ERROR,
        ErrorCodes.LOCK_CREATE_FAILED,
        ErrorCodes.LOCK_REMOVE_FAILED,
      ];
      const isPersistent = isMediaLibError && persistentCodes.includes(error.code);

      if (!isMediaLibError) {
        logMediaLibraryError(ErrorCodes.BUILD_FAILED, { error: error?.message });
      }

      const updates = { isIndexing: false, indexLockedByOther: false };
      if (isPersistent) {
        updates.persistentError = { message: error.message };
      } else {
        updates.persistentError = null;
      }
      updateAppState(updates);

      if (!isPersistent) {
        const msg = error.message || t('NOTIFY_DISCOVERY_FAILED');
        showNotification(t('NOTIFY_ERROR'), msg, 'danger');
      }
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
