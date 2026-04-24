/**
 * Indexing coordinator - Event-based architecture
 *
 * This module orchestrates indexing operations and emits neutral events.
 * It does NOT manage UI state, show notifications, or localize messages.
 * The display layer consumes events and handles all UI concerns.
 */

import buildMediaIndex, {
  loadMediaIfUpdated,
  checkIndexLock,
  isFreshIndexLock,
  getIndexLockOwnerId,
  loadMediaSheet,
} from './load.js';
import { ensureAuthenticated } from '../core/utils.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { isFullRebuildRequested } from '../core/params.js';
import {
  IndexingEventType,
  IndexingErrorCode,
  createBuildStartedEvent,
  createBuildProgressEvent,
  createBuildDataEvent,
  createBuildCompleteEvent,
  createBuildErrorEvent,
  createLockDetectedEvent,
  createIndexMissingEvent,
  createIndexLoadedEvent,
} from './events.js';

const CONFIG = { POLLING_INTERVAL: 60000, LOCK_CHECK_INTERVAL: 5000 };

let pollingInterval = null;
let lockCheckInterval = null;
let pollingStarted = false;
let eventEmitter = null;

/**
 * Emit an indexing event to the display layer
 */
function emit(event) {
  if (eventEmitter) {
    eventEmitter(event);
  }
}

/**
 * Start polling for index updates (runs every 60s)
 */
export async function startPolling(sitePath, org, repo) {
  if (pollingInterval || !sitePath) return;

  pollingInterval = setInterval(async () => {
    try {
      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) return;

      const result = await loadMediaIfUpdated(sitePath, org, repo);
      const { hasChanged, mediaData, indexMissing } = result;

      if (indexMissing) {
        emit(createIndexMissingEvent(sitePath));
      }

      if (hasChanged) {
        emit(createIndexLoadedEvent(mediaData || []));
      }
    } catch (error) {
      const persistentCodes = [
        ErrorCodes.INDEX_PARSE_ERROR,
        ErrorCodes.DA_READ_DENIED,
      ];
      const isPersistent = persistentCodes.includes(error?.code);

      logMediaLibraryError(ErrorCodes.POLLING_FAILED, { error: error?.message });
      emit(createBuildErrorEvent(
        IndexingErrorCode.BUILD_FAILED,
        error?.message || 'Polling failed',
        { context: 'polling' },
        isPersistent,
      ));
    }
  }, CONFIG.POLLING_INTERVAL);

  pollingStarted = true;
}

/**
 * Pause polling (during builds)
 */
export function pausePolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Resume polling (after builds)
 */
export function resumePolling(sitePath, org, repo) {
  if (!pollingInterval && pollingStarted && sitePath) {
    startPolling(sitePath, org, repo);
  }
}

/**
 * Stop lock check polling
 */
function stopLockCheckPolling() {
  if (lockCheckInterval) {
    clearInterval(lockCheckInterval);
    lockCheckInterval = null;
  }
}

/**
 * Start polling to check if another browser's build lock is released
 */
function startLockCheckPolling(sitePath, org, repo, hasMediaData) {
  stopLockCheckPolling();

  lockCheckInterval = setInterval(async () => {
    try {
      const lock = await checkIndexLock(sitePath);

      if (!isFreshIndexLock(lock)) {
        stopLockCheckPolling();

        // Lock released - try to load data
        if (!hasMediaData) {
          const { data, indexMissing, indexing } = await loadMediaSheet(sitePath);

          if (!indexing) {
            if (indexMissing) {
              emit(createIndexMissingEvent(sitePath));
              return;
            }
            emit(createIndexLoadedEvent(data || []));
            return;
          }
        }

        // Check if index was updated while lock was active
        const {
          hasChanged,
          mediaData,
          indexMissing,
        } = await loadMediaIfUpdated(sitePath, org, repo);
        if (hasChanged) {
          emit(createIndexLoadedEvent(mediaData || []));
        } else if (indexMissing) {
          emit(createIndexMissingEvent(sitePath));
        }
      }
    } catch {
      // Swallow errors during lock polling
    }
  }, CONFIG.LOCK_CHECK_INTERVAL);
}

/**
 * Trigger a build (full or incremental)
 */
