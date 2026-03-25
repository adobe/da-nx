/** Agent tool names (wire + legacy UI aliases). */
const CREATE_TOOLS = new Set(['content_create', 'da_create_source']);
const MOVE_TOOLS = new Set(['content_move', 'da_move_content']);
const COPY_TOOLS = new Set(['content_copy', 'da_copy_content']);
const DELETE_TOOLS = new Set(['content_delete', 'da_delete_source']);
const UPDATE_TOOLS = new Set(['content_update', 'da_update_source']);
const READ_TOOLS = new Set(['content_read', 'da_get_source']);
const LIST_TOOLS = new Set(['content_list', 'da_list_sources']);
const VERSION_CREATE_TOOLS = new Set(['content_version_create', 'da_create_version']);
const VERSION_LIST_TOOLS = new Set(['content_version_list', 'da_get_versions']);
const MEDIA_TOOLS = new Set(['content_media', 'da_lookup_media']);
const FRAGMENT_TOOLS = new Set(['content_fragment', 'da_lookup_fragment']);
const UPLOAD_TOOLS = new Set(['content_upload', 'da_upload_media']);
const EDS_PREVIEW_TOOLS = new Set(['content_preview']);
const EDS_PUBLISH_TOOLS = new Set(['content_publish']);
const EDS_UNPREVIEW_TOOLS = new Set(['content_unpreview']);
const EDS_UNPUBLISH_TOOLS = new Set(['content_unpublish']);
const BULK_PREVIEW_TOOLS = new Set(['da_bulk_preview']);
const BULK_PUBLISH_TOOLS = new Set(['da_bulk_publish']);
const BULK_DELETE_TOOLS = new Set(['da_bulk_delete']);

/** Short card title when we have no path-specific header line. */
const TOOL_DISPLAY_TITLE = {
  content_list: 'List folder',
  da_list_sources: 'List folder',
  content_copy: 'Copy file',
  da_copy_content: 'Copy file',
  content_version_create: 'Create version',
  da_create_version: 'Create version',
  content_version_list: 'List versions',
  da_get_versions: 'List versions',
  content_media: 'Lookup media',
  da_lookup_media: 'Lookup media',
  content_fragment: 'Lookup fragment',
  da_lookup_fragment: 'Lookup fragment',
  content_upload: 'Upload media',
  da_upload_media: 'Upload media',
  content_preview: 'EDS preview',
  content_publish: 'EDS publish',
  content_unpreview: 'Remove EDS preview',
  content_unpublish: 'Unpublish from live',
  da_bulk_preview: 'Bulk preview',
  da_bulk_publish: 'Bulk publish',
  da_bulk_delete: 'Bulk remove from live',
  da_get_skill: 'Get skill',
  da_create_skill: 'Save skill',
  da_list_agents: 'List agents',
  da_create_agent: 'Save agent',
};

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

/** EDS tools use org, repo, path (path often starts with /). */
function formatEdsLocation(org, repo, pagePath) {
  const o = str(org).trim();
  const r = str(repo).trim();
  const p = str(pagePath).trim();
  if (!p) return o && r ? `${o}/${r}` : '—';
  const norm = p.startsWith('/') ? p : `/${p}`;
  if (o && r) return `${o}/${r}${norm}`;
  return norm;
}

