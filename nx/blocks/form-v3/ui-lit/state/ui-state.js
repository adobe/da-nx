function cloneSnapshot(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function createInitialUiState() {
  return {
    navigation: {
      activePointer: '/data',
      selectionOrigin: null,
      selectionSequence: 0,
    },
  };
}

export function createUiStateStore(initial = createInitialUiState()) {
  let state = cloneSnapshot(initial);
  const listeners = new Set();

  function getState() {
    return cloneSnapshot(state);
  }

  function emit() {
    const snapshot = getState();
    for (const listener of listeners) {
      listener(snapshot);
    }
    return snapshot;
  }

  function setSelection({ pointer, origin = null } = {}) {
    if (!pointer || typeof pointer !== 'string') {
      return getState();
    }

    const currentNavigation = state.navigation;
    state = {
      ...state,
      navigation: {
        ...currentNavigation,
        activePointer: pointer,
        selectionOrigin: origin,
        selectionSequence: (currentNavigation.selectionSequence ?? 0) + 1,
      },
    };

    return emit();
  }

  function subscribe(listener, { emitCurrent = true } = {}) {
    listeners.add(listener);

    if (emitCurrent) {
      listener(getState());
    }

    return () => {
      listeners.delete(listener);
    };
  }

  function dispose() {
    listeners.clear();
  }

  return {
    getState,
    setSelection,
    subscribe,
    dispose,
  };
}
