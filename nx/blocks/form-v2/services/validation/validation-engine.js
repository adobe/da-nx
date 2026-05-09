import { Validator } from '../../../../deps/da-form/dist/index.js';
import { getPointerValue } from '../../model/json-pointer.js';

const DRAFT = '2020-12';
const SHORT_CIRCUIT = false;

function toFormPointer(instancePath) {
  const loc = (instancePath || '').replace(/^#\/?/, '/');
  return loc === '/' ? '/data' : `/data${loc}`;
}

function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function addRequiredErrors({ json, index, errorsByPointer }) {
  if (!index?.nodesByPointer) return;

  for (const node of index.nodesByPointer.values()) {
    if (node?.kind !== 'unsupported' && node?.required && !errorsByPointer.has(node.pointer)) {
      const value = getPointerValue({ data: json, pointer: node.pointer });
      if (isEmpty(value)) {
        errorsByPointer.set(node.pointer, 'This field is required.');
      }
    }
  }
}

function toErrorList(errorsByPointer) {
  return Array.from(errorsByPointer.entries()).map(([pointer, message]) => ({
    pointer,
    message,
  }));
}

export function validateFormState({
  schema,
  json,
  index,
}) {
  const errorsByPointer = new Map();

  if (schema) {
    const validator = new Validator(schema, DRAFT, SHORT_CIRCUIT);
    const result = validator.validate(json?.data ?? {});

    for (const err of result.errors) {
      const pointer = toFormPointer(err.instanceLocation);
      if (!errorsByPointer.has(pointer)) {
        errorsByPointer.set(pointer, err.error);
      }
    }
  }

  addRequiredErrors({ json, index, errorsByPointer });

  return {
    valid: errorsByPointer.size === 0,
    errorsByPointer,
    errors: toErrorList(errorsByPointer),
  };
}
