/**
 * Index Build Orchestrator - Manages index builds via workers
 *
 * This module orchestrates the index building process:
 * - Manages build locks (prevent concurrent builds)
 * - Spawns and communicates with web workers
 * - Handles full vs incremental build decisions
 * - Manages worker lifecycle and error handling
 *
 * Emits events consumed by core/indexing-adapter.js
 */

import {
  checkIndexLock,
  isFreshIndexLock,
  getIndexLockOwnerId,
  createIndexLock,
  refreshIndexLock,
  removeIndexLock,
} from './locks.js';
import { checkReindexEligibility } from './index-status.js';
import { getAemSiteToken, clearCachedAemSiteToken } from './admin-api.js';
import { sortMediaData } from '../core/utils.js';
import { ErrorCodes } from '../core/errors.js';
import {
  IndexConfig,
  DA_ORIGIN,
  DA_ETC_ORIGIN,
} from '../core/constants.js';
import { isPerfEnabled } from '../core/params.js';

/**
 * Run index build in web worker
 *
 * @param {string} mode - 'full' or 'incremental'
 * @param {string} sitePath - Site path
 * @param {string} org - Organization
 * @param {string} repo - Repository
 * @param {string} ref - Branch reference
 * @param {Function} onProgress - Progress callback
 * @param {Function} onProgressiveData - Progressive data callback
 * @returns {Promise<Array>} Media data
 */
