function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function primitiveKey(value) {
  return `${typeof value}:${JSON.stringify(value)}`;
}

function buildReusableQueues({ previousItems = [], previousIds = [] }) {
  const objectQueues = new Map();
  const primitiveQueues = new Map();

  previousItems.forEach((item, index) => {
    const id = previousIds[index];
    if (!id) return;

    if (item !== null && typeof item === 'object') {
      const list = objectQueues.get(item) ?? [];
      list.push(id);
      objectQueues.set(item, list);
      return;
    }

    const key = primitiveKey(item);
    const list = primitiveQueues.get(key) ?? [];
    list.push(id);
    primitiveQueues.set(key, list);
  });

  return { objectQueues, primitiveQueues };
}

function reuseId({ item, objectQueues, primitiveQueues }) {
  if (item !== null && typeof item === 'object') {
    const list = objectQueues.get(item);
    if (!list?.length) return null;
    const id = list.shift();
    if (!list.length) objectQueues.delete(item);
    return id;
  }

  const key = primitiveKey(item);
  const list = primitiveQueues.get(key);
  if (!list?.length) return null;
  const id = list.shift();
  if (!list.length) primitiveQueues.delete(key);
  return id;
}

export function assignArrayItemIds({
  nextItems = [],
  previousItems = [],
  previousIds = [],
}) {
  const queues = buildReusableQueues({ previousItems, previousIds });

  return nextItems.map((item) => {
    const reused = reuseId({ item, ...queues });
    return reused ?? newId();
  });
}
