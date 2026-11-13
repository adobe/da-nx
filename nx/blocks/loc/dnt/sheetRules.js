/**
 * Normalizes a document path for rule matching: leading slash, no extension,
 * no trailing slash.
 * @param {string} path - Document path, e.g. `/products/prices.json`.
 * @returns {string} Normalized path, e.g. `/products/prices`.
 */
export function normalizePath(path) {
  const trimmed = path.trim().replace(/\.(json|html)$/, '').replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Splits a `dnt-sheet` value into an optional document path and a tab name.
 * Values starting with `/` are `/path` or `/path:tab`; anything else is a tab name.
 * @param {string} value - Raw `dnt-sheet` cell value.
 * @returns {{ path?: string, sheet: string }} Path (path rules only) and tab name.
 */
export function parseSheetRef(value) {
  if (typeof value !== 'string' || !value.trim().startsWith('/')) return { sheet: value };
  const ref = value.trim();
  const idx = ref.lastIndexOf(':');
  if (idx === -1) return { path: normalizePath(ref), sheet: '*' };
  return { path: normalizePath(ref.slice(0, idx)), sheet: ref.slice(idx + 1).trim() || '*' };
}

/**
 * Tests a language-agnostic document path against a rule path. `*` matches any characters.
 * @param {string} rulePath - Normalized rule path.
 * @param {string} [docPath] - Document path being translated.
 * @returns {boolean} True when the rule applies to the document.
 */
export function matchesPath(rulePath, docPath) {
  if (!docPath) return false;
  const source = rulePath.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${source}$`).test(normalizePath(docPath));
}

/**
 * Merges global sheet rules with the path rules that match one document.
 * @param {Object} dntConfig - Parsed config from `parseConfig`.
 * @param {string} [path] - Language-agnostic document path.
 * @returns {{ sheets: string[], sheetToColumns: Map,
 *   universalColumns: string[], allSheets: boolean }} Effective rules;
 *   `allSheets` is true when every tab is DNT.
 */
export function resolveSheetRules(dntConfig, path) {
  const sheets = [...(dntConfig?.dntSheets || [])];
  const sheetToColumns = new Map(dntConfig?.dntSheetToColumns || []);
  const universalColumns = [...(dntConfig?.dntUniversalColumns || [])];
  let allSheets = sheets.includes('*');

  (dntConfig?.dntPathRules || [])
    .filter((rule) => matchesPath(rule.path, path))
    .forEach(({ sheet, columns }) => {
      if (columns === '*') {
        if (sheet === '*') allSheets = true;
        else sheets.push(sheet);
      } else if (sheet === '*') {
        universalColumns.push(...columns);
      } else {
        sheetToColumns.set(sheet, [...(sheetToColumns.get(sheet) || []), ...columns]);
      }
    });

  return { sheets, sheetToColumns, universalColumns, allSheets };
}
