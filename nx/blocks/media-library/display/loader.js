import { loadIndexMetadata, loadIndexChunk } from '../core/storage.js';

/**
 * DisplayLoader - Polls DA storage for index changes and loads chunks
 * Independent of indexing worker (plugin-mode ready)
 */
class DisplayLoader {
  constructor(sitePath, onDataLoaded) {
    this.sitePath = sitePath;
    this.onDataLoaded = onDataLoaded;
    this.intervalId = null;
    this.lastTimestamp = null;
    this.pollingInterval = 60000; // Default: 60s
  }

  /**
   * Poll for index changes and load data if changed
   */
  async poll() {
    try {
      const metadata = await loadIndexMetadata(this.sitePath);

      if (!metadata) {
        this.onDataLoaded({ data: null, error: new Error('No index metadata found') });
        return;
      }

      // Check if timestamp changed
      if (this.lastTimestamp !== null && metadata.lastModified === this.lastTimestamp) {
        // No change - skip loading
        return;
      }

      // Timestamp changed or first load - load all chunks
      this.lastTimestamp = metadata.lastModified;

      const chunks = [];
      for (let i = 0; i < metadata.chunks; i += 1) {
        const chunk = await loadIndexChunk(this.sitePath, i);
        chunks.push(...chunk);
      }

      // Adapt polling interval based on data volume
      this.adaptPollingInterval(metadata.totalEntries);

      this.onDataLoaded({ data: chunks, error: null });
    } catch (error) {
      this.onDataLoaded({ data: null, error });
    }
  }

  /**
   * Adapt polling interval based on data volume
   * <1000 items: 60s
   * <10000 items: 90s
   * >=10000 items: 120s
   */
  adaptPollingInterval(totalEntries) {
    let newInterval;
    if (totalEntries < 1000) {
      newInterval = 60000;
    } else if (totalEntries < 10000) {
      newInterval = 90000;
    } else {
      newInterval = 120000;
    }

    if (newInterval !== this.pollingInterval) {
      this.pollingInterval = newInterval;
      // Restart polling with new interval (skip immediate poll since we just polled)
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = setInterval(() => this.poll(), this.pollingInterval);
      }
    }
  }

  /**
   * Start polling
   */
  start() {
    // Immediate first poll
    this.poll();
    // Schedule recurring polls
    this.intervalId = setInterval(() => this.poll(), this.pollingInterval);
  }

  /**
   * Stop polling
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Active loader instance
let activeLoader = null;

/**
 * Start display loader
 * @param {string} sitePath - Site path
 * @param {Function} onDataLoaded - Callback receiving {data, error}
 */
export function startDisplayLoader(sitePath, onDataLoaded) {
  if (activeLoader) {
    activeLoader.stop();
  }
  activeLoader = new DisplayLoader(sitePath, onDataLoaded);
  activeLoader.start();
}

/**
 * Stop display loader
 */
export function stopDisplayLoader() {
  if (activeLoader) {
    activeLoader.stop();
    activeLoader = null;
  }
}
