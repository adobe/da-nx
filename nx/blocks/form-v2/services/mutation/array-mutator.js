import {
  appendPointer,
  getPointerValue,
  insertPointerValueBefore,
  movePointerArrayItemBefore,
  removePointerValue,
  setPointerValue,
} from '../../model/json-pointer.js';
import { deepClone } from '../../utils/clone.js';

function buildDefaultValue(definition) {
  if (!definition || typeof definition !== 'object') return undefined;

  if (definition.defaultValue !== undefined) {
    return deepClone(definition.defaultValue);
  }

  if (definition.kind === 'object') {
    const result = {};
    for (const child of definition.children ?? []) {
      const value = buildDefaultValue(child);
      if (value !== undefined) {
        result[child.key] = value;
      }
    }
    return result;
  }

  if (definition.kind === 'array') return [];
  if (definition.kind === 'boolean') return false;
  if (definition.kind === 'string') return '';
  if (Array.isArray(definition.enumValues)) return '';
  return undefined;
}

function ensureArray({ json, pointer }) {
  const current = getPointerValue({ data: json, pointer });
  if (Array.isArray(current)) return current;

  setPointerValue({ data: json, pointer, value: [] });
  return getPointerValue({ data: json, pointer }) ?? [];
}

export function addArrayItem({
  json,
  pointer,
  itemDefinition,
}) {
  const nextJson = deepClone(json);
  const array = ensureArray({ json: nextJson, pointer });
  const itemValue = buildDefaultValue(itemDefinition);
  const insertPointer = appendPointer({ pointer, segment: array.length });
  const changed = insertPointerValueBefore({
    data: nextJson,
    pointer: insertPointer,
    value: itemValue,
  });

  return { json: nextJson, changed };
}

export function insertArrayItem({
  json,
  pointer,
  itemDefinition,
}) {
  const nextJson = deepClone(json);
  const itemValue = buildDefaultValue(itemDefinition);
  const changed = insertPointerValueBefore({
    data: nextJson,
    pointer,
    value: itemValue,
  });

  return { json: nextJson, changed };
}

export function removeArrayItem({
  json,
  pointer,
}) {
  const nextJson = deepClone(json);
  const changed = removePointerValue({
    data: nextJson,
    pointer,
  });

  return { json: nextJson, changed };
}

export function moveArrayItem({
  json,
  pointer,
  beforePointer,
}) {
  const nextJson = deepClone(json);
  const changed = movePointerArrayItemBefore({
    data: nextJson,
    pointer,
    beforePointer,
  });

  return { json: nextJson, changed };
}
