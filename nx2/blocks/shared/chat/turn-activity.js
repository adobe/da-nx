// Page-level summary of one chat turn, published as CHAT_EVENT.TURN_PROGRESS.
// Each tool call contributes the page paths named in its input; a page's status
// is the most pressing status across every call that touched it.

export const PAGE_STATUS = {
  NEEDS_APPROVAL: 'needs-approval',
  WORKING: 'working',
  FAILED: 'failed',
  REJECTED: 'rejected',
  DONE: 'done',
};

const PRECEDENCE = [
  PAGE_STATUS.NEEDS_APPROVAL,
  PAGE_STATUS.WORKING,
  PAGE_STATUS.FAILED,
  PAGE_STATUS.REJECTED,
  PAGE_STATUS.DONE,
];

const PATH_FIELDS = ['path', 'sourcePath', 'destinationPath'];

let traceSequence = 0;

export function traceChat(step, details = {}) {
  if (new URLSearchParams(window.location.search).get('chat-trace') !== 'true') return;
  traceSequence += 1;
  // Snapshot only explicitly selected metadata, never prompts or raw server payloads.
  // eslint-disable-next-line no-console
  console.log(`[chat-trace #${traceSequence}] ${step}`, JSON.stringify(details));
}

function parseInput(input) {
  if (typeof input !== 'string') return input;
  try {
    return JSON.parse(input);
  } catch {
    traceChat('turn-activity.js.parseInput: invalid JSON; no page paths extracted');
    return undefined;
  }
}

// Listing a folder only finds candidates; it doesn't identify a page to work on.
const isListing = (toolName) => /(^|_)list$/.test(toolName ?? '');

export function toolPaths(toolName, input) {
  traceChat('turn-activity.js.toolPaths: extracting page paths', { toolName });
  if (isListing(toolName)) {
    traceChat('turn-activity.js.toolPaths: skipped folder listing', { toolName });
    return [];
  }
  const args = parseInput(input);
  if (!args || typeof args !== 'object') {
    traceChat('turn-activity.js.toolPaths: no usable input', { toolName });
    return [];
  }
  const paths = PATH_FIELDS
    .map((field) => args[field])
    .filter((value) => typeof value === 'string' && value.trim());
  const uniquePaths = [...new Set(paths)];
  traceChat('turn-activity.js.toolPaths: extracted paths', { toolName, paths: uniquePaths });
  return uniquePaths;
}

/**
 * @param {{ toolName?: string, input?: object|string, status: string }[]} calls
 *   Tool calls in the order they were made, with a PAGE_STATUS each.
 * @returns {{ path: string, status: string }[]} One entry per page, first-seen order.
 */
export function summarizePages(calls) {
  traceChat('turn-activity.js.summarizePages: combining tool calls', { callCount: calls.length });
  const pages = new Map();
  calls.forEach(({ toolName, input, status }) => {
    toolPaths(toolName, input).forEach((path) => {
      const current = pages.get(path);
      if (!current || PRECEDENCE.indexOf(status) < PRECEDENCE.indexOf(current)) {
        pages.set(path, status);
      }
    });
  });
  const summary = [...pages].map(([path, status]) => ({ path, status }));
  traceChat('turn-activity.js.summarizePages: page summary ready', { pages: summary });
  return summary;
}
