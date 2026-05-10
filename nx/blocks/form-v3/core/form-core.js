import {
  addArrayItem as applyAddArrayItem,
  moveArrayItem as applyMoveArrayItem,
  removeArrayItem as applyRemoveArrayItem,
} from './mutation/array-mutator.js';
import { applyFieldChange } from './mutation/value-mutator.js';
import { appendPointer, findDefinitionByPointer, getParentPointer } from './model/json-pointer.js';
import { buildRuntimeFormModel } from './model/runtime-model-builder.js';
import { createRuntimeModelIndex, findNodeByPointer } from './model/runtime-model-index.js';
import { compileSchema } from './schema/schema-compiler.js';
import { createInitialState, createStateStore } from './state/state-store.js';
import { validateDocument } from './validation/validation-engine.js';

function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function parseDocumentInput(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return { ok: false };
  }

  const candidate = deepClone(document);

  if (candidate.metadata === undefined) {
    candidate.metadata = {};
  }

  if (candidate.metadata === null || typeof candidate.metadata !== 'object' || Array.isArray(candidate.metadata)) {
    return { ok: false };
  }

  if (!('data' in candidate)) {
    return { ok: false };
  }

  if (candidate.data === null || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) {
    return { ok: false };
  }

  return {
    ok: true,
    document: candidate,
  };
}

function isCompilationEditable(compilation) {
  if (!compilation?.schema || !compilation?.definition) {
    return false;
  }

  if (compilation?.unsupported?.hasUnsupportedCompositions) {
    return false;
  }

  return true;
}

