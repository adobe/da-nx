function nowIso() {
  return new Date().toISOString();
}

export function createSavingStore() {
  let state = {
    status: 'idle',
    error: null,
    updatedAt: nowIso(),
  };

  return {
    getState() {
      return state;
    },

    markSaving() {
      state = {
        status: 'saving',
        error: null,
        updatedAt: nowIso(),
      };
      return state;
    },

    markSaved() {
      state = {
        status: 'saved',
        error: null,
        updatedAt: nowIso(),
      };
      return state;
    },

    markFailed(error) {
      state = {
        status: 'failed',
        error: error ?? 'Unknown save error.',
        updatedAt: nowIso(),
      };
      return state;
    },
  };
}
