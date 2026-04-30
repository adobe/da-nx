/**
 * Check if value is empty.
 * @param {*} value - Value to check
 * @returns {boolean}
 */
export function isEmpty(value) {
  if (value === null || value === undefined || value === '') return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/**
 * Prune empty values recursively; keep schema defaults.
 * @param {*} value - Value to prune
 * @returns {*} Pruned value (undefined for empty; empty branches omitted)
 */
export function pruneRecursive(value) {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  if (Array.isArray(value)) {
    const filtered = value.map(pruneRecursive).filter((item) => !isEmpty(item));
    return filtered.length === 0 ? undefined : filtered;
  }
  if (typeof value === 'object') {
    const result = {};
    for (const [key, propertyValue] of Object.entries(value)) {
      const filtered = pruneRecursive(propertyValue);
      if (filtered !== undefined && !isEmpty(filtered)) result[key] = filtered;
    }
    return Object.keys(result).length === 0 ? undefined : result;
  }
  return value;
}
