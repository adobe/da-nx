import { getParentPointer, parsePointer } from '../model/json-pointer.js';
import {
  addArrayItem,
  insertArrayItem,
  moveArrayItem,
  removeArrayItem,
} from '../services/mutation/array-mutator.js';

function findDefinitionByPointer({ definition, pointer }) {
  const segments = parsePointer(pointer);
  if (!segments.length || segments[0] !== 'data') return null;

  let node = definition;
  let i = 1;

  while (i < segments.length) {
    const segment = segments[i];
    if (!node) return null;

    if (node.kind === 'object') {
      node = (node.children ?? []).find((child) => child.key === segment) ?? null;
      i += 1;
      continue;
    }

    if (node.kind === 'array') {
      node = node.item ?? null;
      if (i < segments.length && /^\d+$/.test(segments[i])) {
        i += 1;
      }
      continue;
    }

    return null;
  }

  return node;
}

function revalidate({ formStore, validate }) {
  const validation = validate(formStore.getState());
  formStore.setValidation(validation);
  return validation;
}

export function createArrayController({
  formStore,
  validate,
}) {
  function getDefinition() {
    return formStore.getState().definition;
  }

  function applyWithValidation(mutation, payload) {
    const result = formStore.applyMutation(mutation, payload);
    if (!result.changed) return result;

    const validation = revalidate({ formStore, validate });
    return { ...result, validation };
  }

  return {
    addItem({ pointer }) {
      const arrayDefinition = findDefinitionByPointer({
        definition: getDefinition(),
        pointer,
      });
      if (!arrayDefinition || arrayDefinition.kind !== 'array') {
        return { changed: false, state: formStore.getState() };
      }

      return applyWithValidation(addArrayItem, {
        pointer,
        itemDefinition: arrayDefinition.item,
      });
    },

    insertItem({ pointer }) {
      const parentPointer = getParentPointer(pointer);
      const arrayDefinition = findDefinitionByPointer({
        definition: getDefinition(),
        pointer: parentPointer,
      });
      if (!arrayDefinition || arrayDefinition.kind !== 'array') {
        return { changed: false, state: formStore.getState() };
      }

      return applyWithValidation(insertArrayItem, {
        pointer,
        itemDefinition: arrayDefinition.item,
      });
    },

    removeItem({ pointer }) {
      return applyWithValidation(removeArrayItem, { pointer });
    },

    moveItem({ pointer, beforePointer }) {
      return applyWithValidation(moveArrayItem, { pointer, beforePointer });
    },
  };
}
