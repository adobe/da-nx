/** Agent tool names (wire + legacy UI aliases). */
const CREATE_TOOLS = new Set(['content_create', 'da_create_source']);
const MOVE_TOOLS = new Set(['content_move', 'da_move_content']);
const DELETE_TOOLS = new Set(['content_delete', 'da_delete_source']);
const UPDATE_TOOLS = new Set(['content_update', 'da_update_source']);
const READ_TOOLS = new Set(['content_read', 'da_get_source']);

function str(x) {
  if (x == null) return '';
  return typeof x === 'string' ? x : String(x);
}

/** Max characters in the collapsed card title before middle truncation. */
const HEADER_TITLE_MAX_LEN = 56;

function truncateMiddle(s, max = HEADER_TITLE_MAX_LEN) {
  if (!s) return '';
  if (s.length <= max) return s;
  const elide = '…';
  const inner = max - elide.length;
  const left = Math.ceil(inner / 2);
  const right = Math.floor(inner / 2);
  return `${s.slice(0, left)}${elide}${s.slice(-right)}`;
}

function nonEmptyPath(p) {
  return str(p).trim().length > 0;
}

/** Full path as org/repo/relative */
export function formatRepoPath(org, repo, relativePath) {
  const o = str(org).trim();
  const r = str(repo).trim();
  const p = str(relativePath).trim().replace(/^\/+/, '');
  if (!o && !r) return p || '—';
  return p ? `${o}/${r}/${p}` : `${o}/${r}`;
}

function formatContentSize(content) {
  if (typeof content !== 'string') return null;
  const n = content.length;
  if (n === 0) return 'Empty';
  if (n < 1024) return `${n} characters`;
  return `${(n / 1024).toFixed(1)} KB`;
}

/**
 * @param {unknown} output
 * @returns {{ label: string, value: string }[]}
 */
function summarizeOutput(output) {
  if (output === undefined || output === null) return [];

  if (typeof output !== 'object' || output === null) {
    return [{ label: 'Result', value: str(output) }];
  }

  if ('error' in output) {
    const err = /** @type {{ error?: unknown }} */ (output).error;
    const msg = typeof err === 'string' ? err : JSON.stringify(err);
    return [{ label: 'Error', value: msg }];
  }

  const o = /** @type {{ success?: boolean, message?: string, path?: string }} */ (output);
  if (o.success === false) {
    return [{ label: 'Status', value: str(o.message) || 'Failed' }];
  }

  const rows = [];
  if (o.path) rows.push({ label: 'Path', value: str(o.path) });
  if (o.message) rows.push({ label: 'Message', value: str(o.message) });
  if (rows.length === 0 && o.success === true) {
    rows.push({ label: 'Status', value: 'Succeeded' });
  }
  if (rows.length === 0) {
    rows.push({ label: 'Details', value: JSON.stringify(output) });
  }
  return rows;
}

/**
 * Successful read returns { path, content, ... }; never show raw HTML in the card.
 * @param {unknown} output
 * @returns {{ label: string, value: string }[]}
 */
function summarizeReadOutput(output) {
  if (output === undefined || output === null) return [];

  if (typeof output !== 'object' || output === null) {
    return [{ label: 'Result', value: str(output) }];
  }

  if ('error' in output) {
    const err = /** @type {{ error?: unknown }} */ (output).error;
    const msg = typeof err === 'string' ? err : JSON.stringify(err);
    return [{ label: 'Error', value: msg }];
  }

  const o = /** @type {Record<string, unknown>} */ (output);
  if (typeof o.content === 'string') {
    const rows = [];
    if (o.path) rows.push({ label: 'File', value: str(o.path) });
    const size = formatContentSize(o.content);
    if (size) rows.push({ label: 'Size', value: size });
    if (o.contentType) rows.push({ label: 'Content type', value: str(o.contentType) });
    if (o.lastModified) rows.push({ label: 'Last modified', value: str(o.lastModified) });
    if (o.source === 'collab') {
      rows.push({ label: 'Source', value: 'Live document from editor' });
    }
    return rows;
  }

  return summarizeOutput(output);
}

/**
 * @param {string} toolName
 * @returns {string | null} Short label for the card header, or null to use raw tool name.
 */
export function getToolDisplayTitle(toolName) {
  if (CREATE_TOOLS.has(toolName)) return 'Create file';
  if (MOVE_TOOLS.has(toolName)) return 'Move file';
  if (DELETE_TOOLS.has(toolName)) return 'Delete file';
  if (UPDATE_TOOLS.has(toolName)) return 'Update file';
  if (READ_TOOLS.has(toolName)) return 'Read file';
  return null;
}

/**
 * @param {string} toolName
 * @returns {boolean}
 */
export function isUpdateTool(toolName) {
  return UPDATE_TOOLS.has(toolName);
}

