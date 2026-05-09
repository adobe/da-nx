import {
  clearPointerValue,
  getPointerValue,
  setPointerValue,
} from '../model/json-pointer.js';

function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeValue(value) {
  if (typeof value === 'number' && Number.isNaN(value)) return undefined;
  return value;
}

function fallbackEmptyValue(node) {
  if (!node) return undefined;

  if (Array.isArray(node.enumValues)) return '';
  if (node.kind === 'string') return '';
  if (node.kind === 'boolean') return false;
  if (node.kind === 'array') return [];
  if (node.kind === 'object') return {};
  return undefined;
}

function shouldClearValue(value) {
  return value === undefined || value === null || value === '';
}

export function applyFieldChange({
  document,
  pointer,
  value,
  node,
}) {
  const nextDocument = deepClone(document);
  const normalized = normalizeValue(value);

  if (shouldClearValue(normalized)) {
    const changed = clearPointerValue({
      data: nextDocument,
      pointer,
      emptyValue: fallbackEmptyValue(node),
    });
    return { document: nextDocument, changed };
  }

  const currentValue = getPointerValue({ data: nextDocument, pointer });
  if (Object.is(currentValue, normalized)) {
    return { document: nextDocument, changed: false };
  }

  setPointerValue({ data: nextDocument, pointer, value: normalized });
  return { document: nextDocument, changed: true };
}
