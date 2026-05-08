import { appendPointer } from './json-pointer.js';
import { assignArrayItemIds } from '../utils/ids.js';

function nodeIdFromPointer(pointer) {
  return `node:${pointer || '/'}`;
}

function getObjectValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

function buildLookupById(nodes = []) {
  return nodes.reduce((acc, node) => {
    if (node?.id) acc.set(node.id, node);
    return acc;
  }, new Map());
}

function buildNode({
  definition,
  pointer,
  value,
  previousNode,
  forcedId,
}) {
  const id = forcedId ?? nodeIdFromPointer(pointer);
  const baseNode = {
    id,
    key: definition.key,
    kind: definition.kind,
    pointer,
    label: definition.label,
    required: !!definition.required,
    readonly: !!definition.readonly,
    defaultValue: definition.defaultValue,
    validation: definition.validation ?? {},
    ui: definition.ui ?? {},
    sourceValue: value,
  };

  if (Array.isArray(definition.enumValues)) {
    baseNode.enumValues = definition.enumValues;
  }

  if (definition.kind === 'object') {
    const objectValue = getObjectValue(value);
    const children = (definition.children ?? []).map((childDef) => {
      const childPointer = appendPointer({ pointer, segment: childDef.key });
      const childValue = objectValue[childDef.key];
      const previousChild = previousNode?.children?.find((node) => node.pointer === childPointer);
      return buildNode({
        definition: childDef,
        pointer: childPointer,
        value: childValue,
        previousNode: previousChild,
      });
    });
    return { ...baseNode, children };
  }

  if (definition.kind === 'array') {
    const arrayValue = Array.isArray(value) ? value : [];
    const previousItems = previousNode?.items?.map((node) => node.sourceValue) ?? [];
    const previousIds = previousNode?.items?.map((node) => node.id) ?? [];
    const itemIds = assignArrayItemIds({
      nextItems: arrayValue,
      previousItems,
      previousIds,
    });
    const previousItemsById = buildLookupById(previousNode?.items ?? []);

    const items = arrayValue.map((itemValue, index) => {
      const itemPointer = appendPointer({ pointer, segment: index });
      const itemId = itemIds[index];
      return buildNode({
        definition: definition.item,
        pointer: itemPointer,
        value: itemValue,
        previousNode: previousItemsById.get(itemId),
        forcedId: itemId,
      });
    });

    return {
      ...baseNode,
      minItems: definition.minItems,
      maxItems: definition.maxItems,
      itemKind: definition.item?.kind,
      itemLabel: definition.item?.label ?? '',
      items,
    };
  }

  return {
    ...baseNode,
    value,
    effectiveValue: value ?? definition.defaultValue,
  };
}

export function buildRuntimeFormModel({
  definition,
  json,
  previousRuntime = null,
}) {
  if (!definition) return null;

  const rootPointer = '/data';
  const rootValue = json?.data ?? {};
  const previousRoot = previousRuntime?.root ?? null;

  return {
    root: buildNode({
      definition,
      pointer: rootPointer,
      value: rootValue,
      previousNode: previousRoot,
    }),
    json,
  };
}
