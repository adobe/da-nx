function traverse(node, visitor) {
  if (!node) return;
  visitor(node);

  if (Array.isArray(node.children)) {
    node.children.forEach((child) => traverse(child, visitor));
  }

  if (Array.isArray(node.items)) {
    node.items.forEach((item) => traverse(item, visitor));
  }
}

export function createRuntimeModelIndex({ root }) {
  const nodesByPointer = new Map();

  traverse(root, (node) => {
    if (typeof node.pointer === 'string') {
      nodesByPointer.set(node.pointer, node);
    }
  });

  return {
    nodesByPointer,
  };
}

export function findNodeByPointer({ index, pointer }) {
  return index?.nodesByPointer?.get(pointer) ?? null;
}
