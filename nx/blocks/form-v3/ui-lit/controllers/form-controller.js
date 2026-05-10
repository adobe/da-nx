import { createUiStateStore } from '../state/ui-state.js';

export function createFormController({ core }) {
  if (!core) {
    throw new Error('createFormController requires a core instance.');
  }

  const uiStateStore = createUiStateStore();

  let coreState = core.getState?.() ?? {};
  let uiState = uiStateStore.getState();
  let currentState = {
    ...coreState,
    ui: uiState,
  };

  function updateState() {
    currentState = {
      ...coreState,
      ui: uiState,
    };

    return currentState;
  }

  function getState() {
    return currentState;
  }

  function setSelection(pointer, origin = null) {
    uiState = uiStateStore.setSelection({ pointer, origin });
    return updateState();
  }

  async function load(payload) {
    coreState = (await core.load(payload)) ?? core.getState?.() ?? coreState;
    return updateState();
  }

  async function handleUiIntent(intent = {}) {
    switch (intent.type) {
      case 'form-nav-pointer-select':
        return setSelection(intent.pointer, intent.origin ?? null);

      case 'form-field-change':
        coreState = (await core.setFieldValue(intent.pointer, intent.value)) ?? coreState;
        return updateState();

      case 'form-array-add':
        coreState = (await core.addArrayItem(intent.pointer)) ?? coreState;
        return updateState();

      case 'form-array-remove':
        coreState = (await core.removeArrayItem(intent.pointer)) ?? coreState;
        return updateState();

      case 'form-array-reorder':
        coreState =
          (await core.moveArrayItem(
            intent.pointer,
            intent.fromIndex,
            intent.toIndex
          )) ?? coreState;
        return updateState();

      default:
        return getState();
    }
  }

  return {
    getState,
    load,
    handleUiIntent,

    dispose() {
      uiStateStore.dispose?.();
      core.dispose?.();
    },
  };
}