const ARRAY_FALLBACK_VALUE = [];

// -----------------------------------------------------------------------------
// generateValue – schema-only value (new doc, new array item)
// -----------------------------------------------------------------------------

function generateObject(node, useSchemaDefaults, generate) {
  const obj = {};
  const children = node.children ?? [];
  for (const child of children) {
    if (child.key != null) {
      const val = generate(child, useSchemaDefaults);
      if (val !== undefined) obj[child.key] = val;
    }
  }
  return obj;
}

/**
 * Generate value from annotated node (no user data).
 * @param {Object} node - Annotated node { type, key?, children?, default? }
 * @param {boolean} [useSchemaDefaults=true] - Apply schema default when true
 * @returns {*} Resolved value (undefined = omit)
 */
export function generateValue(node, useSchemaDefaults = true) {
  if (!node || typeof node !== 'object') return undefined;
  switch (node.type) {
    case 'object':
      return generateObject(node, useSchemaDefaults, generateValue);
    case 'array':
      return ARRAY_FALLBACK_VALUE;
    case 'string':
    case 'number':
    case 'integer':
    case 'boolean':
      return (useSchemaDefaults && node.default !== undefined) ? node.default : undefined;
    default:
      return undefined;
  }
}

// -----------------------------------------------------------------------------
// resolveValue – user data + schema (optionally fill defaults)
// -----------------------------------------------------------------------------

function resolveObject(node, userValue, fillDefaults, resolve) {
  const result = {};
  const children = node.children ?? [];
  for (const child of children) {
    if (child.key != null) {
      const childUserVal = (userValue != null && typeof userValue === 'object' && child.key in userValue)
        ? userValue[child.key] : undefined;
      const val = resolve(child, childUserVal, fillDefaults);
      if (val !== undefined) result[child.key] = val;
    }
  }
  return result;
}

function resolveArray(node, userValue, fillDefaults, resolve) {
  const userArr = Array.isArray(userValue) ? userValue : [];
  return userArr.map((item) => resolve(node.items, item, fillDefaults));
}

function resolvePrimitive(node, userValue, fillDefaults) {
  if (userValue !== undefined) return userValue;
  if (node.required) return generateValue(node, fillDefaults);
  return (fillDefaults && node.default !== undefined) ? node.default : undefined;
}

/**
 * Resolve user data against schema; optionally fill schema defaults.
 * @param {Object} node - Annotated node (object, array, or primitive)
 * @param {*} userValue - User value at this path
 * @param {boolean} [fillDefaults=true] - Fill schema defaults when true
 * @returns {*} Resolved value (undefined = omit key)
 */
export function resolveValue(node, userValue, fillDefaults = true) {
  if (!node || typeof node !== 'object') return userValue ?? undefined;

  const resolve = resolveValue;
  if (node.type === 'object' && Array.isArray(node.children)) {
    return resolveObject(node, userValue, fillDefaults, resolve);
  }
  if (node.type === 'array' && node.items) {
    return resolveArray(node, userValue, fillDefaults, resolve);
  }
  return resolvePrimitive(node, userValue, fillDefaults);
}