async function runWorkerBuild(
  mode,
  sitePath,
  org,
  repo,
  ref,
  onProgress,
  onProgressiveData,
) {
  // Get runtime context
  const imsToken = window.adobeIMS?.getAccessToken?.()?.token;
  if (!imsToken) {
    throw new Error('No IMS token available');
  }

  // Get fresh site token using the same logic as main branch (with caching and expiry)
  // This ensures worker gets a valid token that won't immediately expire
  let siteToken = null;
  try {
    const tokenResult = await getAemSiteToken({ org, site: repo, ref });
    siteToken = tokenResult?.siteToken || null;
  } catch {
    // If we can't get a fresh token, fall back to localStorage (legacy behavior)
    siteToken = window.localStorage?.getItem?.(`site-token-${org}-${repo}`) || null;
  }

  const daOrigin = DA_ORIGIN;
  const daEtcOrigin = DA_ETC_ORIGIN;
  const perfEnabled = isPerfEnabled();

  // Create worker using blob URL to avoid CORS issues with ?nx=local
  // When running with ?nx=local, files load from localhost but page is on da.live
  // Workers must be same-origin, so we create a blob URL
  const workerUrl = new URL('./worker/worker.js', import.meta.url).href;
  const response = await fetch(workerUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch worker code: ${response.status}`);
  }

  let workerCode = await response.text();

  // Replace ALL relative imports with absolute URLs so worker can fetch them
  // This converts: import './foo.js' → import 'http://localhost:6456/.../foo.js'
  const baseUrl = new URL('./worker/', import.meta.url).href;
  workerCode = workerCode.replace(
    /from\s+['"](\.\.[^'"]*|\.\/[^'"]*)['"]/g,
    (match, path) => {
      const absoluteUrl = new URL(path, baseUrl).href;
      return `from '${absoluteUrl}'`;
    },
  );

  // Create blob URL from transformed code
  const blob = new Blob([workerCode], { type: 'application/javascript' });
  const workerBlobUrl = URL.createObjectURL(blob);

  const worker = new Worker(workerBlobUrl, { type: 'module' });

  // Set up result promise
  const resultPromise = new Promise((resolve, reject) => {
    worker.onmessage = async (event) => {
      const { type, data, error, message, requestId } = event.data;

      if (type === 'progress') {
        onProgress?.(data);
      } else if (type === 'progressive') {
        onProgressiveData?.(data);
      } else if (type === 'log') {
        // eslint-disable-next-line no-console
        console.log('[IndexWorker]', message);
      } else if (type === 'token-refresh') {
        // Worker requests fresh site token (401/403 during markdown fetch)
        // Must clear cache first to force a real refresh (matches canonical behavior)
        try {
          clearCachedAemSiteToken(org, repo, ref);
          const tokenResult = await getAemSiteToken({ org, site: repo, ref });
          const freshToken = tokenResult?.siteToken || null;
          worker.postMessage({ type: 'token-refresh-response', requestId, token: freshToken });
        } catch (err) {
          worker.postMessage({ type: 'token-refresh-response', requestId, token: null, error: err.message });
        }
      } else if (type === 'success') {
        resolve(data);
      } else if (type === 'error') {
        reject(new Error(error.message || 'Worker error'));
      }
    };

    worker.onerror = (event) => {
      // eslint-disable-next-line no-console
      console.error('[runWorkerBuild] Worker error event:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      });
      const errorDetails = event.filename
        ? `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`
        : event.message;
      reject(new Error(`Worker error: ${errorDetails}`));
    };
  });

  // Send build parameters to worker
  worker.postMessage({
    mode,
    sitePath,
    org,
    repo,
    ref,
    imsToken,
    siteToken,
    daOrigin,
    daEtcOrigin,
    isPerfEnabled: perfEnabled,
    IndexConfig,
  });

  try {
    const result = await resultPromise;
    return result;
  } finally {
    // Clean up
    worker.terminate();
    URL.revokeObjectURL(workerBlobUrl);
  }
}

// eslint-disable-next-line max-len -- function signature
export default async function buildMediaIndex(
  sitePath,
  org,
  repo,
  ref,
  onProgress,
  onProgressiveData,
  options = {},
) {
  const { forceFull = false } = options;
  const startTime = Date.now();

  const existingLock = await checkIndexLock(sitePath);
  const ownerId = getIndexLockOwnerId();
  const ownsExistingLock = existingLock.ownerId && existingLock.ownerId === ownerId;
  if (isFreshIndexLock(existingLock) && !ownsExistingLock) {
    const heartbeat = existingLock.lastUpdated
      || existingLock.timestamp
      || existingLock.startedAt
      || Date.now();
    const lockAge = Date.now() - heartbeat;
    throw new Error(
      `Index build already in progress. Lock updated ${Math.round(lockAge / 1000 / 60)} minutes ago.`,
    );
  }
  if (
    existingLock.exists
    && existingLock.locked
    && !isFreshIndexLock(existingLock)
    && !ownsExistingLock
  ) {
    await removeIndexLock(sitePath);
  }

  await createIndexLock(sitePath);
  const heartbeatLockData = {
    startedAt: ownsExistingLock
      ? (existingLock.startedAt || existingLock.timestamp || Date.now())
      : Date.now(),
    timestamp: ownsExistingLock
      ? (existingLock.timestamp || existingLock.startedAt || Date.now())
      : Date.now(),
    ownerId,
    mode: forceFull ? 'full' : 'incremental',
  };
  const heartbeatTimer = setInterval(() => {
    refreshIndexLock(sitePath, heartbeatLockData).catch(() => {});
  }, IndexConfig.LOCK_HEARTBEAT_INTERVAL_MS);

  try {
    const reindexCheck = await checkReindexEligibility(sitePath, org, repo);
    const useIncremental = !forceFull && reindexCheck.shouldReindex;

    // Run build in worker (full or incremental)
    const buildMode = useIncremental ? 'incremental' : 'full';
    const mediaData = await runWorkerBuild(
      buildMode,
      sitePath,
      org,
      repo,
      ref,
      onProgress,
      onProgressiveData,
    );

    let lockRemoveFailed = false;
    try {
      await removeIndexLock(sitePath);
    } catch (lockErr) {
      if (lockErr.code === ErrorCodes.LOCK_REMOVE_FAILED) {
        lockRemoveFailed = true;
      } else {
        throw lockErr;
      }
    }

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);
    const sortedData = sortMediaData(mediaData);
    return {
      duration: `${duration}s`,
      hasChanges: true,
      mediaData: sortedData,
      lockRemoveFailed,
    };
  } catch (error) {
    try {
      await removeIndexLock(sitePath);
    } catch { /* swallow */ }
    throw error;
  } finally {
    clearInterval(heartbeatTimer);
  }
}
