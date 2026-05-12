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

function validateString({ node, errors }) {
  const { value } = node;
  if (typeof value !== 'string') {
    addError(errors, node.pointer, 'Must be a string.');
    return;
  }

  if (Array.isArray(node.enumValues) && !node.enumValues.includes(value)) {
    addError(errors, node.pointer, 'Must be one of the allowed options.');
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
      addError(errors, node.pointer, 'Must match the required pattern.');
    }
  }
}

function validateNumber({ node, errors }) {
  const { value } = node;
  if (typeof value !== 'number' || Number.isNaN(value)) {
    addError(errors, node.pointer, 'Must be a number.');
    return;
  }
  if (node.kind === 'integer' && !Number.isInteger(value)) {
    addError(errors, node.pointer, 'Must be an integer.');
    return;
  }

  const { validation = {} } = node;
  if (validation.minimum !== undefined && value < validation.minimum) {
    addError(errors, node.pointer, `Must be greater than or equal to ${validation.minimum}.`);
    return;
  }
  if (validation.maximum !== undefined && value > validation.maximum) {
    addError(errors, node.pointer, `Must be less than or equal to ${validation.maximum}.`);
  }
}

function validateBoolean({ node, errors }) {
  if (typeof node.value !== 'boolean') {
    addError(errors, node.pointer, 'Must be a boolean.');
  }
}

function validateArray({ node, errors }) {
  const { value } = node;
  if (!Array.isArray(value)) {
    addError(errors, node.pointer, 'Must be an array.');
    return;
  }
  if (node.minItems !== undefined && value.length < node.minItems) {
    addError(errors, node.pointer, `Must contain at least ${node.minItems} items.`);
    return;
  }
  if (node.maxItems !== undefined && value.length > node.maxItems) {
    addError(errors, node.pointer, `Must contain at most ${node.maxItems} items.`);
  }
}

function validateNode({ node, errors }) {
  if (!node || !node.pointer) return;
  // Unsupported subtrees are not rendered; values pass through unvalidated.
  if (node.kind === 'unsupported') return;

  if (node.required && isEmpty(node.value)) {
    addError(errors, node.pointer, 'This field is required.');
    return;
  }

  // Form-empty optional values count as absent: constraints (enum, pattern,
  // minLength, etc.) do not fire. This mirrors the save-path stripping in
  // app/serialize.js — what is not saved is not validated.
  if (isEmpty(node.value)) return;

  if (node.kind === 'string') validateString({ node, errors });
  else if (node.kind === 'number' || node.kind === 'integer') validateNumber({ node, errors });
  else if (node.kind === 'boolean') validateBoolean({ node, errors });
  else if (node.kind === 'array') validateArray({ node, errors });
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
  const data = document?.data;

  if (root && data === undefined) {
    addError(errorsByPointer, '/data', 'Document root is missing required data object.');
    return { errorsByPointer };
  }

  traverse(root, (node) => validateNode({ node, errors: errorsByPointer }));

  return { errorsByPointer };
}
