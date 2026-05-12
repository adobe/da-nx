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
  node, compositionKeyword, variants, schemaPath,
}) {
  return {
    ...node,
    unsupportedComposition: { compositionKeyword, variants, schemaPath },
  };
}

function resolveNode({
  node, rootSchema, seenRefs, schemaPath,
}) {
  if (!node || typeof node !== 'object') return node;

  let resolved = { ...node };

  if (resolved.$ref) {
    const ref = resolved.$ref;
    const isInternal = typeof ref === 'string' && ref.startsWith('#/');

    if (!isInternal) {
      // External ref (URL, file path, or malformed). SCHEMA-SPEC.md only
      // permits same-document `#/...` refs.
      return {
        ...resolved,
        $ref: undefined,
        unsupportedRef: { reason: 'external-ref', ref },
      };
    }

    if (seenRefs.has(ref)) {
      // Cycle: drop the ref and continue resolving the partial node we have.
      resolved = { ...resolved, $ref: undefined };
    } else {
      const target = resolveRef({ ref, rootSchema });
      if (!target) {
        // Internal but the pointer does not resolve in the document.
        return {
          ...resolved,
          $ref: undefined,
          unsupportedRef: { reason: 'unresolved-ref', ref },
        };
      }
      seenRefs.add(ref);
      const derefTarget = resolveNode({
        node: deepClone(target), rootSchema, seenRefs, schemaPath,
      });
      seenRefs.delete(ref);
      resolved = mergeSchemas(derefTarget, { ...resolved, $ref: undefined });
    }
  }

  const composition = (
    (Array.isArray(resolved.allOf) && resolved.allOf.length > 0 && { key: 'allOf', entries: resolved.allOf })
    || (Array.isArray(resolved.oneOf) && resolved.oneOf.length > 0 && { key: 'oneOf', entries: resolved.oneOf })
    || (Array.isArray(resolved.anyOf) && resolved.anyOf.length > 0 && { key: 'anyOf', entries: resolved.anyOf })
  );

  if (composition) {
    // All composition keywords are unsupported per SCHEMA-SPEC.md. If the
    // node also has a direct `properties` map, mark the node and fall through
    // so the editable subset still renders; otherwise the whole node becomes
    // kind 'unsupported'.
    const hasDirectProperties = resolved.properties
      && typeof resolved.properties === 'object'
      && !Array.isArray(resolved.properties)
      && Object.keys(resolved.properties).length > 0;

    resolved = markUnsupportedComposition({
      node: resolved,
      compositionKeyword: composition.key,
      variants: composition.entries.length,
      schemaPath,
    });

    if (!hasDirectProperties) {
      return resolved;
    }

    resolved = { ...resolved, allOf: undefined, oneOf: undefined, anyOf: undefined };
  }

  if (resolved.items) {
    resolved.items = resolveNode({
      node: resolved.items,
      rootSchema,
      seenRefs,
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
  const resolved = resolveNode({
    node: clone,
    rootSchema: clone,
    seenRefs: new Set(),
    schemaPath: '/',
  });

  return { schema: resolved };
}

const RULE_NAMES = ['minLength', 'maxLength', 'minimum', 'maximum', 'pattern'];

function pickValidation(schema = {}) {
  return RULE_NAMES.reduce((acc, name) => {
    if (schema[name] !== undefined) acc[name] = schema[name];
    return acc;
  }, {});
}

function getDefaults({ schema = {}, kind }) {
  return {
    readonly: !!(schema.readOnly ?? schema.readonly),
    defaultValue: schema.default,
    validation: pickValidation(schema),
    minItems: kind === 'array' ? schema.minItems : undefined,
    maxItems: kind === 'array' ? schema.maxItems : undefined,
  };
}

function escapePointerSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

const SUPPORTED_TYPES = new Set([
  'string', 'number', 'integer', 'boolean', 'object', 'array',
]);

function unsupportedKind({ reason, feature, schemaPath = '/', variants = 0, details = null }) {
  return {
    kind: 'unsupported',
    unsupported: {
      reason,
      feature,
      compositionKeyword: feature,
      variants,
      schemaPath,
      details,
    },
  };
}

function inferKind(schema = {}) {
  if (schema?.unsupportedRef) {
    const r = schema.unsupportedRef;
    return unsupportedKind({
      reason: r.reason,
      feature: r.reason,
      details: { ref: r.ref },
    });
  }

  if (schema?.unsupportedComposition) {
    // If the node also has directly-defined properties, compile it as an object.
    // The composition itself is flagged via unsupportedComposition; the
    // editable subset still renders.
    if (
      schema.properties
      && typeof schema.properties === 'object'
      && !Array.isArray(schema.properties)
    ) {
      return { kind: 'object' };
    }

    const u = schema.unsupportedComposition ?? {};
    const keyword = u.compositionKeyword ?? 'unknown';
    return unsupportedKind({
      reason: 'unsupported-composition',
      feature: keyword,
      variants: u.variants ?? 0,
      schemaPath: u.schemaPath ?? '/',
    });
  }

  if (Array.isArray(schema?.type)) {
    return unsupportedKind({
      reason: 'type-as-array',
      feature: 'type-as-array',
      details: { type: schema.type },
    });
  }

  if (typeof schema?.type === 'string') {
    if (SUPPORTED_TYPES.has(schema.type)) return { kind: schema.type };
    return unsupportedKind({
      reason: 'unsupported-type',
      feature: schema.type,
      details: { type: schema.type },
    });
  }

  return unsupportedKind({
    reason: 'missing-type',
    feature: 'missing-type',
  });
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
  };

  if (kind === 'unsupported') {
    const u = inferred ?? {};
    const keyword = u.compositionKeyword ?? 'unknown';
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

    if (schema?.unsupportedComposition) {
      const u = schema.unsupportedComposition;
      const keyword = u.compositionKeyword ?? 'unknown';
      issues.push({
        pointer,
        compositionKeyword: keyword,
        feature: keyword,
        reason: 'unsupported-composition',
        variants: u.variants ?? 0,
        scope: pointer === '/data' ? 'root' : 'subtree',
        details: null,
      });
    }

    const node = {
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

    if (schema?.unsupportedComposition) {
      node.unsupportedComposition = schema.unsupportedComposition;
    }

    return node;
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
      editable: false,
      issues: [],
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

  return {
    schema: resolved.schema,
    definition,
    editable: issues.length === 0,
    issues,
  };
}
