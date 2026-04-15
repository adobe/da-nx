/**
 * Shared fetches for Skills Lab (browse full page) and chat panel.
 */

import { DA_ORIGIN } from '../../public/utils/constants.js';
import { daFetch } from '../../utils/daFetch.js';

export function getAgentOrigin() {
  const params = new URLSearchParams(window.location.search);
  const isLocal = params.get('ref') === 'local' || params.get('nx') === 'local';
  return isLocal ? 'http://localhost:4002' : 'https://da-agent.adobeaem.workers.dev';
}

/**
 * POST merged config back (preserves existing sheets; adds/updates mcp-servers).
 * @param {string} org
 * @param {string} site
 * @param {object} fullConfig - complete multi-sheet object from GET
 */
export async function saveDaConfig(org, site, fullConfig) {
  const path = site ? `${org}/${site}` : org;
  const body = new FormData();
  body.append('config', JSON.stringify(fullConfig));
  const resp = await daFetch(`${DA_ORIGIN}/config/${path}/`, { method: 'POST', body });
  return { ok: resp.ok, status: resp.status };
}

/** @type {Map<string, Promise<void>>} */
const inflightConfigBootstrap = new Map();

/**
 * After GET `/config/{org}/{site}/` returned 404, persist `{}` once so the KV key exists.
 * Deduplicated for parallel callers (chat + Skills Lab). If POST is forbidden, no-op.
 */
export async function materializeDaConfigAfter404(org, site) {
  const path = site ? `${org}/${site}` : org;
  let boot = inflightConfigBootstrap.get(path);
  if (!boot) {
    boot = (async () => {
      await saveDaConfig(org, site, {});
    })();
    inflightConfigBootstrap.set(path, boot);
    boot.finally(() => inflightConfigBootstrap.delete(path));
  }
  await boot;
}

/**
 * Load DA multi-sheet config for org/site (same shape as chat `_fetchDaConfig`).
 * @param {string} org
 * @param {string} site
 */
export async function fetchDaConfigSheets(org, site) {
  const path = site ? `${org}/${site}` : org;
  const url = `${DA_ORIGIN}/config/${path}/`;
  try {
    let resp = await daFetch(url);
    if (resp.status === 401) {
      /* Not signed in or local da-admin — treat like empty config for reads. */
      return {
        ok: true,
        json: {},
        mcpRows: [],
        agentRows: [],
        configuredMcpServers: {},
      };
    }
    if (resp.status === 404) {
      await materializeDaConfigAfter404(org, site);
      resp = await daFetch(url);
      if (resp.status === 401) {
        return {
          ok: true,
          json: {},
          mcpRows: [],
          agentRows: [],
          configuredMcpServers: {},
        };
      }
    }
    if (!resp.ok) {
      /* Still missing (e.g. POST 403) or other error — empty sheets for reads. */
      if (resp.status === 404) {
        return {
          ok: true,
          json: {},
          mcpRows: [],
          agentRows: [],
          configuredMcpServers: {},
        };
      }
      return {
        ok: false,
        status: resp.status,
        mcpRows: [],
        agentRows: [],
        configuredMcpServers: {},
      };
    }
    const json = await resp.json();
    const mcpRows = json?.['mcp-servers']?.data || [];
    const servers = {};
    mcpRows.forEach((row) => {
      const rowUrl = row.url || row.value;
      if (row.key && rowUrl) servers[row.key] = rowUrl;
    });
    const agentRows = (json?.agents?.data || [])
      .filter((r) => r.key && (r.url || r.value))
      .map((r) => ({ ...r, url: r.url || r.value }));
    return {
      ok: true,
      json,
      mcpRows,
      configuredMcpServers: servers,
      agentRows,
    };
  } catch {
    return { ok: false, mcpRows: [], agentRows: [], configuredMcpServers: {} };
  }
}

const SKILLS_SHEET_KEY = 'skills';

/**
 * Map `skills` sheet rows to id → markdown (columns: key, content; value/body supported).
 * @param {unknown[]} rows
 * @returns {Record<string, string>}
 */
export function skillsRowsToMap(rows) {
  const out = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const key = String(r.key ?? r.id ?? '')
      .trim()
      .replace(/\.md$/i, '');
    const content = String(r.content ?? r.value ?? r.body ?? '');
    if (key && content) out[key] = content;
  });
  return out;
}

