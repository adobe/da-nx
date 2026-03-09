/**
 * RFC 6901 JSON Pointer utilities.
 * No external dependencies — manual implementation.
 */

/** Escape a segment for use in a pointer. ~ → ~0, / → ~1 */
function escapeSegment(segment) {
  if (typeof segment !== 'string') return String(segment);
  return segment.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Unescape a segment. ~1 → /, ~0 → ~ (order matters) */
function unescapeSegment(segment) {
  if (typeof segment !== 'string') return segment;
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Parse a pointer into segments. /data/items/0 → ['data', 'items', '0']
 * @param {string} pointer - RFC 6901 pointer (e.g. "/data/items/0")
 * @returns {string[]} Unescaped segments (empty array for root)
 */
function parsePointer(pointer) {
  if (!pointer || typeof pointer !== 'string') return [];
  const trimmed = pointer.startsWith('/') ? pointer.slice(1) : pointer;
  if (!trimmed) return [];
  return trimmed.split('/').map(unescapeSegment);
}

/**
 * Append a segment to a pointer.
 * @param {string} pointer - Base pointer (e.g. "/data")
 * @param {string|number} segment - Segment to append (e.g. "items" or 0)
 * @returns {string} New pointer (e.g. "/data/items")
 */
export function append(pointer, segment) {
  const normalized = pointer === '' || pointer === '/' ? '' : pointer.replace(/\/$/, '');
  const escaped = escapeSegment(String(segment));
  return normalized ? `${normalized}/${escaped}` : `/${escaped}`;
}

/**
 * Get value at pointer in object.
 * @param {Object} obj - Root object
 * @param {string} pointer - RFC 6901 pointer (e.g. "/data/items/0/name")
 * @returns {*} Value at path, or undefined
 */
export function getValueByPointer(obj, pointer) {
  const segments = parsePointer(pointer);
  let current = obj;
  for (const seg of segments) {
    if (current == null) return undefined;
    current = current[seg];
  }
  return current;
}

/**
 * Get parent object and last segment for pointer. Pure traversal, no creation.
 * @param {Object} obj - Root object
 * @param {string} pointer - RFC 6901 pointer (e.g. "/data/items/0/name")
 * @returns {{ parent: Object, lastSeg: string } | null} Parent and lastSeg, or null
 */
function getParentForPointer(obj, pointer) {
  const segments = parsePointer(pointer);
  if (segments.length === 0) return null;
  let current = obj;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    if (current == null || !(seg in current)) return null;
    current = current[seg];
  }
  return { parent: current, lastSeg: segments[segments.length - 1] };
}

/**
 * Ensure path to parent exists. Creates missing intermediates.
 * @param {Object} obj - Root object
 * @param {string} pointer - RFC 6901 pointer (e.g. "/data/items/0/name")
 */
function ensurePathToParent(obj, pointer) {
  const segments = parsePointer(pointer);
  if (segments.length <= 1) return;
  let current = obj;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    const nextSeg = segments[i + 1];
    const isNextArrayIndex = /^\d+$/.test(String(nextSeg));
    if (!(seg in current)) {
      current[seg] = isNextArrayIndex ? [] : {};
    }
    current = current[seg];
  }
}

/**
 * Set value at pointer. Creates missing intermediate objects/arrays.
 * @param {Object} obj - Root object to modify
 * @param {string} pointer - RFC 6901 pointer (e.g. "/data/items/0/name")
 * @param {*} value - Value to set
 */
export function setValueByPointer(obj, pointer, value) {
  ensurePathToParent(obj, pointer);
  const target = getParentForPointer(obj, pointer);
  if (!target) return;
  target.parent[target.lastSeg] = value;
}

/**
 * Remove value at pointer.
 * @param {Object} obj - Root object to modify
 * @param {string} pointer - RFC 6901 pointer (e.g. "/data/items/0/name" or "/data/items/0")
 * @returns {boolean} True if removed, false if path did not exist
 */
export function removeValueByPointer(obj, pointer) {
  const target = getParentForPointer(obj, pointer);
  if (!target) return false;

  const { parent, lastSeg } = target;
  const index = parseInt(lastSeg, 10);
  const isArrayIndex = Number.isInteger(index) && index >= 0;

  if (Array.isArray(parent) && isArrayIndex && index < parent.length) {
    parent.splice(index, 1);
    return true;
  }
  if (lastSeg in parent) {
    delete parent[lastSeg];
    return true;
  }
  return false;
}
