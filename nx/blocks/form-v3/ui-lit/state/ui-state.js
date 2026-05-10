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

  function getState() {
    return cloneSnapshot(state);
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

    return getState();
  }

  function dispose() { }

  return {
    getState,
    setSelection,
    dispose,
  };
}
