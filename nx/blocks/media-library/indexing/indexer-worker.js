/**
 * Indexer Web Worker Entry Point
 * Runs indexing operations off the main thread
 */

// Log worker start
console.log('[Worker] Starting indexer worker from:', self.location.href);

let initIndexerService;
let triggerBuild;
let disposeIndexerService;

// Try to import with detailed error logging
try {
  const module = await import('./indexer-service.js');
  initIndexerService = module.initIndexerService;
  triggerBuild = module.triggerBuild;
  disposeIndexerService = module.disposeIndexerService;
  console.log('[Worker] Successfully imported indexer-service.js');
} catch (error) {
  console.error('[Worker] Failed to import indexer-service.js:', error);
  self.postMessage({
    type: 'error',
    error: `Import failed: ${error.message}`,
  });
  throw error;
}

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
