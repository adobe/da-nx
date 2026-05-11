import { appendPointer } from './pointer.js';
import { assignArrayItemIds } from './ids.js';
import { deepClone } from './clone.js';

function idFromPointer(pointer) {
  return `node:${pointer || '/'}`;
}

function objectValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

function previousById(items = []) {
  return new Map(
    items.filter((node) => !!node?.id).map((node) => [node.id, node]),
  );
}

function buildNode({
  definition, pointer, value, previousNode, forcedId, byPointer,
}) {
  const id = forcedId ?? idFromPointer(pointer);
  const base = {
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
    value,
  };

  if (definition.unsupported) base.unsupported = definition.unsupported;
  if (Array.isArray(definition.enumValues)) base.enumValues = definition.enumValues;

  let node;

  if (definition.kind === 'object') {
    const objValue = objectValue(value);
    const children = (definition.children ?? []).map((childDef) => {
      const childPointer = appendPointer({ pointer, segment: childDef.key });
      const previousChild = previousNode?.children?.find((n) => n.pointer === childPointer);
      return buildNode({
        definition: childDef,
        pointer: childPointer,
        value: objValue[childDef.key],
        previousNode: previousChild,
        byPointer,
      });
    });
    node = { ...base, children };
  } else if (definition.kind === 'array') {
    const arrValue = Array.isArray(value) ? value : [];
    const previousItems = previousNode?.items?.map((n) => n.value) ?? [];
    const previousIds = previousNode?.items?.map((n) => n.id) ?? [];
    const itemIds = assignArrayItemIds({
      nextItems: arrValue, previousItems, previousIds,
    });
    const prevById = previousById(previousNode?.items ?? []);

    const items = arrValue.map((itemValue, index) => {
      const itemPointer = appendPointer({ pointer, segment: index });
      const itemId = itemIds[index];
      return buildNode({
        definition: definition.item,
        pointer: itemPointer,
        value: itemValue,
        previousNode: prevById.get(itemId),
        forcedId: itemId,
        byPointer,
      });
    });

    node = {
      ...base,
      minItems: definition.minItems,
      maxItems: definition.maxItems,
      itemLabel: definition.item?.label ?? '',
      items,
    };
  } else {
    node = base;
  }

  byPointer.set(pointer, node);
  return node;
}

export function buildModel({ definition, document, previousModel = null }) {
  if (!definition) return null;

  const normalizedDoc = deepClone(document ?? {});
  const rootValue = normalizedDoc?.data ?? {};
  const byPointer = new Map();

  const root = buildNode({
    definition,
    pointer: '/data',
    value: rootValue,
    previousNode: previousModel?.root ?? null,
    byPointer,
  });

  return { root, byPointer, document: normalizedDoc };
}

export function nodeAt({ model, pointer }) {
  return model?.byPointer?.get(pointer) ?? null;
}
