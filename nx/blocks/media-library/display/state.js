/**
 * Display State Management
 *
 * Manages UI-specific state for the media library display layer.
 * This is completely separate from indexing/storage state.
 *
 * Display state includes:
 * - view mode (grid/list)
 * - selected items
 * - sorting preferences
 * - filters
 * - search query
 * - bulk edit mode
 */

const initialState = {
  view: 'grid',
  selectedIds: [],
  sortBy: 'uploadDate',
  sortOrder: 'desc',
  filters: {},
  searchQuery: '',
  bulkEditMode: false,
};

let currentState = { ...initialState };
const listeners = [];

/**
 * Get a copy of the current display state
 * @returns {Object} Current display state
 */
export function getDisplayState() {
  return { ...currentState };
}

/**
 * Update display state with new values
 * Merges updates into current state and notifies listeners
 * @param {Object} updates - Partial state updates
 */
export function updateDisplayState(updates) {
  const previousState = currentState;
  currentState = { ...currentState, ...updates };

  // Notify all listeners
  listeners.forEach(({ keys, callback }) => {
    // Check if any of the subscribed keys changed
    const hasChange = keys.some((key) => previousState[key] !== currentState[key]);
    if (hasChange) {
      callback(getDisplayState());
    }
  });
}

/**
 * Reset display state to initial values
 */
export function resetDisplayState() {
  currentState = { ...initialState };
  // Clear all listeners on reset (important for testing)
  listeners.length = 0;
}

/**
 * Subscribe to state changes for specific keys
 * @param {string[]} keys - State keys to watch
 * @param {Function} callback - Called when watched keys change
 * @returns {Function} Unsubscribe function
 */
export function onDisplayStateChange(keys, callback) {
  const listener = { keys, callback };
  listeners.push(listener);

  // Return unsubscribe function
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  };
}