export async function triggerBuild(sitePath, org, repo, ref = 'main') {
  if (!sitePath || !(org && repo)) {
    return;
  }

  // Check authentication
  try {
    const isAuthenticated = await ensureAuthenticated();
    if (!isAuthenticated) {
      logMediaLibraryError(ErrorCodes.AUTH_REQUIRED, { context: 'build' });
      emit(createBuildErrorEvent(
        IndexingErrorCode.AUTH_REQUIRED,
        'Authentication required to build index',
        { context: 'build' },
        false,
      ));
      return;
    }
  } catch (error) {
    logMediaLibraryError(ErrorCodes.AUTH_REQUIRED, { context: 'build', error: error?.message });
    emit(createBuildErrorEvent(
      IndexingErrorCode.AUTH_REQUIRED,
      error?.message || 'Authentication failed',
      { context: 'build' },
      false,
    ));
    return;
  }

  pausePolling();

  const forceFull = isFullRebuildRequested();
  const buildMode = forceFull ? 'full' : 'incremental';

  emit(createBuildStartedEvent(buildMode, forceFull));

  try {
    // Progress callback - emit neutral progress events
    const onProgress = (progressInfo) => {
      emit(createBuildProgressEvent(
        progressInfo.stage,
        progressInfo.message || '',
      ));
    };

    // Progressive data callback - emit raw batches for display to handle
    const onProgressiveData = (mediaData) => {
      if (mediaData && Array.isArray(mediaData) && mediaData.length > 0) {
        emit(createBuildDataEvent(mediaData));
      }
    };

    const result = await buildMediaIndex(
      sitePath,
      org,
      repo,
      ref,
      onProgress,
      onProgressiveData,
      { forceFull },
    );

    const duration = parseFloat(result.duration) * 1000; // Convert "7.4s" to ms

    emit(createBuildCompleteEvent(
      result.mediaData || [],
      duration,
      result.hasChanges,
      result.lockRemoveFailed,
    ));
  } catch (error) {
    if (error.message?.includes('Index build already in progress')) {
      // Another browser is building - start lock polling
      emit({
        type: IndexingEventType.LOCK_DETECTED,
        ownerId: 'unknown',
        timestamp: Date.now(),
        fresh: true,
      });
      startLockCheckPolling(sitePath, org, repo, false);
    } else {
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

      const errorCode = isMediaLibError ? error.code : IndexingErrorCode.BUILD_FAILED;
      emit(createBuildErrorEvent(
        errorCode,
        error.message || 'Build failed',
        { ...error.context },
        isPersistent,
      ));
    }
  } finally {
    resumePolling(sitePath, org, repo);
  }
}

/**
 * Initialize the indexing service
 *
 * @param {string} sitePath - Site path (e.g., '/org/repo')
 * @param {Object} options - Configuration options
 * @param {Function} options.onEvent - Event handler callback
 * @param {string} options.mode - 'app' or 'plugin'
 * @param {boolean} options.hasMediaData - Whether display already has data
 * @param {boolean} options.autoTriggerOnMissing - App policy: auto-trigger build when missing
 */
export async function initService(sitePath, options = {}) {
  const {
    onEvent,
    mode = 'app',
    hasMediaData = false,
    autoTriggerOnMissing = false,
  } = options;
  eventEmitter = onEvent;

  if (!sitePath || pollingStarted) return;

  const [org, repo] = sitePath.split('/').slice(1, 3);

  // Plugin mode: Only poll, don't auto-trigger builds
  if (mode === 'plugin') {
    startPolling(sitePath, org, repo);
    return;
  }

  // App mode: Poll + check lock state + check for missing index
  startPolling(sitePath, org, repo);

  try {
    const lock = await checkIndexLock(sitePath);
    const ownerId = getIndexLockOwnerId();
    const ownsLock = lock.ownerId && lock.ownerId === ownerId;
    const freshLock = isFreshIndexLock(lock);

    if (freshLock && !ownsLock) {
      // Another browser is building
      emit(createLockDetectedEvent(lock.ownerId, lock.timestamp, true));
      startLockCheckPolling(sitePath, org, repo, hasMediaData);
      return;
    }

    // Check if index is already known to be missing (from loadMediaData)
    // This handles the case where loadMediaData ran before initService
    if (!hasMediaData && !freshLock) {
      const { indexMissing } = await loadMediaSheet(sitePath);
      if (indexMissing) {
        emit(createIndexMissingEvent(sitePath));

        // App policy: Auto-trigger build if configured
        if (autoTriggerOnMissing) {
          triggerBuild(sitePath, org, repo);
        }
      }
    }
  } catch (error) {
    // If check fails, continue with polling - don't block initialization
    // eslint-disable-next-line no-console
    console.error('[MediaIndexer] Error checking build status:', error);
  }
}

/**
 * Dispose the service (cleanup)
 */
export function disposeService() {
  pausePolling();
  stopLockCheckPolling();
  pollingStarted = false;
  eventEmitter = null;
}
