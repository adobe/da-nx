import { toCoreOperation } from './intent-command-map.js';
import { createUiStateStore } from '../state/ui-state.js';

function isUiSelectionIntent(commandOrIntent) {
  return commandOrIntent?.type === 'form-nav-pointer-select'
    || commandOrIntent?.type === 'selection.change';
}

function isFieldChangeIntent(commandOrIntent) {
  return commandOrIntent?.type === 'form-field-change'
    || commandOrIntent?.type === 'field.change';
}

function getDebounceMs(commandOrIntent) {
  const ms = Number(commandOrIntent?.debounceMs ?? 0);
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return ms;
}

function composeSnapshot({ coreState, uiState }) {
  return {
    ...(coreState ?? {}),
    ui: uiState,
  };
}

export function createFormController({ core }) {
  if (!core) {
    throw new Error('createFormController requires a core instance.');
  }

  const uiStateStore = createUiStateStore();
  const listeners = new Set();
  const pendingFieldTimers = new Map();

  let latestCoreState = core.getState?.() ?? {};
  let latestUiState = uiStateStore.getState();

  function getSnapshot() {
    return composeSnapshot({
      coreState: latestCoreState,
      uiState: latestUiState,
    });
  }

  function publish() {
    const snapshot = getSnapshot();
    for (const listener of listeners) {
      listener(snapshot);
    }
    return snapshot;
  }

  function applyUiSelection(commandOrIntent) {
    latestUiState = uiStateStore.setSelection({
      pointer: commandOrIntent.pointer,
      origin: commandOrIntent.origin ?? null,
    });
    return getSnapshot();
  }

  async function runCoreStep({ method, args = [] } = {}) {
    const coreMethod = core?.[method];
    if (typeof coreMethod !== 'function') {
      throw new Error(`createFormController could not find core method "${method}".`);
    }

    const nextCoreState = await coreMethod(...args);
    latestCoreState = nextCoreState ?? core.getState?.() ?? latestCoreState;
  }

  async function executeCoreOperation(commandOrIntent) {
    const operation = toCoreOperation(commandOrIntent, latestCoreState);
    if (!operation?.steps?.length) return getSnapshot();

    for (const step of operation.steps) {
      await runCoreStep(step);
    }

    return getSnapshot();
  }

  function dispatchDebouncedFieldChange(commandOrIntent) {
    const pointer = commandOrIntent?.pointer;
    const debounceMs = getDebounceMs(commandOrIntent);
    if (!pointer || debounceMs <= 0) {
      return executeCoreOperation(commandOrIntent);
    }

    if (pendingFieldTimers.has(pointer)) {
      const pending = pendingFieldTimers.get(pointer);
      clearTimeout(pending.timer);
      pending.resolve(getSnapshot());
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingFieldTimers.delete(pointer);
        executeCoreOperation(commandOrIntent).then(resolve);
      }, debounceMs);

      pendingFieldTimers.set(pointer, { timer, resolve });
    });
  }

  const unsubscribeCore = core.subscribe((nextCoreState) => {
    latestCoreState = nextCoreState ?? {};
    publish();
  }, { emitCurrent: true });

  const unsubscribeUi = uiStateStore.subscribe((nextUiState) => {
    latestUiState = nextUiState;
    publish();
  }, { emitCurrent: false });

  async function dispatch(commandOrIntent) {
    if (isUiSelectionIntent(commandOrIntent)) {
      return applyUiSelection(commandOrIntent);
    }

    if (isFieldChangeIntent(commandOrIntent)) {
      return dispatchDebouncedFieldChange(commandOrIntent);
    }

    return executeCoreOperation(commandOrIntent);
  }

  return {
    getSnapshot,

    dispatch,

    async handleIntent(intent) {
      return dispatch(intent);
    },

    subscribe(listener, options = {}) {
      const { emitCurrent = true } = options;
      listeners.add(listener);

      if (emitCurrent) {
        listener(getSnapshot());
      }

      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      for (const pending of pendingFieldTimers.values()) {
        clearTimeout(pending.timer);
        pending.resolve(getSnapshot());
      }
      pendingFieldTimers.clear();
      unsubscribeCore?.();
      unsubscribeUi?.();
      uiStateStore.dispose();
      listeners.clear();
      core.dispose?.();
    },
  };
}