function formatContentSize(content) {
  if (typeof content !== 'string') return null;
  const n = content.length;
  if (n === 0) return 'Empty';
  if (n < 1024) return `${n} characters`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function base64PayloadSize(b64) {
  if (typeof b64 !== 'string' || !b64) return null;
  const len = b64.length;
  const approxBytes = Math.floor((len * 3) / 4);
  if (approxBytes < 1024) return `~${approxBytes} bytes`;
  return `~${(approxBytes / 1024).toFixed(1)} KB`;
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

function summarizeListOutput(output) {
  if (output === undefined || output === null) return [];
  if (Array.isArray(output)) {
    return [{ label: 'Items', value: `${output.length} entries` }];
  }
  return summarizeOutput(output);
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
 * @returns {string}
 */
function humanizeUnknownToolName(toolName) {
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__').filter(Boolean);
    if (parts.length >= 3) {
      const server = parts[1];
      const t = parts.slice(2).join(' ');
      return `${t} · ${server}`;
    }
    return toolName.replace(/^mcp__/, 'MCP · ');
  }
  return toolName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
  if (TOOL_DISPLAY_TITLE[toolName]) return TOOL_DISPLAY_TITLE[toolName];
  return humanizeUnknownToolName(toolName);
}

/**
 * @param {string} toolName
 * @returns {boolean}
 */
export function isUpdateTool(toolName) {
  return UPDATE_TOOLS.has(toolName);
}

/**
 * @param {string} prefix
 * @param {string} location
 * @returns {{ primary: string, titleAttr: string } | null}
 */
function headerVerbLocation(prefix, location) {
  if (!location || location === '—') return null;
  const titleAttr = `${prefix} ${location}`;
  return { primary: `${prefix} ${truncateMiddle(location)}`, titleAttr };
}

/**
 * @param {string} verbLabel
 * @param {Record<string, unknown>} inObj
 * @returns {{ primary: string, titleAttr: string } | null}
 */
function bulkHeaderParts(verbLabel, inObj) {
  const pages = Array.isArray(inObj.pages) ? inObj.pages : [];
  const n = pages.length;
  if (n === 0) return null;
  const paths = pages.map((p) => str(p)).filter(Boolean);
  const titleAttr = `${verbLabel} · ${paths.join(', ')}`;
  let summary;
  if (n === 1) summary = paths[0] || '1 page';
  else summary = `${n} pages`;
  return {
    primary: `${verbLabel} ${truncateMiddle(summary)}`,
    titleAttr,
  };
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
    return headerVerbLocation('Read', p);
  }

  if (UPDATE_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.path)) return null;
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.path);
    return headerVerbLocation('Update', p);
  }

  if (CREATE_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.path)) return null;
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.path);
    return headerVerbLocation('Create', p);
  }

  if (DELETE_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.path)) return null;
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.path);
    return headerVerbLocation('Delete', p);
  }

  if (MOVE_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.sourcePath) && !nonEmptyPath(inObj.destinationPath)) return null;
    const from = formatRepoPath(inObj.org, inObj.repo, inObj.sourcePath);
    const to = formatRepoPath(inObj.org, inObj.repo, inObj.destinationPath);
    const paths = `${from} → ${to}`;
    if (paths === '— → —') return null;
    return headerVerbLocation('Move', paths);
  }

  if (COPY_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.sourcePath) && !nonEmptyPath(inObj.destinationPath)) return null;
    const from = formatRepoPath(inObj.org, inObj.repo, inObj.sourcePath);
    const to = formatRepoPath(inObj.org, inObj.repo, inObj.destinationPath);
    const paths = `${from} → ${to}`;
    if (paths === '— → —') return null;
    return headerVerbLocation('Copy', paths);
  }

  if (LIST_TOOLS.has(toolName)) {
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.path ?? '');
    return headerVerbLocation('List', p);
  }

  if (VERSION_CREATE_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.path)) return null;
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.path);
    return headerVerbLocation('Version', p);
  }

  if (VERSION_LIST_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.path)) return null;
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.path);
    return headerVerbLocation('Versions', p);
  }

  if (MEDIA_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.mediaPath)) return null;
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.mediaPath);
    return headerVerbLocation('Media', p);
  }

  if (FRAGMENT_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.fragmentPath)) return null;
    const p = formatRepoPath(inObj.org, inObj.repo, inObj.fragmentPath);
    return headerVerbLocation('Fragment', p);
  }

  if (UPLOAD_TOOLS.has(toolName)) {
    if (!nonEmptyPath(inObj.path)) return null;
    let loc = formatRepoPath(inObj.org, inObj.repo, inObj.path);
    const fn = str(inObj.fileName).trim();
    if (fn) loc = `${loc} · ${fn}`;
    return headerVerbLocation('Upload', loc);
  }

  if (EDS_PREVIEW_TOOLS.has(toolName)) {
    const loc = formatEdsLocation(inObj.org, inObj.repo, inObj.path);
    return headerVerbLocation('Preview', loc);
  }
  if (EDS_PUBLISH_TOOLS.has(toolName)) {
    const loc = formatEdsLocation(inObj.org, inObj.repo, inObj.path);
    return headerVerbLocation('Publish', loc);
  }
  if (EDS_UNPREVIEW_TOOLS.has(toolName)) {
    const loc = formatEdsLocation(inObj.org, inObj.repo, inObj.path);
    return headerVerbLocation('Unpreview', loc);
  }
  if (EDS_UNPUBLISH_TOOLS.has(toolName)) {
    const loc = formatEdsLocation(inObj.org, inObj.repo, inObj.path);
    return headerVerbLocation('Unpublish', loc);
  }

  if (BULK_PREVIEW_TOOLS.has(toolName)) {
    return bulkHeaderParts('Bulk preview', inObj);
  }
  if (BULK_PUBLISH_TOOLS.has(toolName)) {
    return bulkHeaderParts('Bulk publish', inObj);
  }
  if (BULK_DELETE_TOOLS.has(toolName)) {
    return bulkHeaderParts('Bulk unpublish', inObj);
  }

  return null;
}

