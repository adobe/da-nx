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
import { createStateStream } from './state/state-stream.js';
import { validateDocument } from './validation/validation-engine.js';

function nowIso() {
  return new Date().toISOString();
}

function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function createStatus(code, details = null) {
  return {
    code,
    details,
    updatedAt: nowIso(),
  };
}

function createBlocker({ type, message, details = null }) {
  return {
    type,
    message,
    details,
    at: nowIso(),
  };
}

function parseDocumentInput(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return {
      ok: false,
      blocker: createBlocker({
        type: 'invalid-document',
        message: 'Document payload must be an object.',
      }),
    };
  }

  const candidate = deepClone(document);

  if (candidate.metadata === undefined) {
    candidate.metadata = {};
  }

  if (candidate.metadata === null || typeof candidate.metadata !== 'object' || Array.isArray(candidate.metadata)) {
    return {
      ok: false,
      blocker: createBlocker({
        type: 'invalid-document',
        message: 'Document metadata must be an object when present.',
      }),
    };
  }

  if (!('data' in candidate)) {
    return {
      ok: false,
      blocker: createBlocker({
        type: 'invalid-document',
        message: 'Document payload must include a data object.',
      }),
    };
  }

  if (candidate.data === null || typeof candidate.data !== 'object' || Array.isArray(candidate.data)) {
    return {
      ok: false,
      blocker: createBlocker({
        type: 'invalid-document',
        message: 'Document data must be an object.',
      }),
    };
  }

  return {
    ok: true,
    document: candidate,
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

function statusFromValidation(validation) {
  if ((validation?.errors?.length ?? 0) > 0) {
    return createStatus('validation-error', {
      count: validation.errors.length,
    });
  }

  return createStatus('ready');
}

export function createFormCore({
  path,
  saveDocument,
} = {}) {
  const stateStore = createStateStore(createInitialState());
  const stateStream = createStateStream({
    initialState: stateStore.getState(),
  });
  const persistence = createPersistenceService({ saveDocument });

  const internal = {
    path: path ?? '',
    schema: null,
    definition: null,
    runtime: null,
    index: null,
  };

  function getMutableState() {
    return stateStore.getState();
  }

  function emit() {
    return stateStream.publish(getMutableState());
  }

  function getState() {
    return stateStream.getSnapshot();
  }

  function setStatus({ code, details = null, blockers }) {
    const patch = {
      status: createStatus(code, details),
    };

    if (blockers !== undefined) {
      patch.blockers = blockers;
    }

    stateStore.patchState(patch);
  }

  function compatibilityStatusToCode(compatibilityStatus) {
    if (compatibilityStatus === 'schema-unsupported') return 'schema-unsupported';
    if (compatibilityStatus === 'document-incompatible') return 'document-incompatible';
    if (compatibilityStatus === 'invalid-document') return 'invalid-document';
    if (compatibilityStatus === 'compatible') return 'ready';
    return 'loading';
  }

  function rejectMutation(type, reason) {
    const current = getMutableState();
    if (reason === 'permission-denied') {
      setStatus({
        code: 'permission-denied',
        blockers: [
          createBlocker({
            type: 'permission-denied',
            message: 'Editing is not allowed by current permissions.',
            details: current.permissions,
          }),
        ],
      });
    } else if (
      reason === 'document-incompatible'
      || reason === 'invalid-document'
      || reason === 'schema-unsupported'
      || reason === 'missing-definition'
    ) {
      setStatus({
        code: compatibilityStatusToCode(current.compatibility.status),
      });
    }

    stateStore.patchState({
      lastCommandResult: createCommandResult(type, { changed: false, reason }),
    });
    return emit();
  }

  function isMutationAllowed(type) {
    const state = getMutableState();
    if (state.permissions.readonly || state.permissions.disabled) {
      rejectMutation(type, 'permission-denied');
      return false;
    }

    if (state.compatibility.status !== 'compatible') {
      rejectMutation(type, state.compatibility.status || 'document-incompatible');
      return false;
    }

    if (!internal.definition) {
      rejectMutation(type, 'schema-unsupported');
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
        status: createStatus('document-incompatible'),
        blockers: [
          createBlocker({
            type: 'incompatible-structure',
            message: 'Document structure is incompatible with the compiled form model.',
          }),
        ],
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
      status: statusFromValidation(validation),
      blockers: [],
      formModel: runtime.root,
      values: runtime.document,
      errors: validation.errors,
      errorsByPointer: validation.errorsByPointer,
      compatibility: {
        ...getMutableState().compatibility,
        status: 'compatible',
        editable: true,
      },
    });

    return true;
  }

  async function persistCurrent(commandType) {
    const currentState = getMutableState();
    stateStore.patchState({
      status: createStatus('saving'),
      blockers: [],
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
        status: createStatus('saved'),
        blockers: [],
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
      status: createStatus('persistence-failed', {
        message: result.error ?? 'Persistence failed.',
        status: result.status ?? null,
      }),
      blockers: [
        createBlocker({
          type: 'persistence-failed',
          message: result.error ?? 'Persistence failed.',
          details: { status: result.status ?? null },
        }),
      ],
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
      status: createStatus('loading'),
      blockers: [],
      lastCommandResult: createCommandResult('core.load', { started: true }),
    });
    emit();

    const permissionState = evaluatePermissions({ permissions });
    const compilation = compileSchema({ schema });
    const compatibility = getCompatibility(compilation);
    const parsedDocument = parseDocumentInput(document);

    internal.schema = compilation.schema;
    internal.definition = compilation.definition;
    internal.runtime = null;
    internal.index = null;

    const basePatch = {
      loading: createLoading('ready'),
      permissions: permissionState,
      selection: {
        activePointer: '/data',
        origin: null,
      },
      saving: createSaving('idle'),
      lastPersistenceError: null,
    };

    if (compatibility.status === 'schema-unsupported' || !internal.definition) {
      const unsupportedFeatures = compatibility.unsupportedFeatures ?? [];
      stateStore.patchState({
        ...basePatch,
        status: createStatus('schema-unsupported', {
          unsupportedCount: unsupportedFeatures.length,
        }),
        blockers: [
          createBlocker({
            type: 'schema-unsupported',
            message: 'Schema contains unsupported or incompatible features.',
            details: { unsupportedFeatures },
          }),
        ],
        compatibility: {
          ...compatibility,
          status: 'schema-unsupported',
          editable: false,
        },
        formModel: null,
        values: parsedDocument.ok ? parsedDocument.document : null,
        errors: [],
        errorsByPointer: {},
        lastCommandResult: createCommandResult('core.load', {
          started: false,
          ready: false,
          reason: 'schema-unsupported',
        }),
      });
      return emit();
    }

    if (!parsedDocument.ok) {
      stateStore.patchState({
        ...basePatch,
        status: createStatus('invalid-document'),
        blockers: [parsedDocument.blocker],
        compatibility: {
          status: 'invalid-document',
          editable: false,
          unsupportedFeatures: [],
        },
        formModel: null,
        values: null,
        errors: [],
        errorsByPointer: {},
        lastCommandResult: createCommandResult('core.load', {
          started: false,
          ready: false,
          reason: 'invalid-document',
        }),
      });
      return emit();
    }

    const normalizedDocument = parsedDocument.document;
    const runtime = buildRuntimeFormModel({
      definition: internal.definition,
      document: normalizedDocument,
      previousRuntime: null,
    });

    if (!runtime?.root) {
      stateStore.patchState({
        ...basePatch,
        status: createStatus('document-incompatible'),
        blockers: [
          createBlocker({
            type: 'incompatible-structure',
            message: 'Document structure is incompatible with the compiled form model.',
          }),
        ],
        compatibility: {
          status: 'document-incompatible',
          editable: false,
          unsupportedFeatures: [],
        },
        formModel: null,
        values: normalizedDocument,
        errors: [],
        errorsByPointer: {},
        lastCommandResult: createCommandResult('core.load', {
          started: false,
          ready: false,
          reason: 'document-incompatible',
        }),
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

    const permissionDenied = permissionState.readonly || permissionState.disabled;
    const status = permissionDenied
      ? createStatus('permission-denied')
      : statusFromValidation(validation);
    const blockers = permissionDenied
      ? [
        createBlocker({
          type: 'permission-denied',
          message: 'Editing is not allowed by current permissions.',
          details: permissionState,
        }),
      ]
      : [];

    stateStore.patchState({
      ...basePatch,
      status,
      blockers,
      compatibility: {
        ...compatibility,
        editable: compatibility.editable && !permissionDenied,
      },
      formModel: runtime.root,
      values: runtime.document,
      errors: validation.errors,
      errorsByPointer: validation.errorsByPointer,
      lastCommandResult: createCommandResult('core.load', {
        started: false,
        ready: !permissionDenied,
      }),
    });

    return emit();
  }

  function handleSelectionCommand({ pointer, origin = null, type = 'selection.change' }) {
    if (!pointer || pointer === getMutableState().selection.activePointer) {
      return getState();
    }

    stateStore.patchState({
      selection: {
        activePointer: pointer,
        origin,
      },
      lastCommandResult: createCommandResult(type, { changed: true }),
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
        document: getMutableState().values,
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
        document: getMutableState().values,
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
        document: getMutableState().values,
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
        document: getMutableState().values,
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
        document: getMutableState().values,
        pointer,
        beforePointer,
      }),
    });
  }

  function rejectInvalidCommand(command, reason = 'invalid-command') {
    const type = command?.type ?? 'command.invalid';
    stateStore.patchState({
      lastCommandResult: createCommandResult(type, {
        changed: false,
        ignored: true,
        reason,
      }),
    });
    return emit();
  }

  async function dispatch(command = {}) {
    if (!command || typeof command !== 'object') {
      return rejectInvalidCommand(command, 'command-must-be-object');
    }

    if (!command.type || typeof command.type !== 'string') {
      return rejectInvalidCommand(command, 'command-type-required');
    }

    switch (command.type) {
      case 'field.change':
        return changeField({
          pointer: command.pointer,
          value: command.value,
        });
      case 'array.add':
        return arrayAdd({
          pointer: command.pointer,
        });
      case 'array.insert':
        return arrayInsert({
          pointer: command.pointer,
        });
      case 'array.remove':
        return arrayRemove({
          pointer: command.pointer,
        });
      case 'array.move':
        return arrayMove({
          pointer: command.pointer,
          beforePointer: command.beforePointer,
        });
      case 'selection.change':
        return handleSelectionCommand({
          pointer: command.pointer,
          origin: command.origin ?? null,
          type: command.type,
        });
      default:
        return rejectInvalidCommand(command, 'unknown-command');
    }
  }

  function subscribe(listener, options = {}) {
    return stateStream.subscribe(listener, options);
  }

  function dispose() {
    stateStream.clear();
  }

  return {
    load,
    dispatch,
    getState,
    subscribe,
    dispose,
  };
}
