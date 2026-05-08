import { getNodeDefaults } from './schema-defaults.js';
import { resolveSchema } from './schema-resolver.js';

function inferKind(schema = {}) {
  if (schema.type) return schema.type;
  if (schema.properties) return 'object';
  if (schema.items) return 'array';
  return 'string';
}

function compileNode({ key, schema, required = false, labelFallback = '' }) {
  const kind = inferKind(schema);
  const label = schema?.title ?? labelFallback ?? key ?? '';
  const defaults = getNodeDefaults({ schema, kind });

  const baseNode = {
    key,
    kind,
    label,
    required,
    readonly: defaults.readonly,
    defaultValue: defaults.defaultValue,
    validation: defaults.validation,
    ui: defaults.ui,
  };

  if (kind === 'object') {
    const properties = schema?.properties ?? {};
    const requiredSet = new Set(schema?.required ?? []);

    return {
      ...baseNode,
      children: Object.entries(properties).map(([childKey, childSchema]) => (
        compileNode({
          key: childKey,
          schema: childSchema ?? {},
          required: requiredSet.has(childKey),
          labelFallback: childKey,
        })
      )),
    };
  }

  if (kind === 'array') {
    const itemSchema = schema?.items ?? {};
    return {
      ...baseNode,
      minItems: defaults.minItems,
      maxItems: defaults.maxItems,
      item: compileNode({
        key: 'item',
        schema: itemSchema,
        required: false,
        labelFallback: itemSchema?.title ?? label,
      }),
    };
  }

  if (Array.isArray(schema?.enum)) {
    return {
      ...baseNode,
      enumValues: schema.enum,
    };
  }

  return baseNode;
}

export function compileSchema({ schema }) {
  const resolved = resolveSchema({ schema });
  if (!resolved) {
    return { schema: null, definition: null };
  }

  const definition = compileNode({
    key: 'data',
    schema: resolved,
    required: false,
    labelFallback: resolved.title ?? 'Data',
  });

  return { schema: resolved, definition };
}
