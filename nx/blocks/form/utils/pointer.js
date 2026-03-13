/** RFC 6901 JSON Pointer utilities with no external dependencies. */

/** Escape segment for use in pointer. */
function escapeSegment(segment) {
  if (typeof segment !== 'string') return String(segment);
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Unescape segment from pointer. */
function unescapeSegment(segment) {
  if (typeof segment !== 'string') return segment;
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Parse pointer into segments.
 * @param {string} pointer - RFC 6901 pointer (e.g. "/data/items/0")
 * @returns {string[]} Unescaped segments (empty for root)
 */
export function parsePointer(pointer) {
  if (!pointer || typeof pointer !== 'string') return [];
  const trimmed = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  if (!trimmed) return [];
  return trimmed.split('/').map(unescapeSegment);
}

/**
 * Get parent pointer (pointer without last segment).
 * @param {string} pointer - RFC 6901 pointer (e.g. "/data/items/0")
 * @returns {string} Parent pointer (e.g. "/data/items") or empty string for root
 */
export function getParentPointer(pointer) {
  const segments = parsePointer(pointer);
  if (segments.length <= 1) return '';
  return `/${segments.slice(0, -1).map((s) => escapeSegment(String(s))).join('/')}`;
}

/**
 * Append segment to pointer.
 * @param {string} pointer - Base pointer
 * @param {string|number} segment - Segment to append
 * @returns {string}
 */
export function append(pointer, segment) {
  const normalized = pointer === '' || pointer === '/' ? '' : pointer.replace(/\/$/, '');
  const escaped = escapeSegment(String(segment));
  return normalized ? `${normalized}/${escaped}` : `/${escaped}`;
}

/**
 * Get value at pointer.
 * @param {Object} data - Root object
 * @param {string} pointer - RFC 6901 pointer
 * @returns {*}
 */
export function getValue(data, pointer) {
  const segments = parsePointer(pointer);
  let current = data;
  for (const segment of segments) {
    if (current == null) return undefined;
    current = current[segment];
  }
  return current;
}

/**
 * Get parent and last segment for pointer (traversal only).
 * @param {Object} data - Root object
 * @param {string} pointer - RFC 6901 pointer
 * @returns {{ parent: Object, lastSegment: string } | null}
 */
function getParent(data, pointer) {
  const segments = parsePointer(pointer);
  if (segments.length === 0) return null;
  let current = data;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    if (current == null || !(segment in current)) return null;
    current = current[segment];
  }
  return { parent: current, lastSegment: segments[segments.length - 1] };
}

/**
 * Ensure path to parent exists (create missing intermediates).
 * @param {Object} data - Root object
 * @param {string} pointer - RFC 6901 pointer
 */
function ensurePath(data, pointer) {
  const segments = parsePointer(pointer);
  if (segments.length <= 1) return;
  let current = data;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    const isNextArrayIndex = /^\d+$/.test(String(nextSegment));
    if (!(segment in current)) {
      current[segment] = isNextArrayIndex ? [] : {};
    }
    current = current[segment];
  }
}

/**
 * Set value at pointer (create missing intermediates).
 * @param {Object} data - Root object
 * @param {string} pointer - RFC 6901 pointer
 * @param {*} value - Value to set
 */
export function setValue(data, pointer, value) {
  ensurePath(data, pointer);
  const target = getParent(data, pointer);
  if (!target) return;
  target.parent[target.lastSegment] = value;
}

/**
 * Remove value at pointer.
 * @param {Object} data - Root object
 * @param {string} pointer - RFC 6901 pointer
 * @returns {boolean} True if removed
 */
export function removeValue(data, pointer) {
  const target = getParent(data, pointer);
  if (!target) return false;

  const { parent, lastSegment } = target;
  const index = parseInt(lastSegment, 10);
  const isArrayIndex = Number.isInteger(index) && index >= 0;

  if (Array.isArray(parent) && isArrayIndex && index < parent.length) {
    parent.splice(index, 1);
    return true;
  }
  if (lastSegment in parent) {
    delete parent[lastSegment];
    return true;
  }
  return false;
}

/**
 * Move array item to target index.
 * @param {Object} data - Root object
 * @param {string} pointer - RFC 6901 pointer
 * @param {number} targetIndex - Target index
 * @returns {boolean} True if moved
 */
export function moveToIndex(data, pointer, targetIndex) {
  const parentPointer = getParentPointer(pointer);
  if (!parentPointer) return false;

  const array = getValue(data, parentPointer);
  if (!Array.isArray(array)) return false;

  const segments = parsePointer(pointer);
  const currentIndex = parseInt(segments[segments.length - 1], 10);
  if (!Number.isInteger(targetIndex)
    || targetIndex === currentIndex
    || targetIndex < 0
    || targetIndex >= array.length) {
    return false;
  }

  const [item] = array.splice(currentIndex, 1);
  array.splice(targetIndex, 0, item);
  return true;
}

/**
 * Insert value before the item at pointer.
 * @param {Object} data - Root object
 * @param {string} pointer - RFC 6901 pointer to the item or append position
 * @param {*} value - Value to insert
 * @returns {boolean} True if inserted
 */
export function insertBefore(data, pointer, value) {
  const parentPointer = getParentPointer(pointer);
  if (!parentPointer) return false;

  const segments = parsePointer(pointer);
  const index = parseInt(segments[segments.length - 1], 10);
  if (!Number.isInteger(index) || index < 0) return false;

  let array = getValue(data, parentPointer);
  if (!Array.isArray(array)) {
    array = [];
    setValue(data, parentPointer, array);
  }

  const clampedIndex = Math.max(0, Math.min(index, array.length));
  array.splice(clampedIndex, 0, value);
  return true;
}
