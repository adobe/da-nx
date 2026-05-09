import { evaluatePermissions } from './authorization/authorization-service.js';
import { addArrayItem, insertArrayItem, moveArrayItem, removeArrayItem } from './mutation/array-mutator.js';
import { applyFieldChange } from './mutation/value-mutator.js';
import { findDefinitionByPointer } from './model/definition-pointer.js';
import { getParentPointer } from './model/json-pointer.js';
import { buildRuntimeFormModel } from './model/runtime-model-builder.js';
import { createRuntimeModelIndex, findNodeByPointer } from './model/runtime-model-index.js';
import { createPersistenceService } from './persistence/persistence-service.js';
import { compileSchema } from './schema/schema-compiler.js';
import { createInitialState, createStateStore } from './state/state-store.js';
import { validateDocument } from './validation/validation-engine.js';

function nowIso() {
  return new Date().toISOString();
}

function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeDocument(document) {
  const candidate = document && typeof document === 'object'
    ? deepClone(document)
    : {};

  const metadata = candidate.metadata && typeof candidate.metadata === 'object' && !Array.isArray(candidate.metadata)
    ? candidate.metadata
    : {};
  const data = candidate.data && typeof candidate.data === 'object' && !Array.isArray(candidate.data)
    ? candidate.data
    : {};

  return {
    ...candidate,
    metadata,
    data,
  };
}

function createLoading(status) {
  return {
    status,
    updatedAt: nowIso(),
  };
}

function createSaving(status, error = null) {
  return {
    status,
    error,
    updatedAt: nowIso(),
  };
}

function getCompatibility(compilation) {
  if (!compilation?.schema || !compilation?.definition) {
    return {
      status: 'schema-unsupported',
      editable: false,
      unsupportedFeatures: compilation?.unsupported?.issues ?? [],
    };
  }

  if (compilation?.unsupported?.hasUnsupportedCombinators) {
    return {
      status: 'schema-unsupported',
      editable: false,
      unsupportedFeatures: compilation.unsupported.issues ?? [],
    };
  }

  return {
    status: 'compatible',
    editable: true,
    unsupportedFeatures: [],
  };
}

function createCommandResult(type, patch = {}) {
  return {
    type,
    at: nowIso(),
    ...patch,
  };
}

