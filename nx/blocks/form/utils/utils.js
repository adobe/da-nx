import { daFetch } from 'https://da.live/blocks/shared/utils.js';
import { append } from './pointer.js';

// -----------------------------------------------------------------------------
// Schema utilities (JSON Schema resolution and traversal)
// -----------------------------------------------------------------------------

/**
 * Resolve schema $ref to its definition.
 * @param {string} ref - $ref string (e.g. "#/$defs/project")
 * @param {Object} schema - Schema with $defs
 * @param {Object} defsSchema - Schema for $defs lookup
 * @returns {Object|undefined}
 */
function resolveRef(ref, schema, defsSchema) {
  if (!ref || !ref.startsWith('#')) return undefined;
  const parts = ref.substring(1).split('/').filter(Boolean);
  const defKey = parts[parts.length - 1];
  let def = schema?.$defs?.[defKey];
  if (!def) def = defsSchema?.$defs?.[defKey];
  return def;
}

/**
 * Inline $ref definitions in schema (merge semantics); recurses items and properties.
 * @param {Object} schema - Schema (may contain $ref)
 * @param {Object|null} [propertySchema=null] - Schema for $defs lookup; when null, uses schema
 * @returns {Object}
 */
export function dereferenceSchema(schema, propertySchema = null) {
  if (!schema || typeof schema !== 'object') return schema;
  const defsSchema = propertySchema ?? schema;
  if (schema.$ref) {
    const def = resolveRef(schema.$ref, schema, defsSchema);
    if (def) return dereferenceSchema({ ...def, ...schema, $ref: undefined }, defsSchema);
    return schema;
  }
  const result = { ...schema };
  if (result.items) result.items = dereferenceSchema(result.items, defsSchema);
  if (result.properties) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([k, v]) => [k, dereferenceSchema(v, defsSchema)]),
    );
  }
  return result;
}

/**
 * Check if property is required in object schema.
 * @param {Object} objectSchema - Resolved object schema
 * @param {string} key - Property key
 * @returns {boolean}
 */
function isPropertyRequired(objectSchema, key) {
  return objectSchema?.required?.includes(key) ?? false;
}

/** Produce annotation fields (title, type, enum, default) from schema. */
function annotateFields(schema, definition, type, fallbackTitle = '') {
  const fields = {
    title: schema?.title ?? definition?.title ?? fallbackTitle,
    type: type || 'string',
  };
  if (Array.isArray(definition?.enum)) fields.enum = definition.enum;
  if (definition && Object.prototype.hasOwnProperty.call(definition, 'default')) {
    fields.default = definition.default;
  }
  return fields;
}

/**
 * Annotate dereferenced array items schema.
 * @param {Object} schema - Dereferenced items schema
 * @param {string} fallbackTitle - Fallback when schema has no title
 * @returns {Object} { title, type, enum?, default?, children? }
 */
function annotateArrayItems(schema, fallbackTitle = '') {
  if (!schema || typeof schema !== 'object') {
    return { title: fallbackTitle, type: 'string' };
  }
  const type = schema?.type ?? 'string';

  const node = { ...annotateFields(schema, schema, type, fallbackTitle) };

  if (type === 'object' && schema?.properties) {
    const childDefinitions = schema.properties;
    const required = new Set(schema.required ?? []);
    node.children = Object.entries(childDefinitions).map(([childKey, childSchema]) => {
      const child = annotateArrayItems(childSchema, '');
      child.key = childKey;
      child.required = required.has(childKey);
      return child;
    });
  } else if (type === 'array') {
    node.children = [];
  }

  return node;
}

/**
 * Annotate dereferenced property schema.
 * @param {Object} schema - Dereferenced schema
 * @returns {Object} { title, type, enum?, items?, default? }
 */
function annotateProperty(schema) {
  const type = schema?.type ?? (schema?.items ? 'array' : undefined) ?? 'string';
  const fields = { ...annotateFields(schema, schema, type, '') };
  if (type === 'array' && schema?.items) {
    fields.items = annotateArrayItems(schema.items, fields.title);
  }
  return fields;
}

// -----------------------------------------------------------------------------
// Persist filter: prune empty values for user-only output
// -----------------------------------------------------------------------------

/** Check if value is empty. */
export function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Prune empty values recursively; keep schema defaults.
 * @param {*} value - Value to prune
 * @returns {*} Pruned value (undefined for empty; empty branches omitted)
 */
export function pruneRecursive(value) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  if (Array.isArray(value)) {
    const filtered = value.map(pruneRecursive).filter((item) => !isEmpty(item));
    return filtered.length === 0 ? undefined : filtered;
  }
  if (typeof value === 'object') {
    const result = {};
    for (const [key, propertyValue] of Object.entries(value)) {
      const filtered = pruneRecursive(propertyValue);
      if (filtered !== undefined && !isEmpty(filtered)) result[key] = filtered;
    }
    return Object.keys(result).length === 0 ? undefined : result;
  }
  return value;
}

// -----------------------------------------------------------------------------
// General utilities
// -----------------------------------------------------------------------------

/** Fetch HTML from source URL. */
export async function loadHtml(details) {
  const resp = await daFetch(details.sourceUrl);
  if (!resp.ok) return { error: 'Could not fetch doc' };
  return { html: (await resp.text()) };
}

/**
 * Build annotated field tree from dereferenced schema and data.
 * @param {string} key - Property key
 * @param {Object} schema - Dereferenced schema
 * @param {*} data - User data at this level (array length; values not stored)
 * @param {string} parentPointer - Parent pointer (e.g. "/data")
 * @param {boolean} required - Whether property is required
 * @returns {Object} { key, pointer, title, type, enum?, items?, required, children? }
 */
export function annotateFromSchema(key, schema, data, parentPointer = '', required = false) {
  const currentPointer = parentPointer ? append(parentPointer, key) : append('', key);
  const schemaType = schema?.type;

  // Array: structure from schema, item count from user data
  if (schemaType === 'array' || (schema?.items && !schemaType)) {
    const itemsSchema = schema.items;
    if (itemsSchema) itemsSchema.title ??= schema.title;

    const itemCount = Array.isArray(data) ? data.length : 0;
    const children = [];

    for (let i = 0; i < itemCount; i += 1) {
      const itemData = data[i];
      const child = annotateFromSchema(
        String(i),
        itemsSchema,
        itemData,
        currentPointer,
        false,
      );
      children.push(child);
    }

    const nodeFields = annotateProperty(schema);
    return { key, pointer: currentPointer, ...nodeFields, required, children };
  }

  // Object: iterate schema.properties (child property map)
  if (schemaType === 'object' || schema?.properties) {
    const childDefinitions = schema?.properties ?? {};
    const children = [];

    for (const [childKey, childSchema] of Object.entries(childDefinitions)) {
      const isRequired = isPropertyRequired(schema, childKey);
      const childValue = data && typeof data === 'object' && childKey in data
        ? data[childKey] : undefined;
      const child = annotateFromSchema(
        childKey,
        childSchema,
        childValue,
        currentPointer,
        isRequired,
      );
      children.push(child);
    }

    const nodeFields = annotateProperty(schema);
    return { key, pointer: currentPointer, ...nodeFields, required, children };
  }

  // Primitive: no value stored; use getValue(data, pointer) at render time
  return {
    key,
    pointer: currentPointer,
    ...annotateProperty(schema),
    required,
  };
}