export function createFormCore({
  path,
  saveDocument,
} = {}) {
  const stateStore = createStateStore(createInitialState());

  const internal = {
    path: path ?? '',
    editable: false,
    schema: null,
    definition: null,
    runtime: null,
    index: null,
    permissions: null,
    save: {
      latestRequested: 0,
      latestAcknowledged: 0,
    },
  };

  function getMutableState() {
    return stateStore.getState();
  }

  function patchState(partial) {
    stateStore.setState({
      ...getMutableState(),
      ...partial,
    });
  }

  function getState() {
    return deepClone(getMutableState());
  }

  function getArrayContext(pointer) {
    return {
      arrayDefinition: findDefinitionByPointer({
        definition: internal.definition,
        pointer,
      }),
      arrayNode: findNodeByPointer({
        index: internal.index,
        pointer,
      }),
    };
  }

  function getParentArrayContext(pointer) {
    const parentPointer = getParentPointer(pointer);
    return {
      parentPointer,
      ...getArrayContext(parentPointer),
    };
  }

  function isMutationAllowed() {
    if (!internal.editable) return false;
    if (!internal.definition || !internal.runtime || !internal.index) return false;
    return true;
  }

  function applyRuntimeFromDocument({ nextDocument }) {
    const runtime = buildRuntimeFormModel({
      definition: internal.definition,
      document: nextDocument,
      previousRuntime: internal.runtime,
    });
    if (!runtime?.root) {
      patchState({
        model: {
          formModel: null,
        },
        document: {
          values: nextDocument ?? null,
        },
        validation: {
          errorsByPointer: {},
        },
      });
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

    patchState({
      model: {
        formModel: runtime.root,
      },
      document: {
        values: runtime.document,
      },
      validation: {
        errorsByPointer: validation.errorsByPointer,
      },
    });

    return true;
  }

  async function persistCurrent() {
    const currentState = getMutableState();
    const sequence = internal.save.latestRequested + 1;
    const documentToPersist = deepClone(currentState.document?.values);
    internal.save.latestRequested = sequence;

    const persistenceResponse = typeof saveDocument === 'function'
      ? await saveDocument({
        path: internal.path,
        document: documentToPersist,
      })
      : { ok: false, error: 'Missing persistence adapter.' };
    const result = persistenceResponse?.ok
      ? { ok: true }
      : {
        ok: false,
        error: persistenceResponse?.error ?? 'Persistence failed.',
        status: persistenceResponse?.status,
      };

    // Ignore stale completion when a newer save sequence has started.
    if (sequence !== internal.save.latestRequested) {
      return {
        ok: false,
        stale: true,
        ignored: true,
        sequence,
      };
    }

    internal.save.latestAcknowledged = sequence;

    if (result.ok) return { ok: true, sequence };

    return {
      ok: false,
      error: result.error ?? 'Persistence failed.',
      status: result.status,
      sequence,
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

  async function applyMutationAndPersist({ mutationResult }) {
    if (!mutationResult?.changed) return getState();

    const applied = applyRuntimeFromDocument({
      nextDocument: mutationResult.document,
    });
    if (!applied) return getState();

    await persistCurrent();
    return getState();
  }

  async function load({
    schema,
    document,
    permissions = null,
  } = {}) {
    internal.permissions = permissions;

    const compilation = compileSchema({ schema });
    const parsedDocument = parseDocumentInput(document);

    internal.editable = isCompilationEditable(compilation);
    internal.schema = compilation.schema;
    internal.definition = compilation.definition;
    internal.runtime = null;
    internal.index = null;
    internal.save.latestRequested = 0;
    internal.save.latestAcknowledged = 0;

    if (!internal.editable || !internal.definition) {
      patchState({
        model: {
          formModel: null,
        },
        document: {
          values: parsedDocument.ok ? parsedDocument.document : null,
        },
        validation: {
          errorsByPointer: {},
        },
      });
      return getState();
    }

    if (!parsedDocument.ok) {
      patchState({
        model: {
          formModel: null,
        },
        document: {
          values: null,
        },
        validation: {
          errorsByPointer: {},
        },
      });
      return getState();
    }

    const normalizedDocument = parsedDocument.document;
    const runtime = buildRuntimeFormModel({
      definition: internal.definition,
      document: normalizedDocument,
      previousRuntime: null,
    });

    if (!runtime?.root) {
      patchState({
        model: {
          formModel: null,
        },
        document: {
          values: normalizedDocument,
        },
        validation: {
          errorsByPointer: {},
        },
      });
      return getState();
    }

    internal.runtime = runtime;
    internal.index = createRuntimeModelIndex({ root: runtime.root });

    const validation = validateDocument({
      schema: internal.schema,
      document: runtime.document,
      index: internal.index,
    });

    patchState({
      model: {
        formModel: runtime.root,
      },
      document: {
        values: runtime.document,
      },
      validation: {
        errorsByPointer: validation.errorsByPointer,
      },
    });
    return getState();
  }

  async function setFieldValue(pointer, value) {
    if (!isMutationAllowed()) return getState();

    const node = findNodeByPointer({
      index: internal.index,
      pointer,
    });
    if (node?.readonly) return getState();

    return applyMutationAndPersist({
      mutationResult: applyFieldChange({
        document: getMutableState().document?.values,
        pointer,
        value,
        node,
      }),
    });
  }

  async function addArrayItem(pointer) {
    if (!isMutationAllowed()) return getState();

    const { arrayDefinition, arrayNode } = getArrayContext(pointer);
    if (!canAddItem(arrayDefinition, arrayNode)) return getState();

    return applyMutationAndPersist({
      mutationResult: applyAddArrayItem({
        document: getMutableState().document?.values,
        pointer,
        itemDefinition: arrayDefinition.item,
      }),
    });
  }

  async function removeArrayItem(pointer) {
    if (!isMutationAllowed()) return getState();

    const { arrayDefinition, arrayNode } = getParentArrayContext(pointer);
    if (!canRemoveItem(arrayDefinition, arrayNode)) return getState();

    return applyMutationAndPersist({
      mutationResult: applyRemoveArrayItem({
        document: getMutableState().document?.values,
        pointer,
      }),
    });
  }

  async function moveArrayItem(pointer, fromIndex, toIndex) {
    if (!isMutationAllowed()) return getState();

    const fromIdx = Number.parseInt(fromIndex, 10);
    const toIdx = Number.parseInt(toIndex, 10);
    if (!Number.isInteger(fromIdx) || fromIdx < 0 || !Number.isInteger(toIdx) || toIdx < 0) {
      return getState();
    }

    const { arrayDefinition, arrayNode } = getArrayContext(pointer);
    if (!canReorderItem(arrayDefinition, arrayNode)) return getState();

    const itemCount = arrayNode?.items?.length ?? 0;
    if (fromIdx >= itemCount) return getState();

    const sourcePointer = appendPointer({ pointer, segment: fromIdx });
    const beforePointer = toIdx >= itemCount ? null : appendPointer({ pointer, segment: toIdx });

    return applyMutationAndPersist({
      mutationResult: applyMoveArrayItem({
        document: getMutableState().document?.values,
        pointer: sourcePointer,
        beforePointer,
      }),
    });
  }

  function dispose() {
    stateStore.dispose();
  }

  return {
    load,
    setFieldValue,
    addArrayItem,
    removeArrayItem,
    moveArrayItem,
    getState,
    dispose,
  };
}
