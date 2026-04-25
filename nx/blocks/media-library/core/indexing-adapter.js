/**
 * Indexing Bridge - Translates indexing events to UI state
 *
 * This module sits between the indexing layer and display layer.
 * It consumes neutral indexing events and manages UI state, notifications, and progressive display.
 */

import { updateAppState, getAppState, showNotification } from './state.js';
import { t } from './messages.js';
import { clearProcessDataCache } from '../ui/filters.js';
import { getDedupeKey } from './urls.js';
import { getCanonicalMediaTimestamp } from './utils.js';
import { IndexingEventType, IndexingErrorCode } from '../indexing/events.js';

// Progressive display configuration
const PROGRESSIVE_DISPLAY_CAP = 3000;
const PROGRESSIVE_COUNT_CAP = 50000;

// Progressive display state (managed by bridge, not indexing)
const progressiveMap = new Map();
const allSeenKeys = new Set();
let maxProgressiveCount = 0;
let countCapped = false;

/**
 * Reset progressive display state
 */
function resetProgressiveState() {
  progressiveMap.clear();
  allSeenKeys.clear();
  maxProgressiveCount = 0;
  countCapped = false;
}

/**
 * Handle progressive data from indexing
 * Applies deduplication and capping for UI display
 */
function handleProgressiveData(mediaData) {
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
}

/**
 * Map indexing error codes to user-facing messages
 */
function getErrorMessage(errorCode, technicalMessage) {
  switch (errorCode) {
    case IndexingErrorCode.AUTH_REQUIRED:
    case IndexingErrorCode.AUTH_FAILED:
      return t('NOTIFY_SIGN_IN');
    case IndexingErrorCode.DA_READ_DENIED:
      return t('DA_READ_DENIED');
    case IndexingErrorCode.DA_WRITE_DENIED:
    case IndexingErrorCode.DA_SAVE_FAILED:
      return t('DA_SAVE_FAILED');
    case IndexingErrorCode.INDEX_PARSE_ERROR:
      return t('INDEX_PARSE_ERROR');
    case IndexingErrorCode.LOCK_CREATE_FAILED:
      return t('LOCK_CREATE_FAILED_GENERIC');
    case IndexingErrorCode.LOCK_REMOVE_FAILED:
      return t('LOCK_REMOVE_FAILED');
    case IndexingErrorCode.NETWORK_TIMEOUT:
    case IndexingErrorCode.BUILD_FAILED:
    default:
      return technicalMessage || t('NOTIFY_DISCOVERY_FAILED');
  }
}

/**
 * Check if current state has media data
 */
function stateHasMediaData() {
  return (getAppState().mediaData?.length || 0) > 0;
}

/**
 * Main event handler - translates indexing events to UI state
 *
 * @param {IndexingEvent} event - Event from indexing layer
 * @param {Function} onMediaDataUpdated - Callback when final data is ready
 */
export function handleIndexingEvent(event, onMediaDataUpdated) {
  switch (event.type) {
    case IndexingEventType.BUILD_STARTED:
      resetProgressiveState();
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
      break;

    case IndexingEventType.BUILD_PROGRESS:
      updateAppState({
        indexProgress: {
          stage: event.stage,
          message: event.detail,
        },
      });
      break;

    case IndexingEventType.BUILD_DATA:
      handleProgressiveData(event.items);
      break;

    case IndexingEventType.BUILD_COMPLETE: {
      clearProcessDataCache(); // Invalidate filter cache

      if (event.lockRemoveFailed) {
        showNotification(t('NOTIFY_WARNING'), t('LOCK_REMOVE_FAILED'), 'danger');
      }

      if (event.hasChanges && event.data && event.data.length > 0) {
        updateAppState({
          indexProgress: {
            stage: 'complete',
            message: `${event.itemCount} items`,
            duration: `${(event.duration / 1000).toFixed(1)}s`,
            hasChanges: true,
            mediaReferences: event.itemCount,
          },
          isIndexing: false,
          isBackgroundRefreshInProgress: false,
          progressiveMediaData: [],
          progressiveTotalCount: null,
          progressiveCountCapped: false,
          persistentError: null,
          indexMissing: false,
        });

        if (onMediaDataUpdated) {
          onMediaDataUpdated(event.data);
        }
      } else {
        updateAppState({
          indexProgress: {
            stage: 'complete',
            message: 'No items found',
            duration: `${(event.duration / 1000).toFixed(1)}s`,
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

      resetProgressiveState();
      break;
    }

    case IndexingEventType.BUILD_ERROR: {
      const updates = {
        isIndexing: false,
        indexLockedByOther: false,
        isBackgroundRefreshInProgress: false,
        indexMissing: false,
        progressiveTotalCount: null,
        progressiveCountCapped: false,
      };

      if (event.isPersistent) {
        updates.persistentError = { message: event.message };
      } else {
        updates.persistentError = null;
      }

      updateAppState(updates);

      // Show notification for non-persistent errors
      if (!event.isPersistent && event.code !== IndexingErrorCode.AUTH_REQUIRED) {
        const userMessage = getErrorMessage(event.code, event.message);
        showNotification(t('NOTIFY_ERROR'), userMessage, 'danger');
      } else if (event.code === IndexingErrorCode.AUTH_REQUIRED) {
        showNotification(t('NOTIFY_ERROR'), t('NOTIFY_SIGN_IN'), 'danger');
      }

      // Special handling for persistent errors
      if (event.isPersistent) {
        updateAppState({ persistentError: { message: event.message } });
      }

      resetProgressiveState();
      break;
    }

    case IndexingEventType.LOCK_DETECTED:
      updateAppState({
        isIndexing: false,
        indexLockedByOther: !stateHasMediaData(),
        isBackgroundRefreshInProgress: stateHasMediaData(),
      });
      break;

    case IndexingEventType.INDEX_MISSING:
      updateAppState({
        indexMissing: true,
        indexLockedByOther: false,
        isBackgroundRefreshInProgress: false,
      });
      break;

    case IndexingEventType.INDEX_LOADED:
      updateAppState({
        indexMissing: false,
        indexLockedByOther: false,
        isBackgroundRefreshInProgress: false,
        persistentError: null,
      });

      if (onMediaDataUpdated && event.hasData) {
        onMediaDataUpdated(event.data);
      }
      break;

    default:
      // Unknown event type - ignore
      break;
  }
}
