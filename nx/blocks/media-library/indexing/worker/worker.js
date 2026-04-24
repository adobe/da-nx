/**
 * Main worker entry point for media library indexing
 *
 * Handles both full and incremental index builds in a web worker.
 * Communicates with main thread via postMessage.
 *
 * Message format from main thread:
 * {
 *   mode: 'full' | 'incremental',
 *   sitePath: string,
 *   org: string,
 *   repo: string,
 *   ref: string,
 *   imsToken: string,
 *   siteToken: string | null,
 *   daOrigin: string,
 *   daEtcOrigin: string,
 *   isPerfEnabled: boolean,
 *   IndexConfig: object,
 * }
 *
 * Messages to main thread:
 * - { type: 'progress', data: { stage, message } }
 * - { type: 'progressive', data: mediaData[] }
 * - { type: 'log', message: string }
 * - { type: 'success', data: mediaData[] }
 * - { type: 'error', error: { message, code } }
 */

/* eslint-disable no-console */

import { buildFullIndex } from './full.js';
import { buildIncrementalIndex } from './incremental.js';

console.log('[IndexWorker] Worker modules loaded successfully');

self.onmessage = async (event) => {
  const {
    mode,
    sitePath,
    org,
    repo,
    ref,
    imsToken,
    siteToken,
    daOrigin,
    daEtcOrigin,
    isPerfEnabled,
    IndexConfig,
  } = event.data;

  try {
    if (isPerfEnabled) {
      console.log(`[IndexWorker] Starting ${mode} build for ${sitePath}`);
    }

    // Prepare callbacks for main thread communication
    const onProgress = (progressData) => {
      self.postMessage({
        type: 'progress',
        data: progressData,
      });
    };

    const onProgressiveData = (mediaData) => {
      self.postMessage({
        type: 'progressive',
        data: mediaData,
      });
    };

    const onLog = (message) => {
      self.postMessage({
        type: 'log',
        message,
      });
    };

    // Prepare runtime context for worker functions
    const context = {
      imsToken,
      siteToken,
      daOrigin,
      daEtcOrigin,
      isPerfEnabled,
      IndexConfig,
    };

    let result;

    if (mode === 'full') {
      result = await buildFullIndex(
        sitePath,
        org,
        repo,
        ref,
        onProgress,
        onProgressiveData,
        context,
      );
    } else if (mode === 'incremental') {
      result = await buildIncrementalIndex(
        sitePath,
        org,
        repo,
        ref,
        onProgress,
        onLog,
        onProgressiveData,
        context,
      );
    } else {
      throw new Error(`Unknown build mode: ${mode}`);
    }

    if (isPerfEnabled) {
      console.log(`[IndexWorker] ${mode} build complete, ${result?.length || 0} entries`);
    }

    // Send success response
    self.postMessage({
      type: 'success',
      data: result,
    });
  } catch (error) {
    console.error('[IndexWorker] Build failed:', error);

    // Send error response
    self.postMessage({
      type: 'error',
      error: {
        message: error.message || 'Unknown error',
        code: error.code || 'WORKER_ERROR',
        stack: error.stack,
      },
    });
  }
};

console.log('[IndexWorker] Worker loaded and ready');
