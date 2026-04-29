/**
 * Indexing coordinator - Event-based architecture
 *
 * This module orchestrates indexing operations and emits neutral events.
 * It does NOT manage UI state, show notifications, or localize messages.
 * The display layer consumes events and handles all UI concerns.
 */

import buildMediaIndex from './build.js';
import {
  loadMediaIfUpdated,
  loadMediaSheet,
} from '../ui/data.js';
import {
  checkIndexLock,
  isFreshIndexLock,
  getIndexLockOwnerId,
} from './locks.js';
import { ensureAuthenticated, getMediaLibraryHostMode } from '../core/utils.js';
import { MediaLibraryError, ErrorCodes, logMediaLibraryError } from '../core/errors.js';
import { isFullRebuildRequested, isPerfEnabled } from '../core/params.js';
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

const CONFIG = {
  INWARD_POLLING_INTERVAL: 60000,
  OUTWARD_POLLING_INTERVAL: 120000,
  LOCK_CHECK_INTERVAL: 5000,
};

let inwardPollingInterval = null;
let outwardPollingInterval = null;
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
 * Start checking for published index changes (runs every 60s)
 */
export async function startCheckingIndexChanges(sitePath, org, repo) {
  if (inwardPollingInterval || !sitePath) return;

  if (isPerfEnabled()) {
    // eslint-disable-next-line no-console
    console.log(`[perf] Starting checkIndex polling (60s interval) for ${sitePath}`);
  }

  inwardPollingInterval = setInterval(async () => {
    try {
      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) return;

      const key = `${sitePath.replace(/\//g, '-')}-media-lastupdated`;
      const hadPreviousTimestamp = !!localStorage.getItem(key);

      const result = await loadMediaIfUpdated(sitePath, org, repo);
      const { hasChanged, mediaData, indexMissing } = result;

      if (isPerfEnabled() && (hasChanged || indexMissing)) {
        let message;
        if (indexMissing) {
          message = 'detected missing index';
        } else if (!hadPreviousTimestamp) {
          message = `loaded ${mediaData?.length || 0} items`;
        } else {
          message = `detected changes (${mediaData?.length || 0} items)`;
        }
        // eslint-disable-next-line no-console
        console.log(`[perf] checkIndex poll ${message}`);
      }

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
  }, CONFIG.INWARD_POLLING_INTERVAL);

  pollingStarted = true;
}

/**
 * Pause checking for index changes (during builds)
 */
export function pauseCheckingIndexChanges() {
  if (inwardPollingInterval) {
    if (isPerfEnabled()) {
      // eslint-disable-next-line no-console
      console.log('[perf] Pausing checkIndex polling (build starting)');
    }
    clearInterval(inwardPollingInterval);
    inwardPollingInterval = null;
  }
}

/**
 * Resume checking for index changes (after builds)
 */
export function resumeCheckingIndexChanges(sitePath, org, repo) {
  if (!inwardPollingInterval && pollingStarted && sitePath) {
    if (isPerfEnabled()) {
      // eslint-disable-next-line no-console
      console.log('[perf] Resuming checkIndex polling (build complete)');
    }
    startCheckingIndexChanges(sitePath, org, repo);
  }
}

/**
 * Start checking for content changes and trigger incremental builds (runs every 120s)
 */
export async function startCheckingChanges(sitePath, org, repo, ref = 'main') {
  if (outwardPollingInterval || !sitePath) return;

  if (isPerfEnabled()) {
    // eslint-disable-next-line no-console
    console.log(`[perf] Starting checkChanges polling (120s interval) for ${sitePath}`);
  }

  outwardPollingInterval = setInterval(async () => {
    if (isPerfEnabled()) {
      // eslint-disable-next-line no-console
      console.log('[perf] checkChanges poll: triggering incremental build check');
    }
    try {
      const isAuthenticated = await ensureAuthenticated();
      if (!isAuthenticated) return;

      const [siteOrg, siteRepo] = sitePath.split('/').slice(1, 3);
      // eslint-disable-next-line no-use-before-define
      await triggerBuild(sitePath, siteOrg, siteRepo, ref);
    } catch (error) {
      logMediaLibraryError(ErrorCodes.POLLING_FAILED, { error: error?.message, context: 'outward' });
    }
  }, CONFIG.OUTWARD_POLLING_INTERVAL);

  pollingStarted = true;
}

/**
 * Pause checking for content changes (during manual builds)
 */
export function pauseCheckingChanges() {
  if (outwardPollingInterval) {
    if (isPerfEnabled()) {
      // eslint-disable-next-line no-console
      console.log('[perf] Pausing checkChanges polling (build starting)');
    }
    clearInterval(outwardPollingInterval);
    outwardPollingInterval = null;
  }
}

/**
 * Resume checking for content changes (after manual builds)
 */
export function resumeCheckingChanges(sitePath, org, repo, ref = 'main') {
  if (!outwardPollingInterval && pollingStarted && sitePath) {
    if (isPerfEnabled()) {
      // eslint-disable-next-line no-console
      console.log('[perf] Resuming checkChanges polling (build complete)');
    }
    startCheckingChanges(sitePath, org, repo, ref);
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

        if (!hasMediaData) {
          const { data, indexMissing } = await loadMediaSheet(sitePath);

          if (indexMissing) {
            emit(createIndexMissingEvent(sitePath));
            return;
          }
          emit(createIndexLoadedEvent(data || []));
          return;
        }

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
      // Intentionally swallow errors during lock polling
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

  pauseCheckingIndexChanges();
  pauseCheckingChanges();

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
    resumeCheckingIndexChanges(sitePath, org, repo);
    resumeCheckingChanges(sitePath, org, repo, ref);
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
 */
export async function initService(sitePath, options = {}) {
  const {
    onEvent,
    mode = getMediaLibraryHostMode(),
    hasMediaData = false,
  } = options;
  eventEmitter = onEvent;

  if (!sitePath || pollingStarted) return;

  const [org, repo] = sitePath.split('/').slice(1, 3);

  // Plugin mode: Load data once, no polling
  if (mode === 'plugin') {
    if (isPerfEnabled()) {
      // eslint-disable-next-line no-console
      console.log(`[perf] Initializing indexing service in PLUGIN mode (no polling) for ${sitePath}`);
    }
    return;
  }

  if (isPerfEnabled()) {
    // eslint-disable-next-line no-console
    console.log(`[perf] Initializing indexing service in APP mode (checkIndex 60s + checkChanges 120s polling) for ${sitePath}`);
  }

  // App mode: Start both inward and outward polling + check lock state
  startCheckingIndexChanges(sitePath, org, repo);
  startCheckingChanges(sitePath, org, repo);

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
  pauseCheckingIndexChanges();
  pauseCheckingChanges();
  stopLockCheckPolling();
  pollingStarted = false;
  eventEmitter = null;
}
