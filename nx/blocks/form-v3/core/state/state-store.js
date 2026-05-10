function cloneSnapshot(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function createCoreState({
  documentValues = null,
  formModel = null,
  errorsByPointer = {},
} = {}) {
  return {
    document: {
      values: documentValues,
    },
    model: {
      formModel,
    },
    validation: {
      errorsByPointer,
    },
  };
}

export function createInitialState() {
  return createCoreState();
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
