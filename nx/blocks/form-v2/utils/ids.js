function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toSignature(value) {
  if (value === null) return 'null';

  const type = typeof value;
  if (type === 'undefined') return 'undefined';
  if (type === 'string') return `string:${JSON.stringify(value)}`;
  if (type === 'number' || type === 'boolean' || type === 'bigint') return `${type}:${String(value)}`;
  if (type !== 'object') return `${type}:${String(value)}`;

  if (Array.isArray(value)) {
    return `array:[${value.map((item) => toSignature(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${toSignature(value[key])}`)
    .join(',');
  return `object:{${body}}`;
}

function countSignatures(values = []) {
  return values.reduce((acc, value) => {
    const signature = toSignature(value);
    acc.set(signature, (acc.get(signature) ?? 0) + 1);
    return acc;
  }, new Map());
}

function sameMultiset(leftCounts, rightCounts) {
  if (leftCounts.size !== rightCounts.size) return false;
  for (const [key, count] of leftCounts.entries()) {
    if ((rightCounts.get(key) ?? 0) !== count) return false;
  }
  return true;
}

function buildQueuesBySignature({ previousItems = [], previousIds = [], usedPrev = [] }) {
  const queues = new Map();
  previousItems.forEach((item, index) => {
    if (!usedPrev[index]) {
      const id = previousIds[index];
      if (id) {
        const signature = toSignature(item);
        const list = queues.get(signature) ?? [];
        list.push(index);
        queues.set(signature, list);
      }
    }
  });
  return queues;
}

export function assignArrayItemIds({
  nextItems = [],
  previousItems = [],
  previousIds = [],
}) {
  const result = Array(nextItems.length).fill(null);
  const usedPrev = Array(previousItems.length).fill(false);
  const reuseBySignatureOnly = previousItems.length === nextItems.length
    && sameMultiset(countSignatures(previousItems), countSignatures(nextItems));

  if (!reuseBySignatureOnly) {
    const limit = Math.min(previousItems.length, nextItems.length);
    for (let index = 0; index < limit; index += 1) {
      const id = previousIds[index];
      if (id) {
        result[index] = id;
        usedPrev[index] = true;
      }
    }
  }

  const queuesBySignature = buildQueuesBySignature({
    previousItems,
    previousIds,
    usedPrev,
  });

  nextItems.forEach((item, index) => {
    if (result[index]) return;

    const signature = toSignature(item);
    const queue = queuesBySignature.get(signature);
    if (queue?.length) {
      const prevIndex = queue.shift();
      usedPrev[prevIndex] = true;
      result[index] = previousIds[prevIndex];
      if (!queue.length) queuesBySignature.delete(signature);
      return;
    }

    result[index] = newId();
  });

  return result;
}
