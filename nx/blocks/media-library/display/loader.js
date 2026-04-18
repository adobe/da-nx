import { loadIndexMetadata, loadIndexChunk } from '../core/storage.js';
import { perfLog } from '../core/params.js';

/**
 * Display loader state (pure function approach)
 */
let loaderState = {
  sitePath: null,
  onDataLoaded: null,
  intervalId: null,
  lastTimestamp: null,
  pollingInterval: 60000, // Default: 60s
};

/**
 * Adapt polling interval based on data volume
 * <1000 items: 60s, <10000 items: 90s, >=10000 items: 120s
 */
function adaptPollingInterval(totalEntries) {
  let newInterval;
  if (totalEntries < 1000) {
    newInterval = 60000;
  } else if (totalEntries < 10000) {
    newInterval = 90000;
  } else {
    newInterval = 120000;
  }

  if (newInterval !== loaderState.pollingInterval) {
    perfLog('Display:Poll', 'Adapted polling interval', {
      oldIntervalMs: loaderState.pollingInterval,
      newIntervalMs: newInterval,
      totalEntries,
    });

    loaderState.pollingInterval = newInterval;

    // Restart polling with new interval
    if (loaderState.intervalId) {
      clearInterval(loaderState.intervalId);
      // eslint-disable-next-line no-use-before-define
      loaderState.intervalId = setInterval(poll, loaderState.pollingInterval);
    }
  }
}

/**
 * Poll for index changes and load data if changed
 */
async function poll() {
  const { sitePath, onDataLoaded, lastTimestamp } = loaderState;

  if (!sitePath || !onDataLoaded) return;

  try {
    perfLog('Display:Poll', 'Checking for index changes', { sitePath });

    const metadata = await loadIndexMetadata(sitePath);

    if (!metadata) {
      perfLog('Display:Poll', 'No index metadata found');
      onDataLoaded({ data: null, error: new Error('No index metadata found') });
      return;
    }

    // Check if timestamp changed
    if (lastTimestamp !== null && metadata.lastModified === lastTimestamp) {
      perfLog('Display:Poll', 'No changes detected', {
        timestamp: metadata.lastModified,
        totalEntries: metadata.totalEntries,
      });
      return;
    }

    // Timestamp changed or first load - load all chunks
    perfLog('Display:Poll', 'Index changed - loading chunks', {
      chunks: metadata.chunks,
      totalEntries: metadata.totalEntries,
      timestamp: metadata.lastModified,
    });

    loaderState.lastTimestamp = metadata.lastModified;

    const chunks = [];
    for (let i = 0; i < metadata.chunks; i += 1) {
      const chunk = await loadIndexChunk(sitePath, i);
      chunks.push(...chunk);
    }

    // Adapt polling interval based on data volume
    adaptPollingInterval(metadata.totalEntries);

    perfLog('Display:Poll', 'Loaded index data', {
      items: chunks.length,
      chunks: metadata.chunks,
      pollingIntervalMs: loaderState.pollingInterval,
    });

    onDataLoaded({ data: chunks, error: null });
  } catch (error) {
    perfLog('Display:Poll', 'Error loading index', { error: error.message });
    onDataLoaded({ data: null, error });
  }
}

/**
 * Stop display loader
 */
export function stopDisplayLoader() {
  if (loaderState.intervalId) {
    clearInterval(loaderState.intervalId);
    loaderState = {
      sitePath: null,
      onDataLoaded: null,
      intervalId: null,
      lastTimestamp: null,
      pollingInterval: 60000,
    };
  }
}

/**
 * Start display loader
 * @param {string} sitePath - Site path
 * @param {Function} onDataLoaded - Callback receiving {data, error}
 */
export function startDisplayLoader(sitePath, onDataLoaded) {
  stopDisplayLoader();

  loaderState = {
    sitePath,
    onDataLoaded,
    intervalId: null,
    lastTimestamp: null,
    pollingInterval: 60000,
  };

  perfLog('Display:Poll', 'Started display polling', {
    sitePath,
    intervalMs: loaderState.pollingInterval,
  });

  // Immediate first poll
  poll();

  // Schedule recurring polls
  loaderState.intervalId = setInterval(poll, loaderState.pollingInterval);
}
