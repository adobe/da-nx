function nowIso() {
  return new Date().toISOString();
}

export function createInitialState() {
  return {
    status: {
      code: 'idle',
      details: null,
      updatedAt: nowIso(),
    },
    blockers: [],
    formModel: null,
    values: null,
    errors: [],
    errorsByPointer: {},
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
    selection: {
      activePointer: '/data',
      origin: null,
    },
    permissions: {
      readonly: false,
      disabled: false,
      capabilities: { canEdit: true },
    },
    compatibility: {
      status: 'unknown',
      editable: false,
      unsupportedFeatures: [],
    },
    lastCommandResult: null,
    lastPersistenceError: null,
  };
}

export function createStateStore(initial = createInitialState()) {
  let state = initial;

  return {
    getState() {
      return state;
    },

    replaceState(nextState) {
      state = nextState;
      return state;
    },

    patchState(partial) {
      state = {
        ...state,
        ...partial,
      };
      return state;
    },
  };
}
