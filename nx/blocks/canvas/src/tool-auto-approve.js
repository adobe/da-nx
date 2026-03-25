/** localStorage key for per-tool auto-approval (agent tool names as sent on the wire). */
export const TOOL_AUTO_APPROVE_STORAGE_KEY = 'da-canvas-chat-tool-auto-approve';

/**
 * @returns {Set<string>}
 */
export function getAutoApprovedTools() {
  try {
    const raw = localStorage.getItem(TOOL_AUTO_APPROVE_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((x) => typeof x === 'string' && x.length > 0));
  } catch {
    return new Set();
  }
}

/**
 * Remember that this tool should be approved without prompting.
 * @param {string} toolName
 */
export function addAutoApprovedTool(toolName) {
  if (typeof toolName !== 'string' || !toolName.trim()) return;
  const set = getAutoApprovedTools();
  set.add(toolName);
  localStorage.setItem(TOOL_AUTO_APPROVE_STORAGE_KEY, JSON.stringify([...set].sort()));
}

/**
 * @param {string} toolName
 * @returns {boolean}
 */
export function isToolAutoApproved(toolName) {
  if (typeof toolName !== 'string' || !toolName) return false;
  return getAutoApprovedTools().has(toolName);
}
