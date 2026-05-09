import { getPointerValue } from '../model/json-pointer.js';

function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function addRequiredErrors({ document, index, errorsByPointer }) {
  if (!index?.nodesByPointer) return;

  for (const node of index.nodesByPointer.values()) {
    if (node?.kind !== 'unsupported' && node?.required && !errorsByPointer[node.pointer]) {
      const value = getPointerValue({ data: document, pointer: node.pointer });
      if (isEmpty(value)) {
        errorsByPointer[node.pointer] = 'This field is required.';
      }
    }
  }
}

function toErrorList(errorsByPointer) {
  return Object.entries(errorsByPointer).map(([pointer, message]) => ({
    pointer,
    message,
  }));
}

export function validateDocument({
  schema: _schema,
  document,
  index,
}) {
  const errorsByPointer = {};

  addRequiredErrors({ document, index, errorsByPointer });

  return {
    valid: Object.keys(errorsByPointer).length === 0,
    errorsByPointer,
    errors: toErrorList(errorsByPointer),
  };
}
