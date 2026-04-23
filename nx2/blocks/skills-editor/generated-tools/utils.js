import {
  loadGeneratedTools as loadGeneratedToolsFromConfig,
  upsertGeneratedTool as upsertGeneratedToolInConfig,
  deleteGeneratedTool as deleteGeneratedToolFromConfig,
} from '../skills-editor-api.js';
import {
  SEEDED_GENERATED_TOOLS,
  findBestGeneratedTool,
  mergeWithSeededGeneratedTools,
} from './poc-tools.js';

export { SEEDED_GENERATED_TOOLS, findBestGeneratedTool };

export const GENERATED_TOOLS_STORAGE_HINT = 'DA config · generated-tools sheet';

/**
 * List all generated tool definitions for an org/site, merged with seeded tools.
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

export async function saveGeneratedTool(org, site, def) {
  return upsertGeneratedToolInConfig(org, site, def);
}

export async function approveGeneratedTool(org, site, def, approvedBy) {
  const updated = {
    ...def,
    status: 'approved',
    approvedBy,
    approvedAt: new Date().toISOString(),
  };
  return saveGeneratedTool(org, site, updated);
}

export async function deprecateGeneratedTool(org, site, def) {
  const updated = { ...def, status: 'deprecated' };
  return saveGeneratedTool(org, site, updated);
}

export async function deleteGeneratedTool(org, site, id) {
  return deleteGeneratedToolFromConfig(org, site, id);
}

/** @typedef {import('../skills-editor-api.js').GeneratedToolDef} GeneratedToolDef */
