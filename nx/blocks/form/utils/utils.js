import { daFetch } from 'https://da.live/blocks/shared/utils.js';
import { append } from './pointer.js';

// -----------------------------------------------------------------------------
// Schema utilities (JSON Schema resolution and traversal)
// -----------------------------------------------------------------------------

/**
 * Resolves a schema $ref to its definition.
 * @param {string} ref - The $ref string (e.g. "#/$defs/project")
 * @param {Object} schema - Schema containing $defs (local or full)
 * @param {Object} fullSchema - The full schema for resolving $defs
 * @returns {Object|undefined} The resolved definition or undefined
 */
function resolveRef(ref, schema, fullSchema) {
  if (!ref || !ref.startsWith('#')) return undefined;
  const parts = ref.substring(1).split('/').filter(Boolean);
  const defKey = parts[parts.length - 1];
  let def = schema?.$defs?.[defKey];
  if (!def) def = fullSchema?.$defs?.[defKey];
  return def;
}

/**
 * Recursively resolves $ref in schema objects (items, properties, etc.)
 * so the output schema contains inline definitions instead of references.
 * @param {Object} schema - Schema object that may contain $ref or nested refs
 * @param {Object} fullSchema - The full schema for resolving $defs
 * @returns {Object} Schema with all $refs resolved
 */
export function resolveRefsDeep(schema, fullSchema) {
  if (!schema || typeof schema !== 'object') return schema;
  if (schema.$ref) {
    const def = resolveRef(schema.$ref, schema, fullSchema);
    if (def) return resolveRefsDeep({ ...def, ...schema, $ref: undefined }, fullSchema);
    return schema;
  }
  const result = { ...schema };
  if (result.items) result.items = resolveRefsDeep(result.items, fullSchema);
  if (result.properties) {
    result.properties = Object.fromEntries(
      Object.entries(result.properties).map(([k, v]) => [k, resolveRefsDeep(v, fullSchema)]),
    );
  }
  return result;
}

/**
 * Resolves a property schema, handling $ref and normalizing output.
 * @param {Object} localSchema - The property schema (may contain $ref)
 * @param {Object} fullSchema - The full schema for resolving $defs
 * @returns {Object} { title, properties } — properties is the resolved schema
 */
export function resolvePropSchema(localSchema, fullSchema) {
  const { title } = localSchema ?? {};
  const resolved = resolveRefsDeep(localSchema, fullSchema);
  return { title, properties: resolved };
}

/**
 * Whether a property is required in an object schema.
 * @param {Object} objectSchema - Resolved object schema with optional required array
 * @param {string} key - Property key
 * @returns {boolean}
 */
function isPropertyRequired(objectSchema, key) {
  return objectSchema?.required?.includes(key) ?? false;
}

/**
 * Returns the schema type (object, array, string, etc.).
 * @param {Object} schema - Schema (may contain $ref)
 * @param {Object} fullSchema - The full schema for resolving $defs
 * @returns {string|undefined} The type or undefined
 */
export function getSchemaType(schema, fullSchema) {
  const resolved = resolveRefsDeep(schema, fullSchema);
  return resolved?.type;
}

/** Extract title, type, enum, default. Shared by itemsSchemaToNode and propSchemaToNodeFields. */
function schemaToBaseFields(resolved, props, type, fallbackTitle = '') {
  const fields = {
    title: resolved?.title ?? props?.title ?? fallbackTitle,
    type: type || 'string',
  };
  if (Array.isArray(props?.enum)) fields.enum = props.enum;
  if (props && Object.prototype.hasOwnProperty.call(props, 'default')) {
    fields.default = props.default;
  }
  return fields;
}

/**
 * Convert items schema to node (children not properties).
 * @param {Object} itemsSchema - Schema for array items (may have $ref)
 * @param {Object} fullSchema - Full schema for $ref resolution
 * @param {string} fallbackTitle - Title when schema has none
 * @returns {Object} { title, type, enum?, default?, children? }
 */
