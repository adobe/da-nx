function escapeSegment(segment) {
  return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

function unescapeSegment(segment) {
  return String(segment).replace(/~1/g, '/').replace(/~0/g, '~');
}

export function parsePointer(pointer) {
  if (!pointer || typeof pointer !== 'string') return [];
  const trimmed = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  if (!trimmed) return [];
  return trimmed.split('/').map(unescapeSegment);
}

export function appendPointer({ pointer, segment }) {
  const base = pointer === '' || pointer === '/' ? '' : pointer.replace(/\/$/, '');
  const escaped = escapeSegment(segment);
  return base ? `${base}/${escaped}` : `/${escaped}`;
}

export function getParentPointer(pointer) {
  const segments = parsePointer(pointer);
  if (segments.length <= 1) return '';
  return `/${segments.slice(0, -1).map(escapeSegment).join('/')}`;
}

export function getPointerValue({ data, pointer }) {
  const segments = parsePointer(pointer);
  let current = data;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

function getParentTarget({ data, pointer }) {
  const segments = parsePointer(pointer);
  if (segments.length === 0) return null;

  let current = data;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (current == null || !(segment in current)) return null;
    current = current[segment];
  }

  return { parent: current, key: segments[segments.length - 1] };
}

function ensureParentTarget({ data, pointer }) {
  const segments = parsePointer(pointer);
  if (segments.length === 0) return null;

  let current = data;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    const nextIsArray = /^\d+$/.test(String(nextSegment));

    if (!(segment in current)) {
      current[segment] = nextIsArray ? [] : {};
    }
    current = current[segment];
  }

  return { parent: current, key: segments[segments.length - 1] };
}

export function setPointerValue({ data, pointer, value }) {
  const target = ensureParentTarget({ data, pointer });
  if (!target) return false;
  target.parent[target.key] = value;
  return true;
}

export function removePointerValue({ data, pointer }) {
  const target = getParentTarget({ data, pointer });
  if (!target) return false;

  const { parent, key } = target;
  const index = Number.parseInt(key, 10);
  const isArrayIndex = Array.isArray(parent) && Number.isInteger(index) && index >= 0;

  if (isArrayIndex) {
    if (index >= parent.length) return false;
    parent.splice(index, 1);
    return true;
  }

  if (!(key in parent)) return false;
  delete parent[key];
  return true;
}

export function clearPointerValue({ data, pointer, emptyValue }) {
  const target = getParentTarget({ data, pointer });
  if (!target) return false;

  const { parent, key } = target;
  const index = Number.parseInt(key, 10);
  const isArrayIndex = Array.isArray(parent) && Number.isInteger(index) && index >= 0;

  if (isArrayIndex) {
    if (index >= parent.length) return false;
    parent[index] = emptyValue;
    return true;
  }

  return removePointerValue({ data, pointer });
}

export function insertPointerValueBefore({ data, pointer, value }) {
  const parentPointer = getParentPointer(pointer);
  if (!parentPointer) return false;

  const index = Number.parseInt(parsePointer(pointer).at(-1), 10);
  if (!Number.isInteger(index) || index < 0) return false;

  const array = getPointerValue({ data, pointer: parentPointer });
  if (!Array.isArray(array)) {
    setPointerValue({ data, pointer: parentPointer, value: [] });
  }

  const ensuredArray = getPointerValue({ data, pointer: parentPointer }) ?? [];
  const insertAt = Math.max(0, Math.min(index, ensuredArray.length));
  ensuredArray.splice(insertAt, 0, value);
  return true;
}

export function movePointerArrayItemBefore({ data, pointer, beforePointer }) {
  const parentPointer = getParentPointer(pointer);
  if (!parentPointer) return false;

  const array = getPointerValue({ data, pointer: parentPointer });
  if (!Array.isArray(array)) return false;

  const currentIndex = Number.parseInt(parsePointer(pointer).at(-1), 10);
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= array.length) {
    return false;
  }

  let targetIndex = array.length;
  if (beforePointer && String(beforePointer).trim()) {
    if (getParentPointer(beforePointer) !== parentPointer) return false;
    const parsedTarget = Number.parseInt(parsePointer(beforePointer).at(-1), 10);
    if (!Number.isInteger(parsedTarget) || parsedTarget < 0) return false;
    targetIndex = Math.min(parsedTarget, array.length);
  }

  if (targetIndex === currentIndex) return false;

  const adjustedTargetIndex = currentIndex < targetIndex
    ? targetIndex - 1
    : targetIndex;

  const [item] = array.splice(currentIndex, 1);
  array.splice(adjustedTargetIndex, 0, item);
  return true;
}
