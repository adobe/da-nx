/**
 * Indexer Service - Worker-safe indexing logic
 * Pure functions, no DOM dependencies
 */

import buildMediaIndex, {
  loadMediaIfUpdated,
  checkIndexLock,
  isFreshIndexLock,
  getIndexLockOwnerId,
} from './load.js';
import { getCanonicalMediaTimestamp } from '../core/utils.js';
import { getDedupeKey } from '../core/urls.js';
import { isFullRebuildRequested, perfLog } from '../core/params.js';

const CONFIG = {
  POLLING_INTERVAL: 60000, // 60s - check for changes
  LOCK_CHECK_INTERVAL: 5000, // 5s - check if lock released
};

// Service state
let serviceState = {
  sitePath: null,
  org: null,
  repo: null,
  callbacks: null,
  pollingInterval: null,
  lockCheckInterval: null,
  isBuilding: false,
};

/**
 * Stop polling
 */
function stopPolling() {
  if (serviceState.pollingInterval) {
    clearInterval(serviceState.pollingInterval);
    serviceState.pollingInterval = null;
    perfLog('Worker:Poll', 'Stopped polling');
  }
}

/**
 * Stop lock check polling
 */
function stopLockCheckPolling() {
  if (serviceState.lockCheckInterval) {
    clearInterval(serviceState.lockCheckInterval);
    serviceState.lockCheckInterval = null;
    perfLog('Worker:LockPoll', 'Stopped lock check polling');
  }
}

/**
 * Trigger a build (full or incremental)
 */
export async function triggerBuild(mode = 'incremental') {
  if (serviceState.isBuilding) {
    perfLog('Worker:Build', 'Build already in progress');
    return;
  }

  const { sitePath, org, repo, callbacks } = serviceState;

  if (!sitePath || !org || !repo) {
    throw new Error('Service not initialized');
  }

  serviceState.isBuilding = true;
  stopPolling(); // Pause polling during build

  perfLog('Worker:Build', 'Starting build', { mode, sitePath });

  // Progressive data structures for streaming results
  const PROGRESSIVE_DISPLAY_CAP = 3000;
  const PROGRESSIVE_COUNT_CAP = 50000;
  const progressiveMap = new Map();
  const allSeenKeys = new Set();
  let maxProgressiveCount = 0;
  let countCapped = false;

  try {
    const onProgress = (progressInfo) => {
      callbacks?.onProgress?.({
        stage: progressInfo.stage,
        message: progressInfo.message,
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

      callbacks?.onProgress?.({
        stage: 'indexing',
        progressiveData: toRender,
        totalCount: maxProgressiveCount,
        countCapped,
      });
    };

    const forceFull = mode === 'full' || isFullRebuildRequested();
    const result = await buildMediaIndex(
      sitePath,
      org,
      repo,
      'main',
      onProgress,
      onProgressiveData,
      { forceFull },
    );

    // Clear progressive data
    progressiveMap.clear();
    allSeenKeys.clear();

    perfLog('Worker:Build', 'Build complete', {
      mode: result.mode || mode,
      itemCount: result.mediaData?.length || 0,
      duration: result.duration,
    });

    callbacks?.onComplete?.({
      itemCount: result.mediaData?.length || 0,
      duration: result.duration,
      hasChanges: result.hasChanges,
    });
  } catch (error) {
    perfLog('Worker:Build', 'Build failed', { error: error.message });
    callbacks?.onError?.(error);
  } finally {
    serviceState.isBuilding = false;
    // eslint-disable-next-line no-use-before-define
    startPolling(); // Resume polling
  }
}

/**
 * Start polling for media updates
 */
function startPolling() {
  if (serviceState.pollingInterval) return;

  perfLog('Worker:Poll', 'Started polling for media updates', {
    intervalMs: CONFIG.POLLING_INTERVAL,
  });

  serviceState.pollingInterval = setInterval(async () => {
    if (serviceState.isBuilding) {
      perfLog('Worker:Poll', 'Skipped - build in progress');
      return;
    }

    try {
      const { sitePath, org, repo } = serviceState;
      perfLog('Worker:Poll', 'Checking for media updates', { sitePath });

      const result = await loadMediaIfUpdated(sitePath, org, repo);
      const { hasChanged, mediaData } = result;

      if (hasChanged) {
        perfLog('Worker:Poll', 'Media data changed', {
          itemCount: mediaData?.length || 0,
        });
        // Changes detected - trigger incremental build
        // eslint-disable-next-line no-use-before-define
        await triggerBuild('incremental');
      } else {
        perfLog('Worker:Poll', 'No changes detected');
      }
    } catch (error) {
      perfLog('Worker:Poll', 'Error during poll', { error: error.message });
      serviceState.callbacks?.onError?.(error);
    }
  }, CONFIG.POLLING_INTERVAL);
}

/**
 * Start lock check polling (when another instance is building)
 */
function startLockCheckPolling() {
  if (serviceState.lockCheckInterval) return;

  perfLog('Worker:LockPoll', 'Started lock check polling', {
    intervalMs: CONFIG.LOCK_CHECK_INTERVAL,
  });

  serviceState.lockCheckInterval = setInterval(async () => {
    try {
      const { sitePath } = serviceState;
      const lock = await checkIndexLock(sitePath);

      if (!isFreshIndexLock(lock)) {
        perfLog('Worker:LockPoll', 'Lock released - resuming');
        stopLockCheckPolling();
        // Lock released - check for updates and resume polling
        // eslint-disable-next-line no-use-before-define
        startPolling();
        // eslint-disable-next-line no-use-before-define
        await triggerBuild('incremental');
      } else {
        perfLog('Worker:LockPoll', 'Lock still held');
      }
    } catch (error) {
      perfLog('Worker:LockPoll', 'Error checking lock', { error: error.message });
    }
  }, CONFIG.LOCK_CHECK_INTERVAL);
}

/**
 * Initialize indexer service
 */
export async function initIndexerService(sitePath, org, repo, callbacks) {
  serviceState = {
    sitePath,
    org,
    repo,
    callbacks,
    pollingInterval: null,
    lockCheckInterval: null,
    isBuilding: false,
  };

  perfLog('Worker:Init', 'Indexer service initialized', { sitePath, org, repo });

  // Start polling for changes
  startPolling();

  // Check if we need to build immediately
  const lock = await checkIndexLock(sitePath);
  const ownerId = getIndexLockOwnerId();
  const ownsLock = lock.ownerId && lock.ownerId === ownerId;
  const freshLock = isFreshIndexLock(lock);

  if (freshLock && !ownsLock) {
    // Another instance is building - start lock check polling
    perfLog('Worker:Init', 'Index locked by another instance');
    startLockCheckPolling();
    return;
  }

  // Check if we should do initial build
  const forceFullRebuild = isFullRebuildRequested();
  if (forceFullRebuild) {
    perfLog('Worker:Init', 'Force full rebuild requested');
    await triggerBuild('full');
    return;
  }

  // Check if incremental build needed
  const { checkReindexEligibility } = await import('./build.js');
  const reindexCheck = await checkReindexEligibility(sitePath, org, repo);

  if (reindexCheck.shouldReindex) {
    perfLog('Worker:Init', 'Starting incremental build');
    await triggerBuild('incremental');
  }
}

/**
 * Dispose indexer service
 */
export function disposeIndexerService() {
  perfLog('Worker:Dispose', 'Disposing indexer service');
  stopPolling();
  stopLockCheckPolling();
  serviceState = {
    sitePath: null,
    org: null,
    repo: null,
    callbacks: null,
    pollingInterval: null,
    lockCheckInterval: null,
    isBuilding: false,
  };
}
