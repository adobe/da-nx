import { DA_ORIGIN, daFetch } from '../../../../utils/utils.js';

export const GENERATED_TOOLS_BASE_PATH = '/.da/generated-tools';

/**
 * Build the storage path for a generated tool definition.
 * Site-scoped takes priority; falls back to org-scoped on load.
 * @param {string} prefix  e.g. "/org" or "/org/site"
 * @param {string} id      slugified tool id
 */
function toolPath(prefix, id) {
  return `${prefix}${GENERATED_TOOLS_BASE_PATH}/${id}.json`;
}

/**
 * List all generated tool definitions for an org/site.
 * Falls back to org-level if the site path returns nothing.
 * @param {string} org
 * @param {string} [site]
 * @returns {Promise<Array<GeneratedToolDef>>}
 */
export async function loadGeneratedTools(org, site) {
  const orgPath = `/${org}${GENERATED_TOOLS_BASE_PATH}`;
  const sitePath = `/${org}/${site}${GENERATED_TOOLS_BASE_PATH}`;
  const path = site ? sitePath : orgPath;

  let resp = await daFetch(`${DA_ORIGIN}/list${path}`);
  if (!resp.ok && site) resp = await daFetch(`${DA_ORIGIN}/list${orgPath}`);
  if (!resp.ok) return [];

  const json = await resp.json();
  if (!Array.isArray(json)) return [];

  const jsonFiles = json.filter((item) => item.ext === 'json');
  const defs = await Promise.all(jsonFiles.map(async (item) => {
    const defResp = await daFetch(`${DA_ORIGIN}/source${item.path}`);
    if (!defResp.ok) return null;
    try {
      return JSON.parse(await defResp.text());
    } catch {
      return null;
    }
  }));

  return defs.filter(Boolean);
}

/**
 * Save (create or update) a generated tool definition.
 * @param {string} prefix  "/org" or "/org/site"
 * @param {GeneratedToolDef} def
 */
export async function saveGeneratedTool(prefix, def) {
  const path = toolPath(prefix, def.id);
  const body = new FormData();
  const data = new Blob([JSON.stringify(def, null, 2)], { type: 'application/json' });
  body.append('data', data);

  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'POST', body });
  if (!resp.ok) return { error: `Error saving generated tool. Status: ${resp.status}` };
  return { status: resp.status };
}

/**
 * Set the status of a generated tool to "approved".
 * @param {string} prefix
 * @param {GeneratedToolDef} def
 * @param {string} approvedBy  user email or id
 */
export async function approveGeneratedTool(prefix, def, approvedBy) {
  const updated = {
    ...def,
    status: 'approved',
    approvedBy,
    approvedAt: new Date().toISOString(),
  };
  return saveGeneratedTool(prefix, updated);
}

/**
 * Set the status of a generated tool to "deprecated" (reject / disable).
 * @param {string} prefix
 * @param {GeneratedToolDef} def
 */
export async function deprecateGeneratedTool(prefix, def) {
  const updated = { ...def, status: 'deprecated' };
  return saveGeneratedTool(prefix, updated);
}

/**
 * Permanently delete a generated tool definition.
 * @param {string} prefix
 * @param {string} id
 */
export async function deleteGeneratedTool(prefix, id) {
  const path = toolPath(prefix, id);
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
  if (!resp.ok) return { error: `Error deleting generated tool. Status: ${resp.status}` };
  return { status: resp.status };
}

/**
 * Parse a [TOOL_PROPOSAL] block from assistant message text.
 * Expected format (case-insensitive key names):
 *
 *   [TOOL_PROPOSAL]
 *   TOOL_ID: my-tool-id
 *   ---TOOL_DEF_START---
 *   { ...JSON... }
 *   ---TOOL_DEF_END---
 *
 * @param {string} text
 * @returns {{ id: string, def: GeneratedToolDef } | null}
 */
export function parseToolProposal(text) {
  if (!text.includes('[TOOL_PROPOSAL]')) return null;

  const idMatch = text.match(/TOOL_ID:\s*([^\n\r]+)/);
  const defMatch = text.match(/---TOOL_DEF_START---\r?\n([\s\S]*?)\r?\n---TOOL_DEF_END---/);

  if (!idMatch && !defMatch) return null;

  const id = idMatch ? idMatch[1].trim() : 'generated-tool';
  let def = null;
  if (defMatch) {
    try {
      def = JSON.parse(defMatch[1]);
    } catch {
      def = null;
    }
  }

  return { id, def };
}

/**
 * Strip [TOOL_PROPOSAL] metadata from assistant message text for display.
 * @param {string} text
 * @returns {string}
 */
export function stripToolProposalMeta(text) {
  return text
    .replace(/\*?\*?\[TOOL_PROPOSAL\]\*?\*?\s*\n?/g, '')
    .replace(/TOOL_ID:[^\n]*\n?/g, '')
    .replace(/---TOOL_DEF_START---[\s\S]*?---TOOL_DEF_END---\n?/g, '')
    .trim();
}

/**
 * @typedef {Object} GeneratedToolDef
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {'draft'|'approved'|'deprecated'} status
 * @property {'read-only'|'read-write'} capability
 * @property {Object} inputSchema  JSON Schema object
 * @property {Object} implementation  { type: 'da-api-sequence', steps: [...] }
 * @property {string} createdBy  'model' | 'developer'
 * @property {string} createdAt  ISO string
 * @property {string|null} approvedBy
 * @property {string|null} approvedAt
 * @property {string|null} promotedToSkill  skill id if promoted, else null
 */
