function clone(value) {
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

function resolveNode({ node, rootSchema, seenRefs }) {
  if (!node || typeof node !== 'object') return node;

  let resolved = { ...node };

  if (resolved.$ref) {
    const ref = resolved.$ref;
    const target = resolveRef({ ref, rootSchema });
    if (target && !seenRefs.has(ref)) {
      seenRefs.add(ref);
      const derefTarget = resolveNode({
        node: clone(target),
        rootSchema,
        seenRefs,
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
    // Temporary fallback: we intentionally ignore all composition semantics and pick only
    // the first variant from allOf/oneOf/anyOf. Further investigation is required to
    // support full combinator behavior correctly.
    const firstVariant = resolveNode({
      node: composition.entries[0],
      rootSchema,
      seenRefs,
    });
    const withoutCombinators = {
      ...resolved,
      allOf: undefined,
      oneOf: undefined,
      anyOf: undefined,
    };
    resolved = mergeSchemas(firstVariant ?? {}, withoutCombinators);
  }

  if (resolved.items) {
    resolved.items = resolveNode({
      node: resolved.items,
      rootSchema,
      seenRefs,
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
        }),
      ]),
    );
  }

  return resolved;
}

export function resolveSchema({ schema }) {
  if (!schema || typeof schema !== 'object') return null;
  const schemaClone = clone(schema);
  return resolveNode({
    node: schemaClone,
    rootSchema: schemaClone,
    seenRefs: new Set(),
  });
}
