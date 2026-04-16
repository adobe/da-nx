import {
  deleteGeneratedToolFromConfig,
  loadGeneratedToolsFromConfig,
  upsertGeneratedToolInConfig,
} from '../../../browse/skills-lab-api.js';
import {
  SEEDED_GENERATED_TOOLS,
  findBestGeneratedTool,
  mergeWithSeededGeneratedTools,
} from './poc-tools.js';

export { SEEDED_GENERATED_TOOLS, findBestGeneratedTool };

/**
 * Human-readable location for UI copy (storage is DA config `generated-tools` sheet).
 */
export const GENERATED_TOOLS_STORAGE_HINT = 'DA config · generated-tools sheet';

/**
 * List all generated tool definitions for an org/site from config sheets.
 * @param {string} org
 * @param {string} [site]
 * @returns {Promise<Array<GeneratedToolDef>>}
 */
export async function loadGeneratedTools(org, site) {
  try {
    if (!org) return mergeWithSeededGeneratedTools([]);
    const fromConfig = await loadGeneratedToolsFromConfig(org, site);
    return mergeWithSeededGeneratedTools(fromConfig);
  } catch {
    return mergeWithSeededGeneratedTools([]);
  }
}

/**
 * Save (create or update) a generated tool definition in the `generated-tools` config sheet.
 * @param {string} org
 * @param {string} site
 * @param {GeneratedToolDef} def
 */
export async function saveGeneratedTool(org, site, def) {
  return upsertGeneratedToolInConfig(org, site, def);
}

/**
 * Set the status of a generated tool to "approved".
 * @param {string} org
 * @param {string} site
 * @param {GeneratedToolDef} def
 * @param {string} approvedBy  user email or id
 */
export async function approveGeneratedTool(org, site, def, approvedBy) {
  const updated = {
    ...def,
    status: 'approved',
    approvedBy,
    approvedAt: new Date().toISOString(),
  };
  return saveGeneratedTool(org, site, updated);
}

/**
 * Set the status of a generated tool to "deprecated" (reject / disable).
 * @param {string} org
 * @param {string} site
 * @param {GeneratedToolDef} def
 */
export async function deprecateGeneratedTool(org, site, def) {
  const updated = { ...def, status: 'deprecated' };
  return saveGeneratedTool(org, site, updated);
}

/**
 * Permanently delete a generated tool definition from the sheet.
 * @param {string} org
 * @param {string} site
 * @param {string} id
 */
export async function deleteGeneratedTool(org, site, id) {
  return deleteGeneratedToolFromConfig(org, site, id);
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
