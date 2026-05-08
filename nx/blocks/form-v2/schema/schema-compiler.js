import { getNodeDefaults } from './schema-defaults.js';
import { resolveSchema } from './schema-resolver.js';

function inferKind(schema = {}) {
  if (schema.type) return schema.type;
  if (schema.properties) return 'object';
  if (schema.items) return 'array';
  return 'string';
}

function getUnsupportedComposition(schema = {}) {
  if (schema?.unsupportedComposition) return schema.unsupportedComposition;
  if (Array.isArray(schema?.oneOf) && schema.oneOf.length > 0) return 'oneOf';
  if (Array.isArray(schema?.anyOf) && schema.anyOf.length > 0) return 'anyOf';
  return null;
}

function compileNode({ key, schema, required = false, labelFallback = '' }) {
  const unsupportedComposition = getUnsupportedComposition(schema);
  if (unsupportedComposition) {
    // TODO: Investigate what concrete support for oneOf/anyOf means for the
    // editor contract (branch selection UX, validation behavior, mutations).
    // For now we stop compilation at this branch and skip downstream handling.
    return {
      key,
      kind: 'unsupported-composition',
      label: schema?.title ?? labelFallback ?? key ?? '',
      required,
      readonly: true,
      defaultValue: undefined,
      validation: {},
      ui: { widget: 'unsupported-composition' },
      unsupportedComposition,
    };
  }

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
    const itemDefinition = compileNode({
      key: 'item',
      schema: itemSchema,
      required: false,
      labelFallback: itemSchema?.title ?? label,
    });

    if (itemDefinition.kind === 'unsupported-composition') {
      return {
        ...baseNode,
        kind: 'unsupported-composition',
        readonly: true,
        unsupportedComposition: itemDefinition.unsupportedComposition,
      };
    }

    return {
      ...baseNode,
      minItems: defaults.minItems,
      maxItems: defaults.maxItems,
      item: itemDefinition,
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
    required: true,
    labelFallback: resolved.title ?? 'Data',
  });

  return { schema: resolved, definition };
}
