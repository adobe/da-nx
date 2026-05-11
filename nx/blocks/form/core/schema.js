import { deepClone } from './clone.js';

function unionRequired(base = [], next = []) {
  return Array.from(new Set([...(base ?? []), ...(next ?? [])]));
}

function mergeSchemas(baseSchema = {}, nextSchema = {}) {
  const merged = { ...baseSchema, ...nextSchema };

  const baseProps = baseSchema?.properties ?? null;
  const nextProps = nextSchema?.properties ?? null;
  if (baseProps || nextProps) {
    merged.properties = { ...(baseProps ?? {}), ...(nextProps ?? {}) };
  }

  const baseDefs = baseSchema?.$defs ?? null;
  const nextDefs = nextSchema?.$defs ?? null;
  if (baseDefs || nextDefs) {
    merged.$defs = { ...(baseDefs ?? {}), ...(nextDefs ?? {}) };
  }

  merged.required = unionRequired(baseSchema.required, nextSchema.required);
  return merged;
}

function resolveRef({ ref, rootSchema }) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return null;
  const segments = ref.slice(2).split('/').filter(Boolean);
  let current = rootSchema;
  for (const segment of segments) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current == null || typeof current !== 'object') return null;
    current = current[key];
  }
  return current ?? null;
}

function escapeSchemaPathSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function markUnsupportedComposition({
  node, compositionKeyword, variants, issues, schemaPath,
}) {
  issues.push({
    schemaPath,
    compositionKeyword,
    variants,
    scope: schemaPath === '/' ? 'root' : 'subtree',
  });

  return {
    ...node,
    unsupportedComposition: { compositionKeyword, variants, schemaPath },
  };
}

function resolveNode({
  node, rootSchema, seenRefs, issues, schemaPath,
}) {
  if (!node || typeof node !== 'object') return node;

  let resolved = { ...node };

  if (resolved.$ref) {
    const ref = resolved.$ref;
    const target = resolveRef({ ref, rootSchema });
    if (target && !seenRefs.has(ref)) {
      seenRefs.add(ref);
      const derefTarget = resolveNode({
        node: deepClone(target), rootSchema, seenRefs, issues, schemaPath,
      });
      seenRefs.delete(ref);
      resolved = mergeSchemas(derefTarget, { ...resolved, $ref: undefined });
    } else {
      resolved.$ref = undefined;
    }
  }

  const composition = (
    (Array.isArray(resolved.allOf) && resolved.allOf.length > 0 && { key: 'allOf', entries: resolved.allOf })
    || (Array.isArray(resolved.oneOf) && resolved.oneOf.length > 0 && { key: 'oneOf', entries: resolved.oneOf })
    || (Array.isArray(resolved.anyOf) && resolved.anyOf.length > 0 && { key: 'anyOf', entries: resolved.anyOf })
  );

  if (composition) {
    const unsupported = (
      composition.key === 'oneOf'
      || composition.key === 'anyOf'
      || (composition.key === 'allOf' && composition.entries.length > 1)
    );

    if (unsupported) {
      return markUnsupportedComposition({
        node: resolved,
        compositionKeyword: composition.key,
        variants: composition.entries.length,
        issues,
        schemaPath,
      });
    }

    const firstVariant = resolveNode({
      node: composition.entries[0], rootSchema, seenRefs, issues, schemaPath,
    });
    resolved = mergeSchemas(firstVariant ?? {}, {
      ...resolved, allOf: undefined, oneOf: undefined, anyOf: undefined,
    });
  }

  if (resolved.items) {
    resolved.items = resolveNode({
      node: resolved.items,
      rootSchema,
      seenRefs,
      issues,
      schemaPath: `${schemaPath}/items`,
    });
  }

  if (resolved.properties && typeof resolved.properties === 'object') {
    resolved.properties = Object.fromEntries(
      Object.entries(resolved.properties).map(([key, propertySchema]) => [
        key,
        resolveNode({
          node: propertySchema,
          rootSchema,
          seenRefs,
          issues,
          schemaPath: `${schemaPath}/properties/${escapeSchemaPathSegment(key)}`,
        }),
      ]),
    );
  }

  return resolved;
}

function resolveSchema(schema) {
  if (!schema || typeof schema !== 'object') return null;

  const clone = deepClone(schema);
  const issues = [];
  const resolved = resolveNode({
    node: clone,
    rootSchema: clone,
    seenRefs: new Set(),
    issues,
    schemaPath: '/',
  });

  return { schema: resolved, unsupportedCompositions: issues };
}

