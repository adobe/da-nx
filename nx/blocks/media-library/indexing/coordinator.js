import buildMediaIndex, {
  loadMediaIfUpdated,
  checkIndexLock,
  isFreshIndexLock,
  getIndexLockOwnerId,
  loadMediaSheet,
} from './load.js';
import { ensureAuthenticated, getCanonicalMediaTimestamp } from '../core/utils.js';
import { updateAppState, getAppState, showNotification } from '../core/state.js';
import { t } from '../core/messages.js';
import { clearProcessDataCache } from '../features/filters.js';
import { getDedupeKey } from '../core/urls.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { isFullRebuildRequested } from '../core/params.js';

const CONFIG = { POLLING_INTERVAL: 60000, LOCK_CHECK_INTERVAL: 5000 };

let pollingInterval = null;
let lockCheckInterval = null;
let pollingStarted = false;
let onMediaDataUpdated = null;

function stateHasMediaData() {
  return (getAppState().mediaData?.length || 0) > 0;
}

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
        const result = await loadMediaIfUpdated(state.sitePath, org, repo);
        const { hasChanged, mediaData, indexMissing } = result;

        if (hasChanged && onMediaDataUpdated) {
          updateAppState({
            indexMissing: !!indexMissing,
            isBackgroundRefreshInProgress: false,
            indexLockedByOther: false,
          });
          onMediaDataUpdated(mediaData || []);
        }
      } catch (error) {
        const persistentCodes = [
          ErrorCodes.INDEX_PARSE_ERROR,
          ErrorCodes.DA_READ_DENIED,
        ];
        if (persistentCodes.includes(error?.code)) {
          updateAppState({ persistentError: { message: error.message }, indexMissing: false });
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
    if ((!state.indexLockedByOther && !state.isBackgroundRefreshInProgress) || !sitePath) {
      stopLockCheckPolling();
      return;
    }
    try {
      const lock = await checkIndexLock(sitePath);
      const stateHasData = stateHasMediaData();
      if (!isFreshIndexLock(lock)) {
        stopLockCheckPolling();

        if (!stateHasData) {
          const {
            data,
            indexMissing,
            indexing,
          } = await loadMediaSheet(sitePath);

          if (!indexing && onMediaDataUpdated) {
            if (indexMissing) {
              updateAppState({
                indexLockedByOther: true,
                isBackgroundRefreshInProgress: false,
                indexMissing: false,
              });
              return;
            }
            updateAppState({
              indexLockedByOther: false,
              isBackgroundRefreshInProgress: false,
              indexMissing: !!indexMissing,
            });
            onMediaDataUpdated(data || []);
            return;
          }
        }

        const {
          hasChanged,
          mediaData,
          indexMissing,
        } = await loadMediaIfUpdated(sitePath, org, repo);
        if (hasChanged && onMediaDataUpdated) {
          updateAppState({
            indexLockedByOther: false,
            isBackgroundRefreshInProgress: false,
            indexMissing: !!indexMissing,
          });
          onMediaDataUpdated(mediaData || []);
          return;
        }

        updateAppState({
          indexLockedByOther: false,
          isBackgroundRefreshInProgress: false,
        });
        return;
      }

      const { hasChanged, mediaData, indexMissing } = await loadMediaIfUpdated(sitePath, org, repo);
      if (hasChanged && onMediaDataUpdated) {
        stopLockCheckPolling();
        updateAppState({
          indexLockedByOther: false,
          isBackgroundRefreshInProgress: false,
          indexMissing: !!indexMissing,
        });
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
    isBackgroundRefreshInProgress: false,
    indexLockedByOther: false,
    indexProgress: { stage: 'starting', message: '', duration: null },
    indexStartTime: Date.now(),
    progressiveMediaData: [],
    progressiveTotalCount: null,
    progressiveCountCapped: false,
  });

  pausePolling();

  // Declare progressive data structures outside try block so they're accessible in catch/finally
  const PROGRESSIVE_DISPLAY_CAP = 3000;
  /** Cap on allSeenKeys to avoid unbounded memory for large indexes (e.g. 200K+ items) */
  const PROGRESSIVE_COUNT_CAP = 50000;
  const progressiveMap = new Map();
  const allSeenKeys = new Set();
  let maxProgressiveCount = 0;
  let countCapped = false;

  try {
    const onProgress = (progressInfo) => {
      updateAppState({
        indexProgress: {
          stage: progressInfo.stage,
          message: progressInfo.message,
        },
      });
    };

    const onProgressiveData = (mediaData) => {
      if (!mediaData || !Array.isArray(mediaData) || mediaData.length === 0) return;

      const prevMax = maxProgressiveCount;

      for (const item of mediaData) {
        const key = item?.url ? getDedupeKey(item.url) : (item?.hash || '');
        const existing = progressiveMap.get(key);
        const itemTs = getCanonicalMediaTimestamp(item);
        const existingTs = getCanonicalMediaTimestamp(existing);

        if (!existing) {
          if (!countCapped && allSeenKeys.size < PROGRESSIVE_COUNT_CAP) {
            allSeenKeys.add(key);
          } else if (!countCapped && allSeenKeys.size >= PROGRESSIVE_COUNT_CAP) {
            countCapped = true;
          }
          if (progressiveMap.size < PROGRESSIVE_DISPLAY_CAP) {
            progressiveMap.set(key, item);
          }
        } else if (itemTs >= existingTs) {
          progressiveMap.set(key, item);
        }
      }

      maxProgressiveCount = countCapped
        ? PROGRESSIVE_COUNT_CAP
        : Math.max(maxProgressiveCount, allSeenKeys.size);

      const toRender = Array.from(progressiveMap.values());
      if (maxProgressiveCount === prevMax && toRender.length === 0) return;

      updateAppState({
        progressiveMediaData: toRender,
        progressiveTotalCount: maxProgressiveCount,
        progressiveCountCapped: countCapped,
      });
    };

    const forceFull = isFullRebuildRequested();
    const result = await buildMediaIndex(
      sitePath,
      org,
      repo,
      ref,
      onProgress,
      onProgressiveData,
      { forceFull },
    );

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
          duration: finalProgress.duration || '0s',
          hasChanges: true,
          mediaReferences: finalProgress.mediaReferences,
        },
        isIndexing: false,
        isBackgroundRefreshInProgress: false,
        progressiveMediaData: [],
        progressiveTotalCount: null,
        progressiveCountCapped: false,
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
          duration: finalProgress.duration || '0s',
          hasChanges: false,
          mediaReferences: 0,
        },
        isIndexing: false,
        isBackgroundRefreshInProgress: false,
        progressiveMediaData: [],
        progressiveTotalCount: null,
        progressiveCountCapped: false,
        persistentError: null,
      });
    }

    // Clear progressive data structures to prevent memory leak
    progressiveMap.clear();
    allSeenKeys.clear();
  } catch (error) {
    if (!error.message?.includes('Index build already in progress')) {
      const isMediaLibError = error instanceof MediaLibraryError;
      const persistentCodes = [
        ErrorCodes.DA_READ_DENIED,
        ErrorCodes.DA_WRITE_DENIED,
        ErrorCodes.DA_SAVE_FAILED,
        ErrorCodes.PARTIAL_SAVE,
        ErrorCodes.INDEX_PARSE_ERROR,
        ErrorCodes.LOCK_CREATE_FAILED,
        ErrorCodes.LOCK_REMOVE_FAILED,
      ];
      const isPersistent = isMediaLibError && persistentCodes.includes(error.code);

      // eslint-disable-next-line no-console
      console.error('[MediaIndexer] Build error caught:', error);

      if (!isMediaLibError) {
        logMediaLibraryError(ErrorCodes.BUILD_FAILED, { error: error?.message });
      }

      const updates = {
        isIndexing: false,
        indexLockedByOther: false,
        isBackgroundRefreshInProgress: false,
        indexMissing: false,
        progressiveTotalCount: null,
        progressiveCountCapped: false,
      };
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
      updateAppState({
        isIndexing: false,
        indexLockedByOther: true,
        isBackgroundRefreshInProgress: stateHasMediaData(),
      });
      startLockCheckPolling(sitePath, org, repo);
    }

    // Clear progressive data structures on error to prevent memory leak
    progressiveMap.clear();
    allSeenKeys.clear();
  } finally {
    resumePolling();
  }
}

