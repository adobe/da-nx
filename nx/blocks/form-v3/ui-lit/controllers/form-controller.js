import { toCoreCommand } from './intent-command-map.js';
import { createUiStateStore } from '../state/ui-state.js';

function isUiSelectionIntent(commandOrIntent) {
  return commandOrIntent?.type === 'form-nav-pointer-select'
    || commandOrIntent?.type === 'selection.change';
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

    await core.dispatch(toCoreCommand(commandOrIntent));
    return getSnapshot();
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
      unsubscribeCore?.();
      unsubscribeUi?.();
      uiStateStore.dispose();
      listeners.clear();
      core.dispose?.();
    },
  };
}
