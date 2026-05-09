import { getPointerValue } from '../model/json-pointer.js';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}

function addError(errorsByPointer, pointer, message) {
  if (!pointer || errorsByPointer[pointer]) return;
  errorsByPointer[pointer] = message;
}

function validateRequired({ node, value, errorsByPointer }) {
  if (!node?.required) return;
  if (isEmpty(value)) {
    addError(errorsByPointer, node.pointer, 'This field is required.');
  }
}

function validateEnum({ node, value, errorsByPointer }) {
  if (!Array.isArray(node?.enumValues)) return;
  if (value === undefined || value === null) return;
  if (!node.enumValues.includes(value)) {
    addError(errorsByPointer, node.pointer, 'Value must match one of the allowed options.');
  }
}

function validateString({ node, value, errorsByPointer }) {
  if (value === undefined || value === null) return;

  if (typeof value !== 'string') {
    addError(errorsByPointer, node.pointer, 'Value must be a string.');
    return;
  }

  const { validation = {} } = node;
  if (validation.minLength !== undefined && value.length < validation.minLength) {
    addError(errorsByPointer, node.pointer, `Must be at least ${validation.minLength} characters.`);
    return;
  }

  if (validation.maxLength !== undefined && value.length > validation.maxLength) {
    addError(errorsByPointer, node.pointer, `Must be at most ${validation.maxLength} characters.`);
    return;
  }

  if (validation.pattern !== undefined) {
    let regex;
    try {
      regex = new RegExp(validation.pattern);
    } catch {
      addError(errorsByPointer, node.pointer, 'Schema pattern is invalid.');
      return;
    }

    if (!regex.test(value)) {
      addError(errorsByPointer, node.pointer, 'Value does not match required format.');
    }
  }
}

function validateNumber({ node, value, errorsByPointer }) {
  if (value === undefined || value === null) return;

  if (typeof value !== 'number' || Number.isNaN(value)) {
    addError(errorsByPointer, node.pointer, 'Value must be a number.');
    return;
  }

  if (node.kind === 'integer' && !Number.isInteger(value)) {
    addError(errorsByPointer, node.pointer, 'Value must be an integer.');
    return;
  }

  const { validation = {} } = node;
  if (validation.minimum !== undefined && value < validation.minimum) {
    addError(errorsByPointer, node.pointer, `Must be greater than or equal to ${validation.minimum}.`);
    return;
  }

  if (validation.maximum !== undefined && value > validation.maximum) {
    addError(errorsByPointer, node.pointer, `Must be less than or equal to ${validation.maximum}.`);
    return;
  }

  if (validation.exclusiveMinimum !== undefined && value <= validation.exclusiveMinimum) {
    addError(errorsByPointer, node.pointer, `Must be greater than ${validation.exclusiveMinimum}.`);
    return;
  }

  if (validation.exclusiveMaximum !== undefined && value >= validation.exclusiveMaximum) {
    addError(errorsByPointer, node.pointer, `Must be less than ${validation.exclusiveMaximum}.`);
  }
}

function validateBoolean({ node, value, errorsByPointer }) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'boolean') {
    addError(errorsByPointer, node.pointer, 'Value must be a boolean.');
  }
}

function validateArrayShape({ node, value, errorsByPointer }) {
  if (value === undefined || value === null) return;

  if (!Array.isArray(value)) {
    addError(errorsByPointer, node.pointer, 'Value must be an array.');
    return;
  }

  const minItems = node.minItems ?? node.validation?.minItems;
  const maxItems = node.maxItems ?? node.validation?.maxItems;
  if (minItems !== undefined && value.length < minItems) {
    addError(errorsByPointer, node.pointer, `Must contain at least ${minItems} items.`);
    return;
  }

  if (maxItems !== undefined && value.length > maxItems) {
    addError(errorsByPointer, node.pointer, `Must contain at most ${maxItems} items.`);
  }
}

function validateObjectShape({ node, value, errorsByPointer }) {
  if (value === undefined || value === null) return;
  if (!isObject(value)) {
    addError(errorsByPointer, node.pointer, 'Value must be an object.');
  }
}

function validateNode({ node, errorsByPointer }) {
  if (!node || !node.pointer) return;

  const value = node.sourceValue;

  if (node.kind === 'unsupported') {
    addError(errorsByPointer, node.pointer, 'Schema contains unsupported features at this field.');
    return;
  }

  validateRequired({ node, value, errorsByPointer });

  if (node.kind === 'array') {
    validateArrayShape({ node, value, errorsByPointer });
  } else if (node.kind === 'object') {
    validateObjectShape({ node, value, errorsByPointer });
  } else if (node.kind === 'string') {
    validateString({ node, value, errorsByPointer });
  } else if (node.kind === 'number' || node.kind === 'integer') {
    validateNumber({ node, value, errorsByPointer });
  } else if (node.kind === 'boolean') {
    validateBoolean({ node, value, errorsByPointer });
  }

  validateEnum({ node, value, errorsByPointer });
}

function traverse(node, visitor) {
  if (!node) return;
  visitor(node);

  if (Array.isArray(node.children)) {
    node.children.forEach((child) => traverse(child, visitor));
  }

  if (Array.isArray(node.items)) {
    node.items.forEach((item) => traverse(item, visitor));
  }
}

function toErrorList(errorsByPointer) {
  return Object.entries(errorsByPointer).map(([pointer, message]) => ({
    pointer,
    message,
  }));
}

export function validateDocument({
  schema: _,
  document,
  index,
}) {
  const errorsByPointer = {};
  const root = index?.nodesByPointer?.get('/data');

  // Ensure canonical root pointer still resolves against the latest document state.
  if (root && getPointerValue({ data: document, pointer: root.pointer }) === undefined) {
    addError(errorsByPointer, '/data', 'Document root is missing required data object.');
  }

  traverse(root, (node) => {
    validateNode({ node, errorsByPointer });
  });

  return {
    valid: Object.keys(errorsByPointer).length === 0,
    errorsByPointer,
    errors: toErrorList(errorsByPointer),
  };
}
