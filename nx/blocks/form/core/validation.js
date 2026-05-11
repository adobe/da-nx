import { valueAt } from './pointer.js';

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

function addError(errors, pointer, message) {
  if (!pointer || errors[pointer]) return;
  errors[pointer] = message;
}

function validateRequired({ node, value, errors }) {
  if (!node?.required) return;
  if (isEmpty(value)) {
    addError(errors, node.pointer, 'This field is required.');
  }
}

function validateEnum({ node, value, errors }) {
  if (!Array.isArray(node?.enumValues)) return;
  if (value === undefined || value === null) return;
  if (!node.enumValues.includes(value)) {
    addError(errors, node.pointer, 'Value must match one of the allowed options.');
  }
}

function validateString({ node, value, errors }) {
  if (value === undefined || value === null) return;

  if (typeof value !== 'string') {
    addError(errors, node.pointer, 'Value must be a string.');
    return;
  }

  const { validation = {} } = node;
  if (validation.minLength !== undefined && value.length < validation.minLength) {
    addError(errors, node.pointer, `Must be at least ${validation.minLength} characters.`);
    return;
  }

  if (validation.maxLength !== undefined && value.length > validation.maxLength) {
    addError(errors, node.pointer, `Must be at most ${validation.maxLength} characters.`);
    return;
  }

  if (validation.pattern !== undefined) {
    let regex;
    try {
      regex = new RegExp(validation.pattern);
    } catch {
      addError(errors, node.pointer, 'Schema pattern is invalid.');
      return;
    }

    if (!regex.test(value)) {
      addError(errors, node.pointer, 'Value does not match required format.');
    }
  }
}

function validateNumber({ node, value, errors }) {
  if (value === undefined || value === null) return;

  if (typeof value !== 'number' || Number.isNaN(value)) {
    addError(errors, node.pointer, 'Value must be a number.');
    return;
  }

  if (node.kind === 'integer' && !Number.isInteger(value)) {
    addError(errors, node.pointer, 'Value must be an integer.');
    return;
  }

  const { validation = {} } = node;
  if (validation.minimum !== undefined && value < validation.minimum) {
    addError(errors, node.pointer, `Must be greater than or equal to ${validation.minimum}.`);
    return;
  }

  if (validation.maximum !== undefined && value > validation.maximum) {
    addError(errors, node.pointer, `Must be less than or equal to ${validation.maximum}.`);
    return;
  }

  if (validation.exclusiveMinimum !== undefined && value <= validation.exclusiveMinimum) {
    addError(errors, node.pointer, `Must be greater than ${validation.exclusiveMinimum}.`);
    return;
  }

  if (validation.exclusiveMaximum !== undefined && value >= validation.exclusiveMaximum) {
    addError(errors, node.pointer, `Must be less than ${validation.exclusiveMaximum}.`);
  }
}

function validateBoolean({ node, value, errors }) {
  if (value === undefined || value === null) return;
  if (typeof value !== 'boolean') {
    addError(errors, node.pointer, 'Value must be a boolean.');
  }
}

function validateArray({ node, value, errors }) {
  if (value === undefined || value === null) return;

  if (!Array.isArray(value)) {
    addError(errors, node.pointer, 'Value must be an array.');
    return;
  }

  const minItems = node.minItems ?? node.validation?.minItems;
  const maxItems = node.maxItems ?? node.validation?.maxItems;
  if (minItems !== undefined && value.length < minItems) {
    addError(errors, node.pointer, `Must contain at least ${minItems} items.`);
    return;
  }
  if (maxItems !== undefined && value.length > maxItems) {
    addError(errors, node.pointer, `Must contain at most ${maxItems} items.`);
  }
}

function validateObjectShape({ node, value, errors }) {
  if (value === undefined || value === null) return;
  if (!isObject(value)) {
    addError(errors, node.pointer, 'Value must be an object.');
  }
}

function validateNode({ node, errors }) {
  if (!node || !node.pointer) return;
  const { value } = node;

  if (node.kind === 'unsupported') {
    addError(errors, node.pointer, 'Schema contains unsupported features at this field.');
    return;
  }

  validateRequired({ node, value, errors });

  if (node.kind === 'array') validateArray({ node, value, errors });
  else if (node.kind === 'object') validateObjectShape({ node, value, errors });
  else if (node.kind === 'string') validateString({ node, value, errors });
  else if (node.kind === 'number' || node.kind === 'integer') validateNumber({ node, value, errors });
  else if (node.kind === 'boolean') validateBoolean({ node, value, errors });

  validateEnum({ node, value, errors });
}

function traverse(node, visit) {
  if (!node) return;
  visit(node);
  if (Array.isArray(node.children)) node.children.forEach((c) => traverse(c, visit));
  if (Array.isArray(node.items)) node.items.forEach((c) => traverse(c, visit));
}

export function validateDocument({ document, model }) {
  const errorsByPointer = {};
  const root = model?.root;

  if (root && valueAt({ data: document, pointer: root.pointer }) === undefined) {
    addError(errorsByPointer, '/data', 'Document root is missing required data object.');
  }

  traverse(root, (node) => validateNode({ node, errors: errorsByPointer }));

  return { errorsByPointer };
}
