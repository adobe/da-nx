function deepClone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

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

function markUnsupportedCombinator({ node, combinator, variants, issues, schemaPath }) {
  issues.push({
    schemaPath,
    combinator,
    variants,
    scope: schemaPath === '/' ? 'root' : 'subtree',
  });

  return {
    ...node,
    daUnsupportedCombinator: {
      combinator,
      variants,
      schemaPath,
    },
  };
}

function resolveNode({
  node,
  rootSchema,
  seenRefs,
  issues,
  schemaPath,
}) {
  if (!node || typeof node !== 'object') return node;

  let resolved = { ...node };

  if (resolved.$ref) {
    const ref = resolved.$ref;
    const target = resolveRef({ ref, rootSchema });
    if (target && !seenRefs.has(ref)) {
      seenRefs.add(ref);
      const derefTarget = resolveNode({
        node: deepClone(target),
        rootSchema,
        seenRefs,
        issues,
        schemaPath,
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
    const isUnsupported = (
      composition.key === 'oneOf'
      || composition.key === 'anyOf'
      || (composition.key === 'allOf' && composition.entries.length > 1)
    );

    if (isUnsupported) {
      return markUnsupportedCombinator({
        node: resolved,
        combinator: composition.key,
        variants: composition.entries.length,
        issues,
        schemaPath,
      });
    }

    const firstVariant = resolveNode({
      node: composition.entries[0],
      rootSchema,
      seenRefs,
      issues,
      schemaPath,
    });
    resolved = mergeSchemas(firstVariant ?? {}, {
      ...resolved,
      allOf: undefined,
      oneOf: undefined,
      anyOf: undefined,
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

export function resolveSchema({ schema }) {
  if (!schema || typeof schema !== 'object') return null;

  const schemaClone = deepClone(schema);
  const issues = [];
  const resolved = resolveNode({
    node: schemaClone,
    rootSchema: schemaClone,
    seenRefs: new Set(),
    issues,
    schemaPath: '/',
  });

  return {
    schema: resolved,
    unsupportedCombinators: issues,
  };
}
