/**
 * Neutral indexing event types and interfaces.
 * Indexing emits these events, display layer consumes them.
 */

/**
 * Event types emitted by indexing coordinator
 * @enum {string}
 */
export const IndexingEventType = {
  // Build lifecycle
  BUILD_STARTED: 'build-started',
  BUILD_PROGRESS: 'build-progress',
  BUILD_DATA: 'build-data',
  BUILD_COMPLETE: 'build-complete',
  BUILD_ERROR: 'build-error',

  // Lock state
  LOCK_ACQUIRED: 'lock-acquired',
  LOCK_DETECTED: 'lock-detected',
  LOCK_RELEASED: 'lock-released',
  LOCK_STALE: 'lock-stale',
  LOCK_FAILED: 'lock-failed',

  // Data state
  INDEX_MISSING: 'index-missing',
  INDEX_LOADED: 'index-loaded',
  INDEX_UPDATED: 'index-updated',
};

/**
 * Error codes emitted by indexing (display layer maps to user messages)
 * @enum {string}
 */
export const IndexingErrorCode = {
  AUTH_REQUIRED: 'auth-required',
  AUTH_FAILED: 'auth-failed',
  BUILD_FAILED: 'build-failed',
  LOCK_CREATE_FAILED: 'lock-create-failed',
  LOCK_REMOVE_FAILED: 'lock-remove-failed',
  INDEX_PARSE_ERROR: 'index-parse-error',
  NETWORK_TIMEOUT: 'network-timeout',
  DA_READ_DENIED: 'da-read-denied',
  DA_WRITE_DENIED: 'da-write-denied',
  DA_SAVE_FAILED: 'da-save-failed',
};

/**
 * @typedef {Object} BuildStartedEvent
 * @property {string} type - IndexingEventType.BUILD_STARTED
 * @property {number} timestamp - Start time
 * @property {string} mode - 'full' | 'incremental'
 * @property {boolean} forceFull - Whether full rebuild was forced
 */

/**
 * @typedef {Object} BuildProgressEvent
 * @property {string} type - IndexingEventType.BUILD_PROGRESS
 * @property {string} stage - Current stage name
 * @property {string} detail - Stage-specific detail message (neutral, not localized)
 * @property {number} [itemsProcessed] - Optional progress counter
 * @property {number} [totalItems] - Optional total counter
 */

/**
 * @typedef {Object} BuildDataEvent
 * @property {string} type - IndexingEventType.BUILD_DATA
 * @property {Array} items - Media items batch
 * @property {number} [batchIndex] - Batch number (for progressive display)
 * @property {number} [totalBatches] - Total batches expected
 */

/**
 * @typedef {Object} BuildCompleteEvent
 * @property {string} type - IndexingEventType.BUILD_COMPLETE
 * @property {Array} data - Final media data
 * @property {number} duration - Build duration in ms
 * @property {number} itemCount - Total items indexed
 * @property {boolean} hasChanges - Whether index changed
 * @property {boolean} [lockRemoveFailed] - Whether lock removal failed
 */

/**
 * @typedef {Object} BuildErrorEvent
 * @property {string} type - IndexingEventType.BUILD_ERROR
 * @property {string} code - IndexingErrorCode
 * @property {string} message - Technical error message (not user-facing)
 * @property {Object} [context] - Additional error context
 * @property {boolean} [isPersistent] - Whether error persists (vs transient)
 */

/**
 * @typedef {Object} LockDetectedEvent
 * @property {string} type - IndexingEventType.LOCK_DETECTED
 * @property {string} ownerId - Lock owner ID
 * @property {number} timestamp - Lock timestamp
 * @property {boolean} fresh - Whether lock is fresh (active)
 */

/**
 * @typedef {Object} IndexMissingEvent
 * @property {string} type - IndexingEventType.INDEX_MISSING
 * @property {string} sitePath - Site path with missing index
 */

/**
 * @typedef {Object} IndexLoadedEvent
 * @property {string} type - IndexingEventType.INDEX_LOADED
 * @property {Array} data - Loaded media data
 * @property {boolean} hasData - Whether data exists
 */

/**
 * Union type of all indexing events
 * @typedef {BuildStartedEvent | BuildProgressEvent | BuildDataEvent |
 *   BuildCompleteEvent | BuildErrorEvent | LockDetectedEvent |
 *   IndexMissingEvent | IndexLoadedEvent} IndexingEvent
 */

/**
 * Create a build started event
 */
export function createBuildStartedEvent(mode, forceFull = false) {
  return {
    type: IndexingEventType.BUILD_STARTED,
    timestamp: Date.now(),
    mode,
    forceFull,
  };
}

/**
 * Create a build progress event
 */
export function createBuildProgressEvent(stage, detail, itemsProcessed = null, totalItems = null) {
  const event = {
    type: IndexingEventType.BUILD_PROGRESS,
    stage,
    detail,
  };
  if (itemsProcessed !== null) event.itemsProcessed = itemsProcessed;
  if (totalItems !== null) event.totalItems = totalItems;
  return event;
}

/**
 * Create a build data event
 */
export function createBuildDataEvent(items, batchIndex = null, totalBatches = null) {
  const event = {
    type: IndexingEventType.BUILD_DATA,
    items,
  };
  if (batchIndex !== null) event.batchIndex = batchIndex;
  if (totalBatches !== null) event.totalBatches = totalBatches;
  return event;
}

/**
 * Create a build complete event
 */
export function createBuildCompleteEvent(data, duration, hasChanges, lockRemoveFailed = false) {
  return {
    type: IndexingEventType.BUILD_COMPLETE,
    data,
    duration,
    itemCount: data?.length || 0,
    hasChanges,
    lockRemoveFailed,
  };
}

/**
 * Create a build error event
 */
export function createBuildErrorEvent(code, message, context = null, isPersistent = false) {
  const event = {
    type: IndexingEventType.BUILD_ERROR,
    code,
    message,
    isPersistent,
  };
  if (context) event.context = context;
  return event;
}

/**
 * Create a lock detected event
 */
export function createLockDetectedEvent(ownerId, timestamp, fresh) {
  return {
    type: IndexingEventType.LOCK_DETECTED,
    ownerId,
    timestamp,
    fresh,
  };
}

/**
 * Create an index missing event
 */
export function createIndexMissingEvent(sitePath) {
  return {
    type: IndexingEventType.INDEX_MISSING,
    sitePath,
  };
}

/**
 * Create an index loaded event
 */
export function createIndexLoadedEvent(data) {
  return {
    type: IndexingEventType.INDEX_LOADED,
    data,
    hasData: Array.isArray(data) && data.length > 0,
  };
}
