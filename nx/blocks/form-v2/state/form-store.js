import { buildRuntimeFormModel } from '../model/form-model-builder.js';
import { createFormModelIndex } from '../model/form-model-index.js';
import { deepClone } from '../utils/clone.js';

function emptyValidation() {
  return {
    valid: true,
    errorsByPointer: new Map(),
    errors: [],
  };
}

function buildRuntimeAndIndex({
  definition,
  json,
  previousRuntime,
}) {
  const runtime = buildRuntimeFormModel({
    definition,
    json,
    previousRuntime,
  });

  const index = createFormModelIndex({ root: runtime?.root });
  return { runtime, index };
}

export function createFormStore({
  schema,
  definition,
  json,
  runtime = null,
  index = null,
}) {
  const initialJson = deepClone(json);
  const built = runtime && index
    ? { runtime, index }
    : buildRuntimeAndIndex({ definition, json: initialJson, previousRuntime: null });

  let state = {
    schema,
    definition,
    json: initialJson,
    runtime: built.runtime,
    index: built.index,
    validation: emptyValidation(),
  };

  function replaceJson(nextJson) {
    const cloned = deepClone(nextJson);
    const nextRuntime = buildRuntimeAndIndex({
      definition: state.definition,
      json: cloned,
      previousRuntime: state.runtime,
    });

    state = {
      ...state,
      json: cloned,
      runtime: nextRuntime.runtime,
      index: nextRuntime.index,
    };

    return state;
  }

  return {
    getState() {
      return state;
    },

    getNode(pointer) {
      return state.index?.nodesByPointer?.get(pointer) ?? null;
    },

    setValidation(validation) {
      state = {
        ...state,
        validation: validation ?? emptyValidation(),
      };
      return state;
    },

    replaceJson,

    applyMutation(mutation, payload = {}) {
      const result = mutation({
        json: state.json,
        ...payload,
      });

      if (!result?.changed) {
        return { changed: false, state };
      }

      const nextState = replaceJson(result.json);
      return { changed: true, state: nextState };
    },
  };
}
