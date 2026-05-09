import { getNodeDefaults } from './schema-defaults.js';
import { resolveSchema } from './schema-resolver.js';

function escapePointerSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function inferKind(schema = {}) {
  if (schema?.daUnsupportedCombinator) return 'unsupported';
  if (schema.type) return schema.type;
  if (schema.properties) return 'object';
  if (schema.items) return 'array';
  return 'string';
}

function compileNode({
  key,
  schema,
  required = false,
  labelFallback = '',
  pointer = '/data',
  unsupportedIssues,
}) {
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

  if (kind === 'unsupported') {
    const unsupported = schema.daUnsupportedCombinator ?? {};
    unsupportedIssues.push({
      pointer,
      combinator: unsupported.combinator ?? 'unknown',
      variants: unsupported.variants ?? 0,
      scope: pointer === '/data' ? 'root' : 'subtree',
    });

    return {
      ...baseNode,
      kind: 'unsupported',
      readonly: true,
      unsupported: {
        combinator: unsupported.combinator ?? 'unknown',
        variants: unsupported.variants ?? 0,
        schemaPath: unsupported.schemaPath ?? '/',
      },
    };
  }

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
          pointer: `${pointer}/${escapePointerSegment(childKey)}`,
          unsupportedIssues,
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
        pointer: `${pointer}/0`,
        unsupportedIssues,
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
  if (!resolved?.schema) {
    return {
      schema: null,
      definition: null,
      unsupported: {
        hasUnsupportedCombinators: false,
        rootUnsupported: false,
        issues: [],
      },
    };
  }
  const unsupportedIssues = [];

  const definition = compileNode({
    key: 'data',
    schema: resolved.schema,
    required: false,
    labelFallback: resolved.schema.title ?? 'Data',
    pointer: '/data',
    unsupportedIssues,
  });

  const rootUnsupported = unsupportedIssues.some((issue) => issue.pointer === '/data');

  return {
    schema: resolved.schema,
    definition: rootUnsupported ? null : definition,
    unsupported: {
      hasUnsupportedCombinators: unsupportedIssues.length > 0,
      rootUnsupported,
      issues: unsupportedIssues,
      schemaIssues: resolved.unsupportedCombinators ?? [],
    },
  };
}
