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

// Mirrors prune() in app/serialize.js: a value is "empty" iff it would be
// stripped from the saved HTML. Keep the two definitions symmetric — defaults
// materialize exactly when the loaded document, after applying the same
// stripping rules, has no surviving content. If serialize.js changes what it
// strips, this must change too.
export function isDataEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0 || value.every(isDataEmpty);
  if (typeof value === 'object') {
    const entries = Object.values(value);
    return entries.length === 0 || entries.every(isDataEmpty);
  }
  return false;
}

// Walk the compiled definition tree and produce a partial document containing
// only keys that carry a real schema default (recursively). Fields without
// defaults stay absent so they get pruned to nothing on save instead of being
// written as empty placeholders. Arrays stay empty — fabricating items is the
// job of mutate.js's `addItem`, not load.
//
// Distinct from mutate.js's `buildDefault`, which seeds a complete shape for a
// new array item (so an input box can render). The two have different jobs and
// stay separate on purpose.
export function materializeDefaults(definition) {
  if (!definition || typeof definition !== 'object') return undefined;
  if (definition.defaultValue !== undefined) {
    return deepClone(definition.defaultValue);
  }
  if (definition.kind === 'object') {
    const result = {};
    for (const child of definition.children ?? []) {
      const value = materializeDefaults(child);
      if (value !== undefined) result[child.key] = value;
    }
    return Object.keys(result).length > 0 ? result : undefined;
  }
  // Booleans get an implicit default of `false`. A checkbox is always in one
  // of two states (checked or unchecked); there is no meaningful "absent."
  // `false` survives `prune()` on save, so the round-trip is stable.
  if (definition.kind === 'boolean') return false;
  return undefined;
}

function emptyState({ document = null, saveStatus = 'idle' } = {}) {
  return {
    document: { values: document },
    model: null,
    validation: { errorsByPointer: {} },
    saveStatus,
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

export function createCore({ path, saveDocument, onChange } = {}) {
  let state = emptyState();
  let definition = null;
  let model = null;
  let editable = false;
  // Single-flight persistence: only one saveDocument call is in flight at a
  // time. Subsequent mutations during a save flip `pending` so we re-save
  // once the in-flight save completes — newer content wins. Prevents an
  // earlier POST from landing after a later one and overwriting it.
  let inFlight = false;
  let pending = false;

  function getState() {
    return state;
  }

  function commitState(next) {
    state = next;
    onChange?.();
  }

  function patchState(partial) {
    commitState({ ...state, ...partial });
  }

  function rebuildModel(nextDocument) {
    const built = buildModel({ definition, document: nextDocument, previousModel: model });
    if (!built?.root) {
      commitState(emptyState({
        document: nextDocument ?? null,
        saveStatus: state.saveStatus,
      }));
      return false;
    }
    model = built;
    const { errorsByPointer } = validateDocument({ document: built.document, model });
    commitState({
      document: { values: built.document },
      model: built,
      validation: { errorsByPointer },
      saveStatus: state.saveStatus,
    });
    return true;
  }

  async function persist() {
    if (typeof saveDocument !== 'function') return;
    if (inFlight) {
      pending = true;
      return;
    }
    inFlight = true;
    // Synchronous transition to 'saving' so the UI reflects "unsaved →
    // in-flight" immediately rather than waiting for the first microtask.
    patchState({ saveStatus: 'saving' });
    try {
      do {
        pending = false;
        let failed = false;
        // Contract: `saveDocument` must not mutate `document`. State is
        // shared by reference; subsequent mutations build new documents via
        // mutate.js, so the reference handed off here is effectively
        // immutable for the duration of the save.
        try {
          const result = await saveDocument({
            path: path ?? '',
            document: state.document?.values,
          });
          if (result && result.error) failed = true;
        } catch {
          failed = true;
        }
        if (failed) {
          patchState({ saveStatus: 'error' });
          return;
        }
      } while (pending);
      patchState({ saveStatus: 'saved' });
    } finally {
      inFlight = false;
    }
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
    // Reset single-flight tracking — a stale in-flight save from a previous
    // document must not bleed into the new load. `inFlight` may still be true
    // while a previous POST settles; that promise will set saveStatus on the
    // state it observes via patchState, but `pending` is cleared so we do not
    // resave the new document just because the previous one was dirty.
    pending = false;

    if (!editable || !definition || !parsed) {
      commitState(emptyState({ document: parsed ?? null }));
      return state;
    }

    // Materialize defaults into `data` if the loaded document is empty under
    // the same rules serialize.js uses to prune on save. After this point the
    // defaults are real values in the document — they will be saved with the
    // first mutation and the renderer needs no special case for them.
    if (isDataEmpty(parsed.data)) {
      const materialized = materializeDefaults(definition);
      if (materialized !== undefined) parsed.data = materialized;
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