export async function initService(sitePath, options = {}) {
  const { onMediaDataUpdated: callback } = options;
  onMediaDataUpdated = callback;

  if (!sitePath || pollingStarted) return;

  // Data already loaded by loadMediaData() - UI has existing index
  startPolling(); // Every 60s: check timestamp, reload if changed

  const [org, repo] = sitePath.split('/').slice(1, 3);

  try {
    // Check if someone else is building
    const lock = await checkIndexLock(sitePath);
    const ownerId = getIndexLockOwnerId();
    const ownsLock = lock.ownerId && lock.ownerId === ownerId;
    const freshLock = isFreshIndexLock(lock);

    if (freshLock && !ownsLock) {
      updateAppState({
        isBackgroundRefreshInProgress: stateHasMediaData(),
        indexLockedByOther: !stateHasMediaData(),
      });
      startLockCheckPolling(sitePath, org, repo);
      return;
    }

    // No lock - this browser owns the build
    // Check if ?full=true query param is set to force full rebuild
    const forceFullRebuild = isFullRebuildRequested();

    if (forceFullRebuild) {
      triggerBuild(sitePath, org, repo, 'main');
      return;
    }

    // Check if we can do incremental (index exists and valid) or need full build
    const { checkReindexEligibility } = await import('./build.js');
    const reindexCheck = await checkReindexEligibility(sitePath, org, repo);

    if (reindexCheck.shouldReindex) {
      // Index exists and is valid - do incremental
      // (incremental will fetch auditlog/medialog since lastFetchTime and decide if update needed)
      triggerBuild(sitePath, org, repo, 'main');
    } else {
      // Index missing or invalid - do full build
      triggerBuild(sitePath, org, repo, 'main');
    }
  } catch (error) {
    // If check fails, just start polling - don't block initialization
    // eslint-disable-next-line no-console
    console.error('[MediaIndexer] Error checking build status:', error);
  }
}

export function disposeService() {
  pausePolling();
  stopLockCheckPolling();
  pollingStarted = false;
  onMediaDataUpdated = null;
}
