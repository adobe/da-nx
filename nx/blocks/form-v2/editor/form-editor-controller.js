import { createArrayController } from '../controllers/array.controller.js';
import { createAutosaveController } from '../controllers/autosave.controller.js';
import { createFieldStateController } from '../controllers/field-state.controller.js';
import { validateFormState } from '../services/validation/validation-engine.js';

function getSaveSnapshot(savingStore) {
  return savingStore?.getState?.() ?? { status: 'idle', error: null };
}

export function createFormEditorController({
  formStore,
  selectionStore,
  savingStore,
  path,
}) {
  const listeners = new Set();

  function validate(state) {
    return validateFormState({
      schema: state.schema,
      json: state.json,
      index: state.index,
    });
  }

  const fieldState = createFieldStateController({
    formStore,
    validate,
  });
  const arrayState = createArrayController({
    formStore,
    validate,
  });
  const autosave = createAutosaveController({
    path,
    savingStore,
  });

  function getSnapshot() {
    const state = formStore.getState();
    const selection = selectionStore?.getState?.() ?? { activePointer: '/data' };
    return {
      ...state,
      validation: state.validation,
      activeNavPointer: selection.activePointer,
      saving: getSaveSnapshot(savingStore),
      formStore,
      selectionStore,
      savingStore,
    };
  }

  function notify() {
    const snapshot = getSnapshot();
    for (const listener of listeners) {
      listener(snapshot);
    }
    return snapshot;
  }

  async function persistAfterChange(result) {
    if (!result?.changed) {
      return { changed: false, saved: false, snapshot: getSnapshot() };
    }

    const state = formStore.getState();
    savingStore?.markSaving?.();
    notify();
    const saveResult = await autosave.persist({ json: state.json });
    const snapshot = notify();

    return {
      changed: true,
      saved: !!saveResult?.ok,
      saveResult,
      snapshot,
    };
  }

  async function handleFieldChange({ pointer, value }) {
    const result = fieldState.applyFieldChange({ pointer, value });
    notify();
    return persistAfterChange(result);
  }

  async function handleArrayAdd({ pointer }) {
    const result = arrayState.addItem({ pointer });
    notify();
    return persistAfterChange(result);
  }

  async function handleArrayInsert({ pointer }) {
    const result = arrayState.insertItem({ pointer });
    notify();
    return persistAfterChange(result);
  }

  async function handleArrayRemove({ pointer }) {
    const result = arrayState.removeItem({ pointer });
    notify();
    return persistAfterChange(result);
  }

  async function handleArrayReorder({ pointer, beforePointer }) {
    const result = arrayState.moveItem({ pointer, beforePointer });
    notify();
    return persistAfterChange(result);
  }

  async function handleIntent(detail = {}) {
    switch (detail.type) {
      case 'form-nav-pointer-select': {
        selectionStore?.setActivePointer?.(detail.pointer);
        const snapshot = notify();
        return { changed: false, selectionChanged: true, snapshot };
      }
      case 'form-field-change':
        return handleFieldChange(detail);
      case 'form-array-add':
        return handleArrayAdd(detail);
      case 'form-array-insert':
        return handleArrayInsert(detail);
      case 'form-array-remove':
        return handleArrayRemove(detail);
      case 'form-array-reorder':
        return handleArrayReorder(detail);
      default:
        return { changed: false, ignored: true, snapshot: getSnapshot() };
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    handleIntent,
    handleFieldChange,
    handleArrayAdd,
    handleArrayInsert,
    handleArrayRemove,
    handleArrayReorder,
  };
}
