import { Validator } from '../../../deps/da-form/dist/index.js';

const DRAFT = '2020-12';
const SHORT_CIRCUIT = false; // Collect all errors, don't stop at first

/**
 * Decode RFC 6901 JSON Pointer segment (~0 → ~, ~1 → /)
 * @param {string} segment - Encoded segment
 * @returns {string}
 */
function decodePointerSegment(segment) {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Convert instanceLocation (JSON Pointer) to form pointer (dot notation).
 * cfworker uses # or / as root; paths like #/items/0/name or /items/0/name.
 * @param {string} instanceLocation - JSON Pointer from cfworker (e.g. #/items/0/name)
 * @returns {string} - Form pointer (e.g. data.items[0].name)
 */
export function jsonPointerToFormPointer(instanceLocation) {
  if (!instanceLocation || instanceLocation === '#' || instanceLocation === '/') {
    return 'data';
  }
  // Strip root prefix (# or #/ or /)
  const pointer = instanceLocation.replace(/^(#\/?|\/)/, '') || '';
  if (!pointer) return 'data';

  const segments = pointer.split('/').map(decodePointerSegment);
  const parts = segments.map((s) => (/^\d+$/.test(s) ? `[${s}]` : s));
  return `data.${parts.join('.').replace(/\.\[/g, '[')}`;
}

/**
 * Normalize form pointer for consistent lookup (data.items.[0].name → data.items[0].name)
 * @param {string} pointer
 * @returns {string}
 */
export function normalizePointer(pointer) {
  return pointer.replace(/\.\[/g, '[');
}

/**
 * Validate data against JSON Schema. Returns all errors (shortCircuit off).
 * For each pointer, keeps only the first error.
 * @param {Object} schema - JSON Schema
 * @param {*} data - Data to validate
 * @returns {{ valid: boolean, errorsByPointer: Map<string, string> }}
 */
export function validateJson(schema, data) {
  if (!schema) {
    return { valid: true, errorsByPointer: new Map() };
  }

  const validator = new Validator(schema, DRAFT, SHORT_CIRCUIT);
  const result = validator.validate(data);

  if (result.valid) {
    return { valid: true, errorsByPointer: new Map() };
  }

  const errorsByPointer = new Map();
  const seenPointers = new Set();

  for (const err of result.errors) {
    const formPointer = normalizePointer(jsonPointerToFormPointer(err.instanceLocation));
    if (!seenPointers.has(formPointer)) {
      seenPointers.add(formPointer);
      errorsByPointer.set(formPointer, err.error);
    }
  }

  return { valid: false, errorsByPointer };
}