/**
 * Load all skills from the site config `skills` sheet.
 * @param {string} org
 * @param {string} site
 * @returns {Promise<Record<string, string>>}
 */
export async function loadSkillsFromConfig(org, site) {
  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok || !loaded.json) return {};
  const rows = loaded.json[SKILLS_SHEET_KEY]?.data;
  return skillsRowsToMap(rows);
}

/**
 * Create or update one skill row in the `skills` sheet.
 * @param {string} org
 * @param {string} site
 * @param {string} skillId
 * @param {string} content
 */
export async function upsertSkillInConfig(org, site, skillId, content) {
  const trimmedId = String(skillId || '')
    .trim()
    .replace(/\.md$/i, '');
  if (!trimmedId) return { error: 'Skill id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return { error: loaded.status ? `Could not load config (${loaded.status})` : 'Could not load config' };
  }
  const cfg = { ...(loaded.json || {}) };
  if (!cfg[SKILLS_SHEET_KEY]) {
    cfg[SKILLS_SHEET_KEY] = { total: 0, limit: 1000, offset: 0, data: [] };
  }
  const sheet = cfg[SKILLS_SHEET_KEY];
  const data = [...(sheet.data || [])];
  const idx = data.findIndex(
    (r) => String(r.key ?? r.id ?? '')
      .trim()
      .replace(/\.md$/i, '') === trimmedId,
  );
  const row = { key: trimmedId, content };
  if (idx >= 0) data[idx] = { ...data[idx], ...row };
  else data.push(row);
  cfg[SKILLS_SHEET_KEY] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { error: `Save failed (${save.status})` };
  return { status: save.status };
}

/**
 * Remove a skill row from the `skills` sheet.
 */
export async function deleteSkillFromConfig(org, site, skillId) {
  const trimmedId = String(skillId || '')
    .trim()
    .replace(/\.md$/i, '');
  if (!trimmedId) return { error: 'Skill id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return { error: loaded.status ? `Could not load config (${loaded.status})` : 'Could not load config' };
  }

  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg[SKILLS_SHEET_KEY];
  if (!sheet?.data?.length) return { error: 'No skills in config' };

  const data = sheet.data.filter(
    (r) => String(r.key ?? r.id ?? '')
      .trim()
      .replace(/\.md$/i, '') !== trimmedId,
  );
  if (data.length === sheet.data.length) return { error: 'Skill not found' };
  cfg[SKILLS_SHEET_KEY] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { error: `Delete failed (${save.status})` };
  return { status: save.status };
}

const GENERATED_TOOLS_SHEET_KEY = 'generated-tools';

/**
 * @param {unknown[]} rows
 * @returns {Array<Record<string, unknown>>}
 */
function generatedToolRowsToDefs(rows) {
  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const key = String(r.key ?? r.id ?? '')
      .trim();
    const raw = r.content ?? r.value ?? r.body ?? '';
    if (!key || raw === undefined || raw === null || raw === '') return;
    try {
      const def = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (def && typeof def === 'object' && String(def.id || '').trim()) {
        out.push(/** @type {Record<string, unknown>} */ (def));
      }
    } catch {
      /* skip invalid JSON */
    }
  });
  return out;
}

/**
 * Load generated tool definitions from the site config `generated-tools` sheet (JSON per row).
 * @param {string} org
 * @param {string} site
 */
export async function loadGeneratedToolsFromConfig(org, site) {
  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok || !loaded.json) return [];
  const rows = loaded.json[GENERATED_TOOLS_SHEET_KEY]?.data;
  return generatedToolRowsToDefs(rows);
}

/**
 * Create or update one generated tool row (full def JSON in `content`).
 * @param {string} org
 * @param {string} site
 * @param {Record<string, unknown>} def
 */
export async function upsertGeneratedToolInConfig(org, site, def) {
  const id = String(def?.id ?? '')
    .trim();
  if (!id) return { error: 'Tool id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return { error: loaded.status ? `Could not load config (${loaded.status})` : 'Could not load config' };
  }
  const cfg = { ...(loaded.json || {}) };
  if (!cfg[GENERATED_TOOLS_SHEET_KEY]) {
    cfg[GENERATED_TOOLS_SHEET_KEY] = { total: 0, limit: 1000, offset: 0, data: [] };
  }
  const sheet = cfg[GENERATED_TOOLS_SHEET_KEY];
  const data = [...(sheet.data || [])];
  const idx = data.findIndex((r) => String(r.key ?? r.id ?? '')
    .trim() === id);
  const row = { key: id, content: JSON.stringify(def) };
  if (idx >= 0) data[idx] = { ...data[idx], ...row };
  else data.push(row);
  cfg[GENERATED_TOOLS_SHEET_KEY] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { error: `Save failed (${save.status})` };
  return { status: save.status };
}

