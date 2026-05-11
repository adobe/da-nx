import {
  getPointerValue,
  insertPointerValueBefore,
  removePointerValue,
  setPointerValue,
} from '../model/json-pointer.js';

function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

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

function ensureArray({ document, pointer }) {
  const current = getPointerValue({ data: document, pointer });
  if (Array.isArray(current)) return current;

  setPointerValue({ data: document, pointer, value: [] });
  return getPointerValue({ data: document, pointer }) ?? [];
}

export function addArrayItem({
  document,
  pointer,
  itemDefinition,
}) {
  const nextDocument = deepClone(document);
  const array = ensureArray({ document: nextDocument, pointer });
  const itemValue = buildDefaultValue(itemDefinition);
  const insertPointer = appendPointer({ pointer, segment: array.length });
  const changed = insertPointerValueBefore({
    data: nextDocument,
    pointer: insertPointer,
    value: itemValue,
  });

  return { document: nextDocument, changed };
}

export function insertArrayItem({
  document,
  pointer,
  itemDefinition,
}) {
  const nextDocument = deepClone(document);
  const itemValue = buildDefaultValue(itemDefinition);
  const changed = insertPointerValueBefore({
    data: nextDocument,
    pointer,
    value: itemValue,
  });

  return { document: nextDocument, changed };
}

export function removeArrayItem({
  document,
  pointer,
}) {
  const nextDocument = deepClone(document);
  const changed = removePointerValue({
    data: nextDocument,
    pointer,
  });

  return { document: nextDocument, changed };
}

export function moveArrayItem({
  document,
  pointer,
  fromIndex,
  toIndex,
}) {
  const nextDocument = deepClone(document);
  const array = getPointerValue({ data: nextDocument, pointer });
  if (!Array.isArray(array) || fromIndex === toIndex) return { document: nextDocument, changed: false };
  const [item] = array.splice(fromIndex, 1);
  array.splice(toIndex, 0, item);
  return { document: nextDocument, changed: true };
}
