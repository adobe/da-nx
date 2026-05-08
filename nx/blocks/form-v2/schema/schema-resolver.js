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

function getUnsupportedComposition(schema = {}) {
  if (Array.isArray(schema.oneOf) && schema.oneOf.length > 0) return 'oneOf';
  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) return 'anyOf';
  return null;
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

  if (Array.isArray(resolved.allOf) && resolved.allOf.length > 0) {
    const mergedAllOf = resolved.allOf.reduce((acc, part) => {
      const resolvedPart = resolveNode({
        node: part,
        rootSchema,
        seenRefs,
      });
      return mergeSchemas(acc, resolvedPart ?? {});
    }, {});

    const withoutAllOf = { ...resolved, allOf: undefined };
    resolved = mergeSchemas(mergedAllOf, withoutAllOf);
  }

  const unsupportedComposition = getUnsupportedComposition(resolved);
  if (unsupportedComposition) {
    // TODO: Investigate what full support for oneOf/anyOf should mean for
    // rendering, mutation, validation, and persistence contracts in form-v2.
    // For now, stop resolving this branch and mark it as unsupported.
    return {
      ...resolved,
      unsupportedComposition,
    };
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
