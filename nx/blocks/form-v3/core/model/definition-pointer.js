import { parsePointer } from './json-pointer.js';

export function findDefinitionByPointer({ definition, pointer }) {
  const segments = parsePointer(pointer);
  if (!segments.length || segments[0] !== 'data') return null;

  let node = definition;
  let index = 1;

  while (index < segments.length) {
    const segment = segments[index];
    if (!node) return null;

    if (node.kind === 'object') {
      node = (node.children ?? []).find((child) => child.key === segment) ?? null;
      index += 1;
    } else if (node.kind === 'array') {
      node = node.item ?? null;
      if (index < segments.length && /^\d+$/.test(segments[index])) {
        index += 1;
      }
    } else {
      return null;
    }
  }

  return node;
}
