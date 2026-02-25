const STRING_FALLBACK_VALUE = '';
const NUMBER_FALLBACK_VALUE = null;
const BOOLEAN_FALLBACK_VALUE = false;
const ARRAY_FALLBACK_VALUE = [];

function getDefaultValue(node, includeNodeDefaultValue, fallbackValue) {
  const defaultValue = node.default;
  return includeNodeDefaultValue && defaultValue !== undefined ? defaultValue : fallbackValue;
}

/**
 * Generate value from annotated node. All values are written to json (no on-the-fly returns).
 * @param {Object} node - Annotated node: { type, key?, children?, default? }
 * @param {Object} opts - { includeDefaults } Schema default when true, type-based empty when false
 * @param {boolean} includeNodeDefaultValue - Whether to include the node's default value
 * @returns {*} - Value for the node
 */
export function generateValue(node, { includeNodeDefaultValue = true } = {}) {
  if (!node || typeof node !== 'object') return null;
  const { type, children } = node;

  switch (type) {
    case 'object': {
      const obj = {};
      if (Array.isArray(children)) {
        for (const child of children) {
          if (child.key != null) {
            obj[child.key] = generateValue(child, { includeNodeDefaultValue });
          }
        }
      }
      return obj;
    }
    case 'array':
      return ARRAY_FALLBACK_VALUE;
    case 'string':
      return getDefaultValue(node, includeNodeDefaultValue, STRING_FALLBACK_VALUE);
    case 'number':
    case 'integer':
      return getDefaultValue(node, includeNodeDefaultValue, NUMBER_FALLBACK_VALUE);
    case 'boolean':
      return getDefaultValue(node, includeNodeDefaultValue, BOOLEAN_FALLBACK_VALUE);
    default:
      return null;
  }
}

function getChildUserValue(userValue, childKey) {
  return userValue != null && typeof userValue === 'object' && childKey in userValue
    ? userValue[childKey]
    : undefined;
}

function shouldIncludeProperty(val, child) {
  return val !== undefined || child.required;
}

/**
 * Merge user data with schema defaults. User values override; missing keys get default.
 * @param {Object} node - Annotated node (object, array, or primitive)
 * @param {*} userValue - User-provided value at this path
 * @param {boolean} includeNodeDefaultValue - Whether to include the node's default value
 * @returns {*} - Merged value
 */
export function mergeWithDefaults(node, userValue, includeNodeDefaultValue = true) {
  if (!node || typeof node !== 'object') return userValue ?? null;

  const { type, children, items } = node;

  // Object: merge each schema child with user data
  if (type === 'object' && Array.isArray(children)) {
    const result = {};
    for (const child of children) {
      if (child.key != null) {
        const childUserVal = getChildUserValue(userValue, child.key);
        const val = mergeWithDefaults(child, childUserVal, includeNodeDefaultValue);
        if (shouldIncludeProperty(val, child)) result[child.key] = val;
      }
    }
    return result;
  }

  // Array: merge each user item with schema items definition
  if (type === 'array' && items) {
    const userArr = Array.isArray(userValue) ? userValue : [];
    return userArr.map((item) => mergeWithDefaults(items, item, includeNodeDefaultValue));
  }

  // Primitive: user wins; optional uses schema default if defined, else omit; required uses default
  if (userValue !== undefined) return userValue;
  if (!node.required) {
    const hasDefault = includeNodeDefaultValue && node.default !== undefined;
    return hasDefault ? generateValue(node, { includeNodeDefaultValue }) : undefined;
  }
  return generateValue(node, { includeNodeDefaultValue });
}
