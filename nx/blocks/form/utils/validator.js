import { Validator } from '../../../deps/da-form/dist/index.js';
import { getValueByPointer } from './pointer.js';
import { isEmpty } from './utils.js';

const DRAFT = '2020-12';
const SHORT_CIRCUIT = false; // Collect all errors, don't stop at first

/**
 * Map validation error path to form pointer. Validation uses paths like #/items/0/name
 * (relative to the data root); the form uses /data/items/0/name because data is at /data.
 * @param {string} instancePath - Path from validation (e.g. #/items/0/name)
 * @returns {string} - Form data pointer (e.g. /data/items/0/name)
 */
function toFormDataPointer(instancePath) {
  const loc = (instancePath || '').replace(/^#\/?/, '/');
  return loc === '/' ? '/data' : `/data${loc}`;
}

/**
 * Schema validation: validate data against JSON Schema.
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
 * Add errors for required fields that are empty.
 * Uses dataRoot + pointer as the source of truth for values.
 * @param {Object} node - Field node from annotateFromSchema (pointer, required, children)
 * @param {Map<string, string>} errorsByPointer - Map to add errors to
 * @param {Object} dataRoot - Object with data so pointer /data/quantity resolves
 */
export function validateRequiredEmpty(node, errorsByPointer, dataRoot) {
  if (!node || !dataRoot) return;
  const value = getValueByPointer(dataRoot, node.pointer);
  if (node.required && isEmpty(value) && !errorsByPointer.has(node.pointer)) {
    errorsByPointer.set(node.pointer, 'This field is required.');
  }
  if (Array.isArray(node.children)) {
    node.children.forEach((child) => validateRequiredEmpty(child, errorsByPointer, dataRoot));
  }
}

/**
 * Full validation: schema + custom. For each pointer, keeps only the first error.
 * @param {Object} schema - JSON Schema
 * @param {*} data - Data to validate
 * @param {Object} annotated - Field tree from annotateFromSchema (pointer, required, children)
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
