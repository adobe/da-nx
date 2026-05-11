import {
  appendPointer,
  clearValueAt,
  insertValueAt,
  removeValueAt,
  setValueAt,
  valueAt,
} from './pointer.js';
import { deepClone } from './clone.js';

function fallbackEmpty(node) {
  if (!node) return undefined;
  if (Array.isArray(node.enumValues)) return '';
  if (node.kind === 'string') return '';
  if (node.kind === 'boolean') return false;
  if (node.kind === 'array') return [];
  if (node.kind === 'object') return {};
  return undefined;
}

function shouldClear(value) {
  return value === undefined || value === null || value === '';
}

function normalize(value) {
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;
  return value;
}

export function setField({ document, pointer, value, node }) {
  const next = deepClone(document);
  const normalized = normalize(value);

  if (shouldClear(normalized)) {
    const changed = clearValueAt({ data: next, pointer, emptyValue: fallbackEmpty(node) });
    return { document: next, changed };
  }

  const current = valueAt({ data: next, pointer });
  if (Object.is(current, normalized)) {
    return { document: next, changed: false };
  }

  setValueAt({ data: next, pointer, value: normalized });
  return { document: next, changed: true };
}

function buildDefault(definition) {
  if (!definition || typeof definition !== 'object') return undefined;

  if (definition.defaultValue !== undefined) {
    return deepClone(definition.defaultValue);
  }

  if (definition.kind === 'object') {
    const result = {};
    for (const child of definition.children ?? []) {
      const value = buildDefault(child);
      if (value !== undefined) result[child.key] = value;
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
  const current = valueAt({ data: document, pointer });
  if (Array.isArray(current)) return current;
  setValueAt({ data: document, pointer, value: [] });
  return valueAt({ data: document, pointer }) ?? [];
}

export function addItem({ document, pointer, itemDefinition }) {
  const next = deepClone(document);
  const array = ensureArray({ document: next, pointer });
  const item = buildDefault(itemDefinition);
  const insertPointer = appendPointer({ pointer, segment: array.length });
  const changed = insertValueAt({ data: next, pointer: insertPointer, value: item });
  return { document: next, changed };
}

export function insertItem({ document, pointer, itemDefinition }) {
  const next = deepClone(document);
  const item = buildDefault(itemDefinition);
  const changed = insertValueAt({ data: next, pointer, value: item });
  return { document: next, changed };
}

export function removeItem({ document, pointer }) {
  const next = deepClone(document);
  const changed = removeValueAt({ data: next, pointer });
  return { document: next, changed };
}

export function moveItem({ document, pointer, fromIndex, toIndex }) {
  const next = deepClone(document);
  const array = valueAt({ data: next, pointer });
  if (!Array.isArray(array) || fromIndex === toIndex) return { document: next, changed: false };
  const [item] = array.splice(fromIndex, 1);
  array.splice(toIndex, 0, item);
  return { document: next, changed: true };
}