const RULE_NAMES = [
  'minLength', 'maxLength', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum', 'pattern', 'minItems', 'maxItems',
];

function pickValidation(schema = {}) {
  return RULE_NAMES.reduce((acc, name) => {
    if (schema[name] !== undefined) acc[name] = schema[name];
    return acc;
  }, {});
}

function detectWidget(schema = {}) {
  if (Array.isArray(schema.enum)) return 'select';
  if (schema.type === 'boolean') return 'checkbox';
  if (schema.type === 'number' || schema.type === 'integer') return 'number';
  if (schema.format === 'textarea') return 'textarea';
  return 'text';
}

function getDefaults({ schema = {}, kind }) {
  return {
    readonly: !!(schema.readOnly ?? schema.readonly),
    defaultValue: schema.default,
    validation: pickValidation(schema),
    ui: { widget: detectWidget(schema) },
    minItems: kind === 'array' ? schema.minItems : undefined,
    maxItems: kind === 'array' ? schema.maxItems : undefined,
  };
}

function escapePointerSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function inferKind(schema = {}) {
  if (schema?.unsupportedComposition) {
    const u = schema.unsupportedComposition ?? {};
    const keyword = u.compositionKeyword ?? u.combinator ?? 'unknown';
    return {
      kind: 'unsupported',
      unsupported: {
        reason: 'unsupported-composition',
        feature: keyword,
        compositionKeyword: keyword,
        variants: u.variants ?? 0,
        schemaPath: u.schemaPath ?? '/',
        details: null,
      },
    };
  }

  if (typeof schema?.type === 'string') return { kind: schema.type };
  if (schema?.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)) return { kind: 'object' };
  if (schema?.items !== undefined) return { kind: 'array' };
  if (Array.isArray(schema?.enum)) return { kind: 'string' };

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
  key, schema, required = false, labelFallback = '', pointer = '/data', issues,
}) {
  const { kind, unsupported: inferred = null } = inferKind(schema);
  const label = schema?.title ?? labelFallback ?? key ?? '';
  const defaults = getDefaults({ schema, kind });

  const base = {
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
    const u = inferred ?? {};
    const keyword = u.compositionKeyword ?? u.combinator ?? 'unknown';
    issues.push({
      pointer,
      compositionKeyword: keyword,
      feature: u.feature ?? keyword,
      reason: u.reason ?? 'unsupported-schema-feature',
      variants: u.variants ?? 0,
      scope: pointer === '/data' ? 'root' : 'subtree',
      details: u.details ?? null,
    });

    return {
      ...base,
      kind: 'unsupported',
      readonly: true,
      unsupported: {
        compositionKeyword: keyword,
        feature: u.feature ?? keyword,
        reason: u.reason ?? 'unsupported-schema-feature',
        variants: u.variants ?? 0,
        schemaPath: u.schemaPath ?? '/',
        details: u.details ?? null,
      },
    };
  }

  if (kind === 'object') {
    const properties = schema?.properties ?? {};
    const requiredSet = new Set(schema?.required ?? []);
    return {
      ...base,
      children: Object.entries(properties).map(([childKey, childSchema]) => (
        compileNode({
          key: childKey,
          schema: childSchema ?? {},
          required: requiredSet.has(childKey),
          labelFallback: childKey,
          pointer: `${pointer}/${escapePointerSegment(childKey)}`,
          issues,
        })
      )),
    };
  }

  if (kind === 'array') {
    const itemSchema = schema?.items ?? {};
    return {
      ...base,
      minItems: defaults.minItems,
      maxItems: defaults.maxItems,
      item: compileNode({
        key: 'item',
        schema: itemSchema,
        required: false,
        labelFallback: itemSchema?.title ?? label,
        pointer: `${pointer}/0`,
        issues,
      }),
    };
  }

  if (Array.isArray(schema?.enum)) {
    return { ...base, enumValues: schema.enum };
  }

  return base;
}

export function compileSchema(rawSchema) {
  const resolved = resolveSchema(rawSchema);
  if (!resolved?.schema) {
    return {
      schema: null,
      definition: null,
      unsupported: { editable: false, issues: [] },
    };
  }

  const issues = [];
  const definition = compileNode({
    key: 'data',
    schema: resolved.schema,
    required: false,
    labelFallback: resolved.schema.title ?? 'Data',
    pointer: '/data',
    issues,
  });
  const rootUnsupported = issues.some((issue) => issue.pointer === '/data');

  return {
    schema: resolved.schema,
    definition: rootUnsupported ? null : definition,
    editable: issues.length === 0,
    issues,
  };
}
