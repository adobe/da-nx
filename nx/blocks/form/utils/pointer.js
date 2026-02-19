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
/**
 * Get parent pointer (one level up).
 * @param {string} pointer - e.g. "/data/metadata/tags/primary"
 * @returns {string|null} Parent pointer, e.g. "/data/metadata/tags", or null if root
 */
export function getParentPointer(pointer) {
  const segments = parsePointer(pointer);
  if (segments.length < 2) return null;
  return `/${segments.slice(0, -1).map((s) => escapeSegment(s)).join('/')}`;
}

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
 * Set value at pointer. Creates missing intermediate objects/arrays.
 * @param {Object} obj - Root object to modify
 * @param {string} pointer - RFC 6901 pointer (e.g. "/data/items/0/name")
 * @param {*} value - Value to set
 */
export function setValueByPointer(obj, pointer, value) {
  const segments = parsePointer(pointer);
  if (segments.length === 0) return;

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

  const lastSeg = segments[segments.length - 1];
  current[lastSeg] = value;
}

/**
 * Remove value at pointer (does not prune).
 *
 * @param {Object} obj - Root object to modify
 * @param {string} pointer - RFC 6901 pointer (e.g. "/data/metadata/tags/primary")
 */
export function removeValueByPointer(obj, pointer) {
  const segments = parsePointer(pointer);
  if (segments.length < 2) return;

  const lastSeg = segments[segments.length - 1];
  let current = obj;
  for (let i = 0; i < segments.length - 2; i += 1) {
    const seg = segments[i];
    if (current == null || !(seg in current)) return;
    current = current[seg];
  }

  const parentKey = segments[segments.length - 2];
  if (current == null || !(parentKey in current)) return;

  const parent = current[parentKey];
  delete parent[lastSeg];
}

/**
 * Prune empty ancestor objects at pointer.
 * Use after removeValueByPointer when the object at pointer may be empty.
 * Stops before removing the root "data" key.
 *
 * @param {Object} obj - Root object to modify
 * @param {string} pointer - Pointer to object that may be empty (e.g. "/data/metadata/tags")
 */
export function pruneEmptyAncestors(obj, pointer) {
  const segments = parsePointer(pointer);
  if (segments.length < 2) return;

  let pathToEmpty = [...segments];
  let emptyObj = getValueByPointer(obj, pointer);
  while (pathToEmpty.length > 1 && emptyObj && Object.keys(emptyObj).length === 0) {
    const keyToDelete = pathToEmpty[pathToEmpty.length - 1];
    if (keyToDelete === 'data') return;
    pathToEmpty = pathToEmpty.slice(0, -1);
    const ancestor = pathToEmpty.length > 0 ? getValueByPointer(obj, `/${pathToEmpty.join('/')}`) : obj;
    if (!ancestor) return;
    delete ancestor[keyToDelete];
    emptyObj = ancestor;
  }
}

/**
 * Remove array item at pointer. Pointer must point to an array element.
 * @param {Object} obj - Root object to modify
 * @param {string} pointer - Pointer to array item (e.g. "/data/items/0")
 * @returns {boolean} True if removed, false otherwise
 */
export function removeArrayItemByPointer(obj, pointer) {
  const segments = parsePointer(pointer);
  if (segments.length < 2) return false;

  const lastSeg = segments[segments.length - 1];
  const index = parseInt(lastSeg, 10);
  if (!Number.isInteger(index) || index < 0) return false;

  const parentSegments = segments.slice(0, -1);
  let current = obj;
  for (let i = 0; i < parentSegments.length - 1; i += 1) {
    const seg = parentSegments[i];
    if (current == null || !(seg in current)) return false;
    current = current[seg];
  }

  const parentKey = parentSegments[parentSegments.length - 1];
  if (current == null || !(parentKey in current) || !Array.isArray(current[parentKey])) return false;

  const array = current[parentKey];
  if (index < 0 || index >= array.length) return false;

  array.splice(index, 1);
  return true;
}
