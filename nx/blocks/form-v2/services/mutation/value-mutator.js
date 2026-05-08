import {
  clearPointerValue,
  getPointerValue,
  setPointerValue,
} from '../../model/json-pointer.js';
import { deepClone } from '../../utils/clone.js';

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
  json,
  pointer,
  value,
  node,
}) {
  const nextJson = deepClone(json);
  const normalized = normalizeValue(value);

  if (shouldClearValue(normalized)) {
    const changed = clearPointerValue({
      data: nextJson,
      pointer,
      emptyValue: fallbackEmptyValue(node),
    });
    return { json: nextJson, changed };
  }

  const currentValue = getPointerValue({ data: nextJson, pointer });
  if (Object.is(currentValue, normalized)) {
    return { json: nextJson, changed: false };
  }

  setPointerValue({ data: nextJson, pointer, value: normalized });
  return { json: nextJson, changed: true };
}
