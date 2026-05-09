import { getNodeDefaults } from './schema-defaults.js';
import { resolveSchema } from './schema-resolver.js';

function escapePointerSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function inferKind(schema = {}) {
  if (schema?.unsupportedComposition) {
    const unsupported = schema.unsupportedComposition ?? {};
    const compositionKeyword = unsupported.compositionKeyword ?? unsupported.combinator ?? 'unknown';
    return {
      kind: 'unsupported',
      unsupported: {
        reason: 'unsupported-composition',
        feature: compositionKeyword,
        compositionKeyword,
        variants: unsupported.variants ?? 0,
        schemaPath: unsupported.schemaPath ?? '/',
        details: null,
      },
    };
  }

  if (typeof schema?.type === 'string') {
    return { kind: schema.type };
  }

  if (schema?.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)) {
    return { kind: 'object' };
  }

  if (schema?.items !== undefined) {
    return { kind: 'array' };
  }

  if (Array.isArray(schema?.enum)) {
    return { kind: 'string' };
  }

  return {
    kind: 'unsupported',
    unsupported: {
      reason: 'unknown-shape',
      feature: 'unknown-shape',
      compositionKeyword: 'unknown-shape',
      variants: 0,
      schemaPath: '/',
      details: null,
    },
  };
}

function compileNode({
  key,
  schema,
  required = false,
  labelFallback = '',
  pointer = '/data',
  unsupportedIssues,
}) {
  const {
    kind,
    unsupported: inferredUnsupported = null,
  } = inferKind(schema);
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
    const unsupported = inferredUnsupported ?? {};
    const compositionKeyword = unsupported.compositionKeyword ?? unsupported.combinator ?? 'unknown';
    unsupportedIssues.push({
      pointer,
      compositionKeyword,
      feature: unsupported.feature ?? compositionKeyword,
      reason: unsupported.reason ?? 'unsupported-schema-feature',
      variants: unsupported.variants ?? 0,
      scope: pointer === '/data' ? 'root' : 'subtree',
      details: unsupported.details ?? null,
    });

    return {
      ...baseNode,
      kind: 'unsupported',
      readonly: true,
      unsupported: {
        compositionKeyword,
        feature: unsupported.feature ?? compositionKeyword,
        reason: unsupported.reason ?? 'unsupported-schema-feature',
        variants: unsupported.variants ?? 0,
        schemaPath: unsupported.schemaPath ?? '/',
        details: unsupported.details ?? null,
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

function emptyCompilation() {
  return {
    schema: null,
    definition: null,
    unsupported: {
      hasUnsupportedCompositions: false,
      rootUnsupported: false,
      issues: [],
      schemaIssues: [],
    },
  };
}

export function compileSchema({ schema }) {
  const resolved = resolveSchema({ schema });
  if (!resolved?.schema) return emptyCompilation();

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
      hasUnsupportedCompositions: unsupportedIssues.length > 0,
      rootUnsupported,
      issues: unsupportedIssues,
      schemaIssues: resolved.unsupportedCompositions ?? resolved.unsupportedCombinators ?? [],
    },
  };
}