/**
 * @param {unknown} output
 * @returns {{ label: string, value: string }[]}
 */
function summarizeBulkClientOutput(output) {
  if (output === undefined || output === null) return [];
  if (typeof output !== 'object' || output === null) {
    return summarizeOutput(output);
  }
  const o = /** @type {Record<string, unknown>} */ (output);
  if (o.error) return summarizeOutput(output);
  const rows = [];
  if (typeof o.cancelled === 'boolean') {
    rows.push({ label: 'Cancelled', value: o.cancelled ? 'Yes' : 'No' });
  }
  if (typeof o.okCount === 'number') rows.push({ label: 'Succeeded', value: str(o.okCount) });
  if (typeof o.failCount === 'number') rows.push({ label: 'Failed', value: str(o.failCount) });
  if (o.message) rows.push({ label: 'Message', value: str(o.message) });
  if (rows.length === 0) return summarizeOutput(output);
  return rows;
}

/**
 * Human-readable rows for tool cards.
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

  if (COPY_TOOLS.has(toolName)) {
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

  if (LIST_TOOLS.has(toolName)) {
    const inputRows = [
      { label: 'List', value: formatRepoPath(inObj.org, inObj.repo, inObj.path ?? '') },
    ];
    return { inputRows, outputRows: summarizeListOutput(output) };
  }

  if (VERSION_CREATE_TOOLS.has(toolName)) {
    const inputRows = [
      { label: 'File', value: formatRepoPath(inObj.org, inObj.repo, inObj.path) },
    ];
    if (inObj.label) inputRows.push({ label: 'Label', value: str(inObj.label) });
    return { inputRows, outputRows: summarizeOutput(output) };
  }

  if (VERSION_LIST_TOOLS.has(toolName)) {
    const inputRows = [
      { label: 'File', value: formatRepoPath(inObj.org, inObj.repo, inObj.path) },
    ];
    return { inputRows, outputRows: summarizeOutput(output) };
  }

  if (MEDIA_TOOLS.has(toolName)) {
    const inputRows = [
      { label: 'Media', value: formatRepoPath(inObj.org, inObj.repo, inObj.mediaPath) },
    ];
    return { inputRows, outputRows: summarizeOutput(output) };
  }

  if (FRAGMENT_TOOLS.has(toolName)) {
    const inputRows = [
      { label: 'Fragment', value: formatRepoPath(inObj.org, inObj.repo, inObj.fragmentPath) },
    ];
    return { inputRows, outputRows: summarizeOutput(output) };
  }

  if (UPLOAD_TOOLS.has(toolName)) {
    const inputRows = [
      { label: 'Destination', value: formatRepoPath(inObj.org, inObj.repo, inObj.path) },
    ];
    if (inObj.fileName) inputRows.push({ label: 'File name', value: str(inObj.fileName) });
    if (inObj.mimeType) inputRows.push({ label: 'MIME type', value: str(inObj.mimeType) });
    const bsz = base64PayloadSize(inObj.base64Data);
    if (bsz) inputRows.push({ label: 'Payload', value: bsz });
    return { inputRows, outputRows: summarizeOutput(output) };
  }

  if (EDS_PREVIEW_TOOLS.has(toolName) || EDS_PUBLISH_TOOLS.has(toolName)
      || EDS_UNPREVIEW_TOOLS.has(toolName) || EDS_UNPUBLISH_TOOLS.has(toolName)) {
    const inputRows = [
      { label: 'Page', value: formatEdsLocation(inObj.org, inObj.repo, inObj.path) },
    ];
    return { inputRows, outputRows: summarizeOutput(output) };
  }

  if (BULK_PREVIEW_TOOLS.has(toolName) || BULK_PUBLISH_TOOLS.has(toolName)
      || BULK_DELETE_TOOLS.has(toolName)) {
    const pages = Array.isArray(inObj.pages) ? inObj.pages : [];
    const inputRows = [
      { label: 'Pages', value: `${pages.length} selected` },
    ];
    if (pages.length > 0) {
      const preview = pages.slice(0, 8).map((p) => str(p)).join('\n');
      const more = pages.length > 8 ? `\n… +${pages.length - 8} more` : '';
      inputRows.push({ label: 'Paths', value: preview + more });
    }
    return { inputRows, outputRows: summarizeBulkClientOutput(output) };
  }

  return null;
}
