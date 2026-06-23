import { TOOL_NAME } from '../constants.js';

// Derives the parent folders affected by a tool call so the file browser can refresh.
export function affectedFolders(toolName, input) {
  const { org, repo } = input ?? {};
  if (!org || !repo) return [];
  const toParent = (path) => {
    const parts = (path ?? '').replace(/^\//, '').split('/').filter(Boolean);
    parts.pop();
    return `/${org}/${repo}${parts.length ? `/${parts.join('/')}` : ''}`;
  };
  if (toolName === TOOL_NAME.CONTENT_MOVE) {
    return [...new Set([toParent(input.sourcePath), toParent(input.destinationPath)])];
  }
  if (toolName === TOOL_NAME.CONTENT_COPY) return [toParent(input.destinationPath)];
  return input.path ? [toParent(input.path)] : [];
}