export function createFormCore({
  path,
  saveDocument,
} = {}) {
  const listeners = new Set();
  const stateStore = createStateStore(createInitialState());
  const persistence = createPersistenceService({ saveDocument });

  const internal = {
    path: path ?? '',
    schema: null,
    definition: null,
    runtime: null,
    index: null,
  };

  function getState() {
    return stateStore.getState();
  }

  function emit() {
    const snapshot = getState();
    for (const listener of listeners) {
      listener(snapshot);
    }
    return snapshot;
  }

  function rejectMutation(type, reason) {
    stateStore.patchState({
      lastCommandResult: createCommandResult(type, { changed: false, reason }),
    });
    return emit();
  }

  function isMutationAllowed(type) {
    const state = getState();
    if (state.permissions.readonly || state.permissions.disabled) {
      rejectMutation(type, 'permission-denied');
      return false;
    }

    if (state.compatibility.status !== 'compatible') {
      rejectMutation(type, 'document-incompatible');
      return false;
    }

    if (!internal.definition) {
      rejectMutation(type, 'missing-definition');
      return false;
    }

    return true;
  }

  function applyRuntimeFromDocument({ nextDocument, commandType }) {
    const runtime = buildRuntimeFormModel({
      definition: internal.definition,
      document: nextDocument,
      previousRuntime: internal.runtime,
    });
    if (!runtime?.root) {
      stateStore.patchState({
        compatibility: {
          status: 'document-incompatible',
          editable: false,
          unsupportedFeatures: [],
        },
        lastCommandResult: createCommandResult(commandType, {
          changed: false,
          reason: 'document-incompatible',
        }),
      });
      emit();
      return false;
    }

    const index = createRuntimeModelIndex({ root: runtime.root });
    const validation = validateDocument({
      schema: internal.schema,
      document: runtime.document,
      index,
    });

    internal.runtime = runtime;
    internal.index = index;

    stateStore.patchState({
      formModel: runtime.root,
      values: runtime.document,
      errors: validation.errors,
      errorsByPointer: validation.errorsByPointer,
      compatibility: {
        ...getState().compatibility,
        status: 'compatible',
        editable: true,
      },
    });

    return true;
  }

  async function persistCurrent(commandType) {
    const currentState = getState();
    stateStore.patchState({
      saving: createSaving('saving'),
      lastPersistenceError: null,
    });
    emit();

    const result = await persistence.persist({
      path: internal.path,
      document: currentState.values,
    });

    if (result.ok) {
      stateStore.patchState({
        saving: createSaving('saved'),
        lastPersistenceError: null,
        lastCommandResult: createCommandResult(commandType, {
          changed: true,
          persisted: true,
        }),
      });
      emit();
      return { ok: true };
    }

    stateStore.patchState({
      saving: createSaving('failed', result.error ?? 'Persistence failed.'),
      lastPersistenceError: {
        message: result.error ?? 'Persistence failed.',
        status: result.status ?? null,
        at: nowIso(),
      },
      lastCommandResult: createCommandResult(commandType, {
        changed: true,
        persisted: false,
        error: result.error ?? 'Persistence failed.',
      }),
    });
    emit();

    return {
      ok: false,
      error: result.error ?? 'Persistence failed.',
      status: result.status,
    };
  }

  function canAddItem(arrayDefinition, arrayNode) {
    if (!arrayDefinition || arrayDefinition.kind !== 'array') return false;
    if (!arrayNode || arrayNode.kind !== 'array') return false;
    if (arrayDefinition.readonly) return false;

    const itemCount = arrayNode.items?.length ?? 0;
    const { maxItems } = arrayDefinition;
    if (maxItems !== undefined && itemCount >= maxItems) {
      return false;
    }

    return true;
  }

  function canRemoveItem(arrayDefinition, arrayNode) {
    if (!arrayDefinition || arrayDefinition.kind !== 'array') return false;
    if (!arrayNode || arrayNode.kind !== 'array') return false;
    if (arrayDefinition.readonly) return false;

    const itemCount = arrayNode.items?.length ?? 0;
    const { minItems = 0 } = arrayDefinition;
    return itemCount > minItems;
  }

  function canReorderItem(arrayDefinition, arrayNode) {
    if (!arrayDefinition || arrayDefinition.kind !== 'array') return false;
    if (!arrayNode || arrayNode.kind !== 'array') return false;
    if (arrayDefinition.readonly) return false;

    const itemCount = arrayNode.items?.length ?? 0;
    return itemCount > 1;
  }

  async function applyMutationAndPersist({ commandType, mutationResult }) {
    if (!mutationResult?.changed) {
      stateStore.patchState({
        lastCommandResult: createCommandResult(commandType, { changed: false }),
      });
      return emit();
    }

    const applied = applyRuntimeFromDocument({
      nextDocument: mutationResult.document,
      commandType,
    });
    if (!applied) {
      return getState();
    }

    emit();
    await persistCurrent(commandType);
    return getState();
  }

  async function load({
    schema,
    document,
    permissions,
  }) {
    stateStore.patchState({
      loading: createLoading('loading'),
      lastCommandResult: createCommandResult('core.load', { started: true }),
    });
    emit();

    const permissionState = evaluatePermissions({ permissions });
    const compilation = compileSchema({ schema });
    const compatibility = getCompatibility(compilation);
    const normalizedDocument = normalizeDocument(document);

    internal.schema = compilation.schema;
    internal.definition = compilation.definition;

    const nextPatch = {
      loading: createLoading('ready'),
      permissions: permissionState,
      compatibility,
      selection: {
        activePointer: '/data',
        origin: null,
      },
      saving: createSaving('idle'),
      lastPersistenceError: null,
      lastCommandResult: createCommandResult('core.load', {
        started: false,
        ready: compatibility.editable,
      }),
    };

    if (!compatibility.editable || !internal.definition) {
      internal.runtime = null;
      internal.index = null;
      stateStore.patchState({
        ...nextPatch,
        formModel: null,
        values: normalizedDocument,
        errors: [],
        errorsByPointer: {},
      });
      return emit();
    }

    const runtime = buildRuntimeFormModel({
      definition: internal.definition,
      document: normalizedDocument,
      previousRuntime: null,
    });

    if (!runtime?.root) {
      internal.runtime = null;
      internal.index = null;
      stateStore.patchState({
        ...nextPatch,
        compatibility: {
          status: 'document-incompatible',
          editable: false,
          unsupportedFeatures: [],
        },
        formModel: null,
        values: normalizedDocument,
        errors: [],
        errorsByPointer: {},
      });
      return emit();
    }

    internal.runtime = runtime;
    internal.index = createRuntimeModelIndex({ root: runtime.root });

    const validation = validateDocument({
      schema: internal.schema,
      document: runtime.document,
      index: internal.index,
    });

    stateStore.patchState({
      ...nextPatch,
      formModel: runtime.root,
      values: runtime.document,
      errors: validation.errors,
      errorsByPointer: validation.errorsByPointer,
      compatibility: {
        ...compatibility,
        editable: compatibility.editable && !permissionState.readonly,
      },
    });

    return emit();
  }

  async function changeField({ pointer, value }) {
    const commandType = 'field.change';
    if (!isMutationAllowed(commandType)) return getState();

    const node = findNodeByPointer({
      index: internal.index,
      pointer,
    });
    if (node?.readonly) {
      return rejectMutation(commandType, 'readonly-field');
    }

    return applyMutationAndPersist({
      commandType,
      mutationResult: applyFieldChange({
        document: getState().values,
        pointer,
        value,
        node,
      }),
    });
  }

  async function arrayAdd({ pointer }) {
    const commandType = 'array.add';
    if (!isMutationAllowed(commandType)) return getState();

    const arrayDefinition = findDefinitionByPointer({
      definition: internal.definition,
      pointer,
    });
    const arrayNode = findNodeByPointer({ index: internal.index, pointer });
    if (!canAddItem(arrayDefinition, arrayNode)) {
      return rejectMutation(commandType, 'array-add-not-allowed');
    }

    return applyMutationAndPersist({
      commandType,
      mutationResult: addArrayItem({
        document: getState().values,
        pointer,
        itemDefinition: arrayDefinition.item,
      }),
    });
  }

  async function arrayInsert({ pointer }) {
    const commandType = 'array.insert';
    if (!isMutationAllowed(commandType)) return getState();

    const parentPointer = getParentPointer(pointer);
    const arrayDefinition = findDefinitionByPointer({
      definition: internal.definition,
      pointer: parentPointer,
    });
    const arrayNode = findNodeByPointer({ index: internal.index, pointer: parentPointer });
    if (!canAddItem(arrayDefinition, arrayNode)) {
      return rejectMutation(commandType, 'array-insert-not-allowed');
    }

    return applyMutationAndPersist({
      commandType,
      mutationResult: insertArrayItem({
        document: getState().values,
        pointer,
        itemDefinition: arrayDefinition.item,
      }),
    });
  }

  async function arrayRemove({ pointer }) {
    const commandType = 'array.remove';
    if (!isMutationAllowed(commandType)) return getState();

    const parentPointer = getParentPointer(pointer);
    const arrayDefinition = findDefinitionByPointer({
      definition: internal.definition,
      pointer: parentPointer,
    });
    const arrayNode = findNodeByPointer({ index: internal.index, pointer: parentPointer });
    if (!canRemoveItem(arrayDefinition, arrayNode)) {
      return rejectMutation(commandType, 'array-remove-not-allowed');
    }

    return applyMutationAndPersist({
      commandType,
      mutationResult: removeArrayItem({
        document: getState().values,
        pointer,
      }),
    });
  }

  async function arrayMove({ pointer, beforePointer }) {
    const commandType = 'array.move';
    if (!isMutationAllowed(commandType)) return getState();

    const parentPointer = getParentPointer(pointer);
    const arrayDefinition = findDefinitionByPointer({
      definition: internal.definition,
      pointer: parentPointer,
    });
    const arrayNode = findNodeByPointer({ index: internal.index, pointer: parentPointer });
    if (!canReorderItem(arrayDefinition, arrayNode)) {
      return rejectMutation(commandType, 'array-move-not-allowed');
    }

    return applyMutationAndPersist({
      commandType,
      mutationResult: moveArrayItem({
        document: getState().values,
        pointer,
        beforePointer,
      }),
    });
  }

  function setSelection({ pointer, origin = null }) {
    if (!pointer || pointer === getState().selection.activePointer) {
      return getState();
    }

    stateStore.patchState({
      selection: {
        activePointer: pointer,
        origin,
      },
      lastCommandResult: createCommandResult('selection.change', { changed: true }),
    });
    return emit();
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function dispose() {
    listeners.clear();
  }

  return {
    load,
    getState,
    subscribe,
    dispose,
    changeField,
    arrayAdd,
    arrayInsert,
    arrayRemove,
    arrayMove,
    setSelection,
  };
}
