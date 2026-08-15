/**
 * MCP-backed tools are announced by da-agent under their fully-qualified
 * `mcp__<server>__<tool>` identifier rather than a short name. Resolving to
 * the short name here keeps renderer comparisons stable across MCP server
 * renames instead of hardcoding a specific server segment.
 */
export function mcpToolName(toolName) {
  if (!toolName?.startsWith('mcp__')) return toolName;
  const separatorIndex = toolName.lastIndexOf('__');
  return separatorIndex === -1 ? toolName : toolName.slice(separatorIndex + 2);
}
