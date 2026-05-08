import { createArrayController } from '../controllers/array.controller.js';
import { createAutosaveController } from '../controllers/autosave.controller.js';
import { createFieldStateController } from '../controllers/field-state.controller.js';
import { getParentPointer } from '../model/json-pointer.js';
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
  const pendingFieldTimers = new Map();

  function getNavPointer(pointer) {
    if (!pointer) return '/data';

    const { index } = formStore.getState();
    let current = pointer;

    while (current) {
      const node = index?.nodesByPointer?.get(current);
      if (!node) {
        current = getParentPointer(current);
      } else if (node.kind === 'object' || node.kind === 'array') {
        return current;
      } else {
        current = getParentPointer(current);
      }
    }

    return '/data';
  }

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
    const applyChange = async () => {
      const result = fieldState.applyFieldChange({ pointer, value });
      notify();
      return persistAfterChange(result);
    };

    return applyChange();
  }

  async function handleFieldChangeDebounced({ pointer, value, debounceMs }) {
    if (!pointer || !debounceMs || debounceMs <= 0) {
      return handleFieldChange({ pointer, value });
    }

    if (pendingFieldTimers.has(pointer)) {
      clearTimeout(pendingFieldTimers.get(pointer).timer);
      pendingFieldTimers.get(pointer).resolve({
        changed: false,
        superseded: true,
        snapshot: getSnapshot(),
      });
    }

    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        pendingFieldTimers.delete(pointer);
        const result = await handleFieldChange({ pointer, value });
        resolve(result);
      }, debounceMs);

      pendingFieldTimers.set(pointer, { timer, resolve });
    });
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
        selectionStore?.setActivePointer?.(getNavPointer(detail.pointer));
        const snapshot = notify();
        return { changed: false, selectionChanged: true, snapshot };
      }
      case 'form-field-change':
        return handleFieldChangeDebounced(detail);
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
    dispose() {
      for (const { timer, resolve } of pendingFieldTimers.values()) {
        clearTimeout(timer);
        resolve({
          changed: false,
          superseded: true,
          disposed: true,
          snapshot: getSnapshot(),
        });
      }
      pendingFieldTimers.clear();
      listeners.clear();
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