/**
 * Collapsed card title: verb + org/repo/path (path middle-truncated).
 * `titleAttr` is the full line for hover.
 * @param {string} toolName
 * @param {unknown} input
 * @returns {{ primary: string, titleAttr: string } | null}
 */
export function getToolCardHeaderParts(toolName, input) {
  const inObj = input && typeof input === 'object' ? /** @type {Record<string, unknown>} */ (input) : {};

  if (READ_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.path)) return null;
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.path);
    if (!p || p === '—') return null;
    const titleAttr = `Read ${p}`;
    return { primary: `Read ${truncateMiddle(p)}`, titleAttr };
  }

  if (UPDATE_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.path)) return null;
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.path);
    if (!p || p === '—') return null;
    const titleAttr = `Update ${p}`;
    return { primary: `Update ${truncateMiddle(p)}`, titleAttr };
  }

  if (CREATE_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.path)) return null;
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.path);
    if (!p || p === '—') return null;
    const titleAttr = `Create ${p}`;
    return { primary: `Create ${truncateMiddle(p)}`, titleAttr };
  }

  if (DELETE_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.path)) return null;
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.path);
    if (!p || p === '—') return null;
    const titleAttr = `Delete ${p}`;
    return { primary: `Delete ${truncateMiddle(p)}`, titleAttr };
  }

  if (MOVE_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.sourcePath) && !nonEmptyPath(inObj.destinationPath)) return null;
    const from = formatRepoPath(inObj.org, inObj.repo, inObj.sourcePath);
    const to = formatRepoPath(inObj.org, inObj.repo, inObj.destinationPath);
    const paths = `${from} → ${to}`;
    if (paths === '— → —') return null;
    const titleAttr = `Move ${paths}`;
    return { primary: `Move ${truncateMiddle(paths)}`, titleAttr };
  }

  return null;
}

/**
 * Human-readable rows for create / move / delete / update tool cards.
 * @param {string} toolName
 * @param {unknown} input
 * @param {unknown} output
 * @param {{ updateApprovalOnly?: boolean }} [options] When true for content update, only file +
 *   humanReadableSummary (approval UI).
 * @returns {object | null} `{ inputRows, outputRows }` row arrays, or null.
 */
export function getFriendlyToolDetails(toolName, input, output, options = {}) {
  const { updateApprovalOnly = false } = options;
  const inObj = input && typeof input === 'object' ? /** @type {Record<string, unknown>} */ (input) : {};

  if (UPDATE_TOOLS.has(toolName)) {
    if (updateApprovalOnly) {
      const summary = str(inObj.humanReadableSummary).trim();
      return {
        inputRows: [
          { label: 'File', value: formatRepoPath(inObj.org, inObj.repo, inObj.path) },
          { label: 'Summary of changes', value: summary || '—' },
        ],
        outputRows: [],
      };
    }
    const inputRows = [
      { label: 'Update', value: formatRepoPath(inObj.org, inObj.repo, inObj.path) },
    ];
    const size = formatContentSize(inObj.content);
    if (size) inputRows.push({ label: 'Content size', value: size });
    const sum = str(inObj.humanReadableSummary).trim();
    if (sum) inputRows.push({ label: 'Summary of changes', value: sum });
    if (inObj.contentType) inputRows.push({ label: 'Content type', value: str(inObj.contentType) });
    return { inputRows, outputRows: summarizeOutput(output) };
  }

  if (CREATE_TOOLS.has(toolName)) {
    const inputRows = [
      { label: 'Create at', value: formatRepoPath(inObj.org, inObj.repo, inObj.path) },
    ];
    const size = formatContentSize(inObj.content);
    if (size) inputRows.push({ label: 'Content size', value: size });
    if (inObj.contentType) inputRows.push({ label: 'Content type', value: str(inObj.contentType) });
    return { inputRows, outputRows: summarizeOutput(output) };
  }

  if (MOVE_TOOLS.has(toolName)) {
    const inputRows = [
      { label: 'From', value: formatRepoPath(inObj.org, inObj.repo, inObj.sourcePath) },
      { label: 'To', value: formatRepoPath(inObj.org, inObj.repo, inObj.destinationPath) },
    ];
    return { inputRows, outputRows: summarizeOutput(output) };
  }

  if (DELETE_TOOLS.has(toolName)) {
    const inputRows = [
      { label: 'Delete', value: formatRepoPath(inObj.org, inObj.repo, inObj.path) },
    ];
    return { inputRows, outputRows: summarizeOutput(output) };
  }

  if (READ_TOOLS.has(toolName)) {
    const inputRows = [
      { label: 'Read', value: formatRepoPath(inObj.org, inObj.repo, inObj.path) },
    ];
    return { inputRows, outputRows: summarizeReadOutput(output) };
  }

  return null;
}
