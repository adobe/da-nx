/**
 * Pure utilities for parsing and extracting data from Markdown strings.
 * No DOM, no component state, no side effects.
 */

/**
 * Returns the text of the first ATX heading (`# …`) found in a markdown string.
 *
 * @param {string} md
 * @returns {string} heading text, or empty string if none found
 */
export function extractTitle(md) {
  if (!md) return '';
  const match = md.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : '';
}

/**
 * Scans a markdown string for DA tool references and returns a deduplicated
 * array of all tool IDs found.
 *
 * Recognised patterns:
 *   - MCP tools:     `mcp__<serverId>__<toolName>`
 *   - Built-in tools: `da_<toolName>`
 *
 * @param {string} md
 * @returns {string[]}
 */
export function extractToolRefs(md) {
  const text = String(md || '');
  const found = new Set();
  for (const m of text.matchAll(/mcp__([a-zA-Z0-9_-]+)__([a-zA-Z0-9_-]+)/g)) {
    found.add(`mcp__${m[1]}__${m[2]}`);
  }
  for (const m of text.matchAll(/\b(da_[a-z_]+)\b/g)) {
    found.add(m[1]);
  }
  return [...found];
}
