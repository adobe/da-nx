/**
 * Pure utilities for working with DA config sheet row objects.
 * No DOM, no component state, no side effects.
 */

/**
 * Normalises a config sheet row's key to a canonical string.
 * Falls back from `key` → `id` → empty string, strips a trailing `.md` extension,
 * and trims whitespace.
 *
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
export function normaliseRowKey(row) {
  return String(row?.key ?? row?.id ?? '').trim().replace(/\.md$/i, '');
}

/**
 * Coerces a config sheet cell value to a boolean.
 * Spreadsheets often store booleans as the strings 'true'/'false', '1'/'0',
 * or 'yes'/'no'. Actual JS booleans are returned as-is.
 *
 * @param {unknown} value
 * @param {boolean|undefined} [fallback] - returned when value cannot be coerced
 * @returns {boolean|undefined}
 */
export function parseSheetBoolean(value, fallback = undefined) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
  }
  return fallback;
}
