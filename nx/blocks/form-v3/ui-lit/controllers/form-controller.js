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
  const pendingFieldTimers = new Map();

  let latestCoreState = core.getState?.() ?? {};
  let latestUiState = uiStateStore.getState();

  function getSnapshot() {
    return composeSnapshot({
      coreState: latestCoreState,
      uiState: latestUiState,
    });
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

  function handleDebouncedFieldChange(commandOrIntent) {
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

  async function handleIntent(commandOrIntent) {
    if (isUiSelectionIntent(commandOrIntent)) {
      return applyUiSelection(commandOrIntent);
    }

    if (isFieldChangeIntent(commandOrIntent)) {
      return handleDebouncedFieldChange(commandOrIntent);
    }

    return executeCoreOperation(commandOrIntent);
  }

  return {
    getSnapshot,
    syncCoreState(nextCoreState = core.getState?.() ?? {}) {
      latestCoreState = nextCoreState ?? {};
      return getSnapshot();
    },

    handleIntent,

    dispose() {
      for (const pending of pendingFieldTimers.values()) {
        clearTimeout(pending.timer);
        pending.resolve(getSnapshot());
      }
      pendingFieldTimers.clear();
      uiStateStore.dispose();
      core.dispose?.();
    },
  };
}