/**
 * Remove a generated tool row from the `generated-tools` sheet.
 * @param {string} org
 * @param {string} site
 * @param {string} toolId
 */
export async function deleteGeneratedToolFromConfig(org, site, toolId) {
  const trimmedId = String(toolId || '')
    .trim();
  if (!trimmedId) return { error: 'Tool id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return { error: loaded.status ? `Could not load config (${loaded.status})` : 'Could not load config' };
  }

  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg[GENERATED_TOOLS_SHEET_KEY];
  if (!sheet?.data?.length) return { error: 'No generated tools in config' };

  const data = sheet.data.filter(
    (r) => String(r.key ?? r.id ?? '')
      .trim() !== trimmedId,
  );
  if (data.length === sheet.data.length) return { error: 'Tool not found' };
  cfg[GENERATED_TOOLS_SHEET_KEY] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { error: `Delete failed (${save.status})` };
  return { status: save.status };
}

/**
 * Append one MCP server row to config (creates sheet if missing).
 */
export async function registerMcpServer(org, site, key, url) {
  const trimmedKey = String(key || '').trim();
  const trimmedUrl = String(url || '').trim();
  if (!trimmedKey || !trimmedUrl) return { ok: false, error: 'Key and URL required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return { ok: false, error: loaded.status ? `Could not load config (${loaded.status})` : 'Could not load config' };
  }

  const cfg = { ...(loaded.json || {}) };
  if (!cfg['mcp-servers']) {
    cfg['mcp-servers'] = { total: 0, limit: 1000, offset: 0, data: [] };
  }
  const sheet = cfg['mcp-servers'];
  const data = [...(sheet.data || [])];
  const idx = data.findIndex((r) => r.key === trimmedKey);
  const row = { key: trimmedKey, url: trimmedUrl };
  if (idx >= 0) data[idx] = { ...data[idx], ...row };
  else data.push(row);
  cfg['mcp-servers'] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { ok: false, error: `Save failed (${save.status})` };
  return { ok: true };
}

/**
 * @param {Record<string, string>} servers - id -> sse url
 */
export async function fetchMcpToolsFromAgent(servers) {
  const ids = Object.keys(servers || {});
  if (ids.length === 0) return { servers: [] };
  try {
    const resp = await fetch(`${getAgentOrigin()}/mcp-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servers }),
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}

const AGENTS_PATH = '.da/agents';

/** @returns {Promise<Array<{ id: string, preset: object }>>} */
export async function loadAgentPresetsFromRepo(org, site) {
  const out = [];
  try {
    const listPath = `/${org}/${site}/${AGENTS_PATH}`;
    const listResp = await daFetch(`${DA_ORIGIN}/list${listPath}`);
    if (!listResp.ok) return out;
    const json = await listResp.json();
    if (!Array.isArray(json)) return out;
    const jsonFiles = json.filter((item) => item.ext === 'json' || (item.name || '').endsWith('.json'));
    await Promise.all(
      jsonFiles.map(async (item) => {
        const id = (item.name || '').replace(/\.json$/i, '');
        if (!id) return;
        try {
          const src = await daFetch(`${DA_ORIGIN}/source${item.path}`);
          if (!src.ok) return;
          const raw = await src.text();
          const preset = JSON.parse(raw);
          out.push({ id, preset });
        } catch {
          /* skip */
        }
      }),
    );
  } catch {
    /* list/source can fail with 401 / network — empty presets */
  }
  return out;
}

/** Extract tool-like references from skill markdown. */
export function extractToolRefsFromSkillMarkdown(md) {
  const text = String(md || '');
  const found = new Set();
  const mcpRe = /mcp__([a-zA-Z0-9_-]+)__([a-zA-Z0-9_-]+)/g;
  for (const m of text.matchAll(mcpRe)) {
    found.add(`mcp__${m[1]}__${m[2]}`);
  }
  for (const m of text.matchAll(/\b(da_[a-z_]+)\b/g)) {
    found.add(m[1]);
  }
  return [...found];
}