function itemsSchemaToNode(itemsSchema, fullSchema, fallbackTitle = '') {
  if (!itemsSchema || typeof itemsSchema !== 'object') {
    return { title: fallbackTitle, type: 'string' };
  }
  const resolved = resolvePropSchema(itemsSchema, fullSchema);
  const schemaType = getSchemaType(itemsSchema, fullSchema);
  const props = resolved?.properties ?? resolved;
  const type = schemaType ?? props?.type ?? 'string';

  const node = { ...schemaToBaseFields(resolved, props, type, fallbackTitle) };

  if (type === 'object' && props?.properties) {
    const childProps = props.properties;
    const required = new Set(props.required ?? []);
    node.children = Object.entries(childProps).map(([childKey, childSchema]) => {
      const child = itemsSchemaToNode(childSchema, fullSchema, '');
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
 * Convert property schema to node fields (Editor/Sidebar).
 * @param {Object} resolvedSchema - { title, properties } from resolvePropSchema
 * @param {string} schemaType - 'string'|'number'|'integer'|'boolean'|'object'|'array'
 * @param {Object} fullSchema - Full schema for $ref resolution (needed when type is array)
 * @returns {Object} { title, type, enum?, items?, default? }
 */
function propSchemaToNodeFields(resolvedSchema, schemaType, fullSchema) {
  const props = resolvedSchema?.properties ?? resolvedSchema;
  const type = schemaType ?? props?.type;
  const fields = { ...schemaToBaseFields(resolvedSchema, props, type, '') };
  if (type === 'array' && props?.items && fullSchema) {
    fields.items = itemsSchemaToNode(props.items, fullSchema, fields.title);
  }
  return fields;
}

// -----------------------------------------------------------------------------
// Persist filter: prune empty values for user-only output
// -----------------------------------------------------------------------------

export function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Recursively prunes null, undefined, empty strings, empty objects, and empty arrays.
 * For arrays: recurses into each item; drops empty items and returns undefined if result is empty.
 * For objects: recurses into each property; drops empty values and returns
 * undefined if result is empty.
 * Schema defaults (e.g. enum "Planning") are kept — only truly empty values are pruned.
 *
 * @param {*} value - Value to prune (object, array, or primitive)
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

export async function loadHtml(details) {
  const resp = await daFetch(details.sourceUrl);
  if (!resp.ok) return { error: 'Could not fetch doc' };
  return { html: (await resp.text()) };
}

/**
 * Annotated field tree from schema + data.
 *
 * @param {string} key - Property key
 * @param {Object} propSchema - Schema for this property
 * @param {Object} fullSchema - Full schema for $ref resolution
 * @param {*} userData - User data at this level (for array length; values not stored)
 * @param {string} parentPointer - Parent pointer (e.g. "/data")
 * @param {boolean} required - Whether property is required
 * @returns {Object} { key, pointer, title, type, enum?, items?, required, children? }
 */
export function annotateFromSchema(key, propSchema, fullSchema, userData, parentPointer = '', required = false) {
  const currentPointer = parentPointer ? append(parentPointer, key) : append('', key);
  const resolvedSchema = resolvePropSchema(propSchema, fullSchema);
  const schemaType = getSchemaType(propSchema, fullSchema);

  // Array: structure from schema, item count from user data
  if (schemaType === 'array' || (propSchema?.items && !schemaType)) {
    const itemsSchema = propSchema.items;
    const resolvedItemsSchema = resolvePropSchema(itemsSchema, fullSchema);
    resolvedItemsSchema.title ??= resolvedSchema.title;

    const itemCount = Array.isArray(userData) ? userData.length : 0;
    const children = [];

    for (let i = 0; i < itemCount; i += 1) {
      const itemData = userData[i];
      const child = annotateFromSchema(
        String(i),
        itemsSchema,
        fullSchema,
        itemData,
        currentPointer,
        false,
      );
      children.push(child);
    }

    const nodeFields = propSchemaToNodeFields(resolvedSchema, schemaType, fullSchema);
    return { key, pointer: currentPointer, ...nodeFields, required, children };
  }

  // Object: iterate schema.properties.properties (child property map)
  if (schemaType === 'object' || resolvedSchema.properties?.properties) {
    const childProps = resolvedSchema.properties?.properties ?? {};
    const children = [];

    for (const [childKey, childSchema] of Object.entries(childProps)) {
      const isRequired = isPropertyRequired(resolvedSchema.properties, childKey);
      const childValue = userData && typeof userData === 'object' && childKey in userData
        ? userData[childKey] : undefined;
      const child = annotateFromSchema(
        childKey,
        childSchema,
        fullSchema,
        childValue,
        currentPointer,
        isRequired,
      );
      children.push(child);
    }

    const nodeFields = propSchemaToNodeFields(resolvedSchema, schemaType, fullSchema);
    return { key, pointer: currentPointer, ...nodeFields, required, children };
  }

  // Primitive: no value stored; use getValueByPointer(json, pointer) at render time
  return {
    key,
    pointer: currentPointer,
    ...propSchemaToNodeFields(resolvedSchema, schemaType, fullSchema),
    required,
  };
}
