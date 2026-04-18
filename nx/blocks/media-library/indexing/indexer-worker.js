/**
 * Indexer Web Worker Entry Point
 * Runs indexing operations off the main thread
 */

import { initIndexerService, triggerBuild, disposeIndexerService } from './indexer-service.js';

/**
 * Handle init message
 */
async function handleInit(data) {
  const { sitePath, org, repo } = data;

  try {
    await initIndexerService(sitePath, org, repo, {
      onProgress: (progress) => {
        self.postMessage({
          type: 'progress',
          progress,
        });
      },
      onComplete: (result) => {
        self.postMessage({
          type: 'complete',
          result,
        });
      },
      onError: (error) => {
        self.postMessage({
          type: 'error',
          error: error.message || 'Build failed',
        });
      },
    });

    self.postMessage({
      type: 'init-complete',
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message || 'Initialization failed',
    });
  }
}

async function handleTriggerBuild(data) {
  const { mode } = data;

  try {
    await triggerBuild(mode);
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error.message || 'Build failed',
    });
  }
}

/**
 * Handle dispose message
 */
function handleDispose() {
  disposeIndexerService();
  self.postMessage({
    type: 'dispose-complete',
  });
}

// Worker message handler
self.onmessage = async (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'init':
      await handleInit(data);
      break;

    case 'trigger-build':
      await handleTriggerBuild(data);
      break;

    case 'dispose':
      handleDispose();
      break;

    default:
      self.postMessage({
        type: 'error',
        error: `Unknown message type: ${type}`,
      });
  }
};

// Handle worker errors
self.onerror = (error) => {
  self.postMessage({
    type: 'error',
    error: error.message || 'Worker error',
  });
};
