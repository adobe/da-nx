function cloneSnapshot(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function createInitialState() {
  return {
    document: {
      values: null,
    },
    model: {
      formModel: null,
    },
    validation: {
      errorsByPointer: {},
    },
  };
}

export function createStateStore(initial = createInitialState()) {
  let state = cloneSnapshot(initial);

  return {
    getState() {
      return state;
    },

    setState(nextState) {
      state = nextState;
      return state;
    },

    dispose() { },
  };
}
