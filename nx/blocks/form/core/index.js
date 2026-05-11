import { compileSchema } from './schema.js';
import { buildModel, nodeAt } from './model.js';
import { validateDocument } from './validation.js';
import { definitionAt, getParentPointer } from './pointer.js';
import {
  addItem as applyAdd,
  insertItem as applyInsert,
  moveItem as applyMove,
  removeItem as applyRemove,
  setField as applySet,
} from './mutate.js';
import { deepClone } from './clone.js';

function parseDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) return null;

  const next = deepClone(document);
  if (next.metadata === undefined) next.metadata = {};

  if (next.metadata === null || typeof next.metadata !== 'object' || Array.isArray(next.metadata)) {
    return null;
  }
  if (!('data' in next)) return null;
  if (next.data === null || typeof next.data !== 'object' || Array.isArray(next.data)) {
    return null;
  }

  return next;
}

function emptyState({ document = null } = {}) {
  return {
    document: { values: document },
    model: null,
    validation: { errorsByPointer: {} },
  };
}

function canAdd(definition, node) {
  if (!definition || definition.kind !== 'array') return false;
  if (!node || node.kind !== 'array') return false;
  if (definition.readonly) return false;
  const count = node.items?.length ?? 0;
  return definition.maxItems === undefined || count < definition.maxItems;
}

function canRemove(definition, node) {
  if (!definition || definition.kind !== 'array') return false;
  if (!node || node.kind !== 'array') return false;
  if (definition.readonly) return false;
  const count = node.items?.length ?? 0;
  return count > (definition.minItems ?? 0);
}

function canReorder(definition, node) {
  if (!definition || definition.kind !== 'array') return false;
  if (!node || node.kind !== 'array') return false;
  if (definition.readonly) return false;
  return (node.items?.length ?? 0) > 1;
}

export function createCore({ path, saveDocument } = {}) {
  let state = emptyState();
  let definition = null;
  let model = null;
  let editable = false;

  function getState() {
    return state;
  }

  function rebuildModel(nextDocument) {
    const built = buildModel({ definition, document: nextDocument, previousModel: model });
    if (!built?.root) {
      state = emptyState({ document: nextDocument ?? null });
      return false;
    }
    model = built;
    const { errorsByPointer } = validateDocument({ document: built.document, model });
    state = {
      document: { values: built.document },
      model: built,
      validation: { errorsByPointer },
    };
    return true;
  }

  async function persist() {
    if (typeof saveDocument !== 'function') return;
    // Contract: `saveDocument` must not mutate `document`. State is shared by
    // reference; subsequent mutations build new documents via mutate.js, so the
    // reference handed off here is effectively immutable for the duration of
    // the save.
    await saveDocument({
      path: path ?? '',
      document: state.document?.values,
    });
  }

  function commit({ document: nextDocument, changed }) {
    if (!changed) return state;
    if (!rebuildModel(nextDocument)) return state;
    persist();
    return state;
  }

  function canMutate() {
    return editable && definition && model;
  }

  function arrayContext(pointer) {
    return {
      def: definitionAt({ definition, pointer }),
      node: nodeAt({ model, pointer }),
    };
  }

  async function load({ schema, document } = {}) {
    const compiled = compileSchema(schema);
    const parsed = parseDocument(document);

    definition = compiled.definition;
    editable = compiled.editable && !!definition;
    model = null;

    if (!editable || !definition || !parsed) {
      state = emptyState({ document: parsed ?? null });
      return state;
    }

    rebuildModel(parsed);
    return state;
  }

  function setField(pointer, value) {
    if (!canMutate()) return state;
    const node = nodeAt({ model, pointer });
    if (node?.readonly) return state;
    return commit(applySet({
      document: state.document?.values, pointer, value, node,
    }));
  }

  function addItem(pointer) {
    if (!canMutate()) return state;
    const { def, node } = arrayContext(pointer);
    if (!canAdd(def, node)) return state;
    return commit(applyAdd({
      document: state.document?.values, pointer, itemDefinition: def.item,
    }));
  }

  function insertItem(pointer) {
    if (!canMutate()) return state;
    const parentPointer = getParentPointer(pointer);
    const { def, node } = arrayContext(parentPointer);
    if (!canAdd(def, node)) return state;
    return commit(applyInsert({
      document: state.document?.values, pointer, itemDefinition: def.item,
    }));
  }

  function removeItem(pointer) {
    if (!canMutate()) return state;
    const parentPointer = getParentPointer(pointer);
    const { def, node } = arrayContext(parentPointer);
    if (!canRemove(def, node)) return state;
    return commit(applyRemove({ document: state.document?.values, pointer }));
  }

  function moveItem(pointer, fromIndex, toIndex) {
    if (!canMutate()) return state;
    const from = Number.parseInt(fromIndex, 10);
    const to = Number.parseInt(toIndex, 10);
    if (!Number.isInteger(from) || from < 0 || !Number.isInteger(to) || to < 0) return state;

    const { def, node } = arrayContext(pointer);
    if (!canReorder(def, node)) return state;
    if (from >= (node.items?.length ?? 0)) return state;

    return commit(applyMove({
      document: state.document?.values, pointer, fromIndex: from, toIndex: to,
    }));
  }

  return {
    load,
    getState,
    setField,
    addItem,
    insertItem,
    removeItem,
    moveItem,
  };
}
