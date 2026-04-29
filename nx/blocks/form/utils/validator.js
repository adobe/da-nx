import { Validator } from '../../../deps/da-form/dist/index.js';
import { getValue } from './pointer.js';
import { isEmpty } from './utils.js';

const DRAFT = '2020-12';
const SHORT_CIRCUIT = false; // Collect all errors, don't stop at first

/**
 * Map validation path (#/items/0/name) to form pointer (/data/items/0/name).
 * @param {string} instancePath - Validation instance path
 * @returns {string} Form data pointer
 */
function toFormDataPointer(instancePath) {
  const loc = (instancePath || '').replace(/^#\/?/, '/');
  return loc === '/' ? '/data' : `/data${loc}`;
}

/**
 * Validate data against JSON Schema.
 * @param {Object} schema - JSON Schema
 * @param {*} data - Data to validate
 * @returns {{ valid: boolean, errorsByPointer: Map<string, string> }}
 */
export function validateAgainstSchema(schema, data) {
  if (!schema) {
    return { valid: true, errorsByPointer: new Map() };
  }
  const validator = new Validator(schema, DRAFT, SHORT_CIRCUIT);
  const result = validator.validate(data);
  const errorsByPointer = new Map();
  for (const err of result.errors) {
    const pointer = toFormDataPointer(err.instanceLocation);
    if (!errorsByPointer.has(pointer)) {
      errorsByPointer.set(pointer, err.error);
    }
  }
  return { valid: result.valid, errorsByPointer };
}

/**
 * Add errors for required empty fields.
 * @param {Object} node - Field node from annotateFromSchema
 * @param {Map<string, string>} errorsByPointer - Map to add errors to
 * @param {Object} dataRoot - Root object (data at /data)
 */
export function validateRequiredEmpty(node, errorsByPointer, dataRoot) {
  if (!node || !dataRoot) return;
  const value = getValue(dataRoot, node.pointer);
  if (node.required && isEmpty(value) && !errorsByPointer.has(node.pointer)) {
    errorsByPointer.set(node.pointer, 'This field is required.');
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((child) => validateRequiredEmpty(child, errorsByPointer, dataRoot));
  }
}

/**
 * Validate data against schema and required fields; keep first error per pointer.
 * @param {Object} schema - JSON Schema
 * @param {*} data - Data to validate
 * @param {Object} annotated - Field tree from annotateFromSchema
 * @returns {{ valid: boolean, errorsByPointer: Map<string, string> }}
 */
export function validateJson(schema, data, annotated) {
  const { valid, errorsByPointer } = validateAgainstSchema(schema, data);

  if (annotated) {
    const dataRoot = { data };
    validateRequiredEmpty(annotated, errorsByPointer, dataRoot);
  }

  const hasErrors = errorsByPointer.size > 0;
  if (valid && !hasErrors) {
    return { valid: true, errorsByPointer: new Map() };
  }
  return { valid: false, errorsByPointer };
}
