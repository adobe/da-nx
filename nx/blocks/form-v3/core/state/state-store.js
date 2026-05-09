function nowIso() {
  return new Date().toISOString();
}

function cloneSnapshot(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function createInitialState() {
  return {
    status: {
      code: 'idle',
      details: null,
      updatedAt: nowIso(),
    },
    document: {
      values: null,
    },
    model: {
      formModel: null,
    },
    validation: {
      errors: [],
      errorsByPointer: {},
    },
    saving: {
      status: 'idle',
      error: null,
      sequence: 0,
      requestedSequence: 0,
      acknowledgedSequence: 0,
      updatedAt: nowIso(),
    },
    loading: {
      status: 'idle',
      updatedAt: nowIso(),
    },
    compatibility: {
      status: 'unknown',
      editable: false,
      unsupportedFeatures: [],
    },
    errors: {
      blockers: [],
      lastPersistenceError: null,
    },
    lastCommandResult: null,
  };
}

export function createStateStore(initial = createInitialState()) {
  let state = cloneSnapshot(initial);
  const listeners = new Set();

  function notify() {
    const snapshot = cloneSnapshot(state);
    for (const listener of listeners) {
      listener(snapshot);
    }
    return snapshot;
  }

  return {
    getState() {
      return state;
    },

    setState(nextState, { emit = false } = {}) {
      state = nextState;
      if (emit) {
        return notify();
      }
      return state;
    },

    subscribe(listener, { emitCurrent = true } = {}) {
      listeners.add(listener);

      if (emitCurrent) {
        listener(cloneSnapshot(state));
      }

      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      listeners.clear();
    },
  };
}
