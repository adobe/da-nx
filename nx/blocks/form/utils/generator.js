/**
 * Generate an object with empty values from a JSON Schema
 * @param {object} schema - JSON Schema (draft 2020-12)
 * @param {Set} requiredFields - Set of required field names (used internally)
 * @param {object} rootSchema - Root schema for resolving $ref (used internally)
 * @returns {object} - Object with empty values
 */
export default function generateEmptyObject(
  schema,
  requiredFields = new Set(),
  rootSchema = schema,
) {
  // Handle $ref references
  if (schema.$ref) {
    const refPath = schema.$ref.split('/').slice(1); // Remove leading #
    let resolved = rootSchema;
    for (const part of refPath) {
      resolved = resolved[part];
    }
    return generateEmptyObject(resolved, requiredFields, rootSchema);
  }

  // Handle oneOf - take the first option
  if (schema.oneOf) {
    return generateEmptyObject(schema.oneOf[0], requiredFields, rootSchema);
  }

  // Use schema default when present, otherwise undefined (no auto-picking enum[0] or 0)
  const useDefault = (value) => (value !== undefined && value !== null ? value : undefined);

  const { type } = schema;

  switch (type) {
    case 'object': {
      const obj = {};
      if (schema.properties) {
        // Create a set of required fields for child properties
        const childRequired = new Set(schema.required || []);

        for (const [key, propSchema] of Object.entries(schema.properties)) {
          // Pass down whether this specific field is required
          const isRequired = childRequired.has(key);
          const reqSet = isRequired ? new Set([key]) : new Set();
          obj[key] = generateEmptyObject(propSchema, reqSet, rootSchema);
        }
      }
      return obj;
    }

    case 'array': {
      if (requiredFields.size > 0 && schema.items) {
        return [generateEmptyObject(schema.items, new Set(), rootSchema)];
      }
      return [];
    }

    case 'string':
    case 'number':
    case 'integer':
      return useDefault(schema.default);

    case 'boolean':
      return schema.default ?? false;

    default:
      return null;
  }
}
