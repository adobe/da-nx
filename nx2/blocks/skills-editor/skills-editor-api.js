/**
 * Data layer for Skills Editor — config sheet CRUD, .md file I/O,
 * MCP / generated-tools / agent-presets, and chat suggestion events.
 *
 * Ported from exp-workspace nx/blocks/browse/skills-lab-api.js,
 * adapted for nx2 imports and the skills-editor naming convention.
 */

import { DA_ORIGIN, daFetch } from '../../utils/daFetch.js';

// ─── agent origin ───────────────────────────────────────────────────────────

export function getAgentOrigin() {
  const params = new URLSearchParams(window.location.search);
  const isLocal = params.get('ref') === 'local' || params.get('nx') === 'local';
  return isLocal ? 'http://localhost:4002' : 'https://da-agent.adobeaem.workers.dev';
}

// ─── chat ↔ skills-editor suggestion (sessionStorage + custom events) ────────

const SKILL_CHAT_PROSE_KEY = 'da-skills-editor-skill-chat-prose';
const SUGGEST_HANDOFF_KEY = 'da-skills-editor-suggestion';

export const DA_SKILLS_EDITOR_SUGGESTION_HANDOFF = 'da-skills-editor-suggestion-handoff';
export const DA_SKILLS_EDITOR_FORM_DISMISS = 'da-skills-editor-form-column-dismiss';
export const DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT = 'da-skills-editor-clear-form-from-chat';
export const DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT = 'da-skills-editor-prompt-add-to-chat';
export const DA_SKILLS_EDITOR_PROMPT_SEND = 'da-skills-editor-prompt-send';

export function setSkillChatProse(text) {
  try {
    if (text && String(text).trim()) sessionStorage.setItem(SKILL_CHAT_PROSE_KEY, String(text));
    else sessionStorage.removeItem(SKILL_CHAT_PROSE_KEY);
  } catch { /* noop */ }
}

export function consumeSkillChatProse() {
  try {
    const t = sessionStorage.getItem(SKILL_CHAT_PROSE_KEY);
    sessionStorage.removeItem(SKILL_CHAT_PROSE_KEY);
    return t && String(t).trim() ? String(t) : '';
  } catch { return ''; }
}

/** @param {{ prose?: string, id?: string, body?: string } | null} payload */
export function setSuggestionHandoff(payload) {
  try {
    if (!payload || typeof payload !== 'object') {
      sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
      return;
    }
    const { prose = '', id = '', body = '' } = payload;
    if (!prose.trim() && !id.trim() && !body.trim()) {
      sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
      return;
    }
    sessionStorage.setItem(SUGGEST_HANDOFF_KEY, JSON.stringify({ prose, id: id.trim(), body }));
  } catch { /* noop */ }
}

/** @returns {{ prose: string, id: string, body: string } | null} */
export function consumeSuggestionHandoff() {
  try {
    const raw = sessionStorage.getItem(SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return { prose: String(o.prose || ''), id: String(o.id || '').trim(), body: String(o.body || '') };
  } catch { return null; }
}

export function clearSuggestionSession() {
  try {
    sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(SKILL_CHAT_PROSE_KEY);
  } catch { /* noop */ }
}

// ─── config sheet helpers ───────────────────────────────────────────────────

function syncConfigMeta(cfg) {
  const names = Object.keys(cfg).filter(
    (k) => !k.startsWith(':') && !k.startsWith('private-') && typeof cfg[k] === 'object',
  );
  if (names.length) {
    cfg[':names'] = names;
    cfg[':type'] = 'multi-sheet';
  }
}

export async function saveDaConfig(org, site, fullConfig) {
  syncConfigMeta(fullConfig);
  const path = site ? `${org}/${site}` : org;
  const body = new FormData();
  body.append('config', JSON.stringify(fullConfig));
  const resp = await daFetch(`${DA_ORIGIN}/config/${path}/`, { method: 'POST', body });
  return { ok: resp.ok, status: resp.status };
}

const inflightBootstrap = new Map();

async function materializeConfigAfter404(org, site) {
  const path = site ? `${org}/${site}` : org;
  let boot = inflightBootstrap.get(path);
  if (!boot) {
    boot = saveDaConfig(org, site, {});
    inflightBootstrap.set(path, boot);
    boot.finally(() => inflightBootstrap.delete(path));
  }
  await boot;
}

const EMPTY_CONFIG = Object.freeze({
  ok: true, json: {}, mcpRows: [], agentRows: [], configuredMcpServers: {},
});

export async function fetchDaConfigSheets(org, site) {
  const path = site ? `${org}/${site}` : org;
  const url = `${DA_ORIGIN}/config/${path}/`;
  try {
    let resp = await daFetch(url);
    if (resp.status === 401) return { ...EMPTY_CONFIG };
    if (resp.status === 404) {
      await materializeConfigAfter404(org, site);
      resp = await daFetch(url);
      if (resp.status === 401) return { ...EMPTY_CONFIG };
    }
    if (!resp.ok) {
      return resp.status === 404
        ? { ...EMPTY_CONFIG }
        : { ok: false, status: resp.status, mcpRows: [], agentRows: [], configuredMcpServers: {} };
    }
    const json = await resp.json();
    const mcpRows = json?.['mcp-servers']?.data || [];
    const servers = {};
    mcpRows.forEach((row) => {
      const rowUrl = row.url || row.value;
      const s = String(row?.status ?? '').trim().toLowerCase();
      const approved = s !== 'draft';
      let enabled = true;
      if (typeof row?.enabled === 'boolean') enabled = row.enabled;
      else if (typeof row?.disabled === 'boolean') enabled = !row.disabled;
      if (row.key && rowUrl && approved && enabled) servers[row.key] = rowUrl;
    });
    const agentRows = (json?.agents?.data || [])
      .filter((r) => r.key && (r.url || r.value))
      .map((r) => ({ ...r, url: r.url || r.value }));
    return { ok: true, json, mcpRows, configuredMcpServers: servers, agentRows };
  } catch {
    return { ok: false, mcpRows: [], agentRows: [], configuredMcpServers: {} };
  }
}

// ─── skills CRUD (config sheet + .md file) ──────────────────────────────────

const SKILLS_SHEET = 'skills';

export function skillRowStatus(row) {
  if (!row || typeof row !== 'object') return 'approved';
  return String(row.status ?? '').trim().toLowerCase() === 'draft' ? 'draft' : 'approved';
}

export function skillRowEnabled(row) {
  if (!row || typeof row !== 'object') return true;
  if (typeof row.enabled === 'boolean') return row.enabled;
  if (typeof row.disabled === 'boolean') return !row.disabled;
  return true;
}

export function skillsRowsToMapAndStatuses(rows) {
  const map = {};
  const statuses = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const key = String(r.key ?? r.id ?? '').trim().replace(/\.md$/i, '');
    const content = String(r.content ?? r.value ?? r.body ?? '');
    if (key && content) {
      map[key] = content;
      statuses[key] = skillRowStatus(r);
    }
  });
  return { map, statuses };
}

/**
 * Load all skill .md files from /.da/skills/ and return them as { id → markdown } map.
 * Merges with config sheet: .md body wins, config status wins.
 */
async function loadSkillsFromMdFiles(org, site) {
  const folder = `/${org}/${site}/.da/skills`;
  try {
    const resp = await daFetch(`${DA_ORIGIN}/list${folder}`);
    if (!resp.ok) return {};
    const payload = await resp.json();
    const items = Array.isArray(payload) ? payload : (payload?.items ?? []);
    const out = {};
    await Promise.all(items.map(async (item) => {
      const ext = String(item?.ext || '').trim().toLowerCase();
      const name = String(item?.name || '').trim();
      if (!name) return;
      if (ext !== 'md' && !name.toLowerCase().endsWith('.md')) return;
      const pathStr = typeof item?.path === 'string' ? item.path.trim() : '';
      let filename;
      if (pathStr) {
        filename = pathStr.split('/').pop();
      } else if (ext === 'md') {
        filename = `${name}.md`;
      } else {
        filename = name;
      }
      const key = filename.replace(/\.md$/i, '').trim();
      if (!key) return;
      const srcPath = pathStr || `${folder}/${filename}`;
      try {
        const r = await daFetch(`${DA_ORIGIN}/source${srcPath}`);
        if (!r.ok) return;
        const text = await r.text();
        if (text) out[key] = text;
      } catch { /* skip */ }
    }));
    return out;
  } catch {
    return {};
  }
}

export async function mergeSkillsWithMdFiles(sheetRows, org, site) {
  const fileMap = await loadSkillsFromMdFiles(org, site);
  const { map: cfgMap, statuses: cfgStatuses } = skillsRowsToMapAndStatuses(sheetRows || []);
  // .md body wins over config body; config status wins
  const mergedMap = { ...cfgMap, ...fileMap };
  const mergedStatuses = { ...cfgStatuses };
  Object.keys(fileMap).forEach((k) => {
    if (!mergedStatuses[k]) mergedStatuses[k] = 'approved';
  });
  return { map: mergedMap, statuses: mergedStatuses };
}

export async function loadSkillsWithStatuses(org, site) {
  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok || !loaded.json) return { map: {}, statuses: {} };
  return mergeSkillsWithMdFiles(loaded.json[SKILLS_SHEET]?.data, org, site);
}

export async function upsertSkillInConfig(org, site, skillId, content, options = {}) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return { error: 'Skill id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) return { error: loaded.status ? `Could not load config (${loaded.status})` : 'Could not load config' };

  const cfg = { ...(loaded.json || {}) };
  if (!cfg[SKILLS_SHEET]) cfg[SKILLS_SHEET] = { total: 0, limit: 1000, offset: 0, data: [] };
  const sheet = cfg[SKILLS_SHEET];
  const data = [...(sheet.data || [])];
  const idx = data.findIndex((r) => String(r.key ?? r.id ?? '').trim().replace(/\.md$/i, '') === id);
  const prev = idx >= 0 ? data[idx] : {};
  const nextStatus = options.status === 'draft' || options.status === 'approved'
    ? options.status : skillRowStatus(prev);
  const row = { ...prev, key: id, content, status: nextStatus };
  if (idx >= 0) data[idx] = row; else data.push(row);
  cfg[SKILLS_SHEET] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  return save.ok ? { status: save.status } : { error: `Save failed (${save.status})` };
}

export async function deleteSkillFromConfig(org, site, skillId) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return { error: 'Skill id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) return { error: loaded.status ? `Could not load config (${loaded.status})` : 'Could not load config' };

  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg[SKILLS_SHEET];
  if (!sheet?.data?.length) return { error: 'No skills in config' };

  const data = sheet.data.filter((r) => String(r.key ?? r.id ?? '').trim().replace(/\.md$/i, '') !== id);
  if (data.length === sheet.data.length) return { error: 'Skill not found' };
  cfg[SKILLS_SHEET] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  return save.ok ? { status: save.status } : { error: `Delete failed (${save.status})` };
}

/** Write skill markdown to .da/skills/{id}.md via DA Admin source API. */
export async function writeSkillMdFile(org, site, skillId, markdown) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return { error: 'Skill id required' };
  const path = `/${org}/${site}/.da/skills/${id}.md`;
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const body = new FormData();
  body.append('data', blob, `${id}.md`);
  const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'PUT', body });
  return { ok: resp.ok, status: resp.status };
}

/** Read skill markdown from .da/skills/{id}.md. */
export async function readSkillMdFile(org, site, skillId) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return { text: '' };
  const path = `/${org}/${site}/.da/skills/${id}.md`;
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`);
    if (!resp.ok) return { text: '' };
    return { text: await resp.text() };
  } catch { return { text: '' }; }
}

/** Delete skill .md file from .da/skills/{id}.md. */
export async function deleteSkillMdFile(org, site, skillId) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return;
  const path = `/${org}/${site}/.da/skills/${id}.md`;
  await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
}

// ─── prompts CRUD ───────────────────────────────────────────────────────────

const PROMPTS_SHEET = 'prompts';

export async function upsertPromptInConfig(org, site, row, options = {}) {
  const title = String(row.title || '').trim();
  const promptText = String(row.prompt || '').trim();
  if (!title || !promptText) return { error: 'Title and prompt are required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) return { error: loaded.status ? `Could not load config (${loaded.status})` : 'Could not load config' };

  const cfg = { ...(loaded.json || {}) };
  if (!cfg[PROMPTS_SHEET]) cfg[PROMPTS_SHEET] = { total: 0, limit: 1000, offset: 0, data: [] };
  const sheet = cfg[PROMPTS_SHEET];
  const data = [...(sheet.data || [])];
  const matchTitle = String(options.originalTitle ?? title).trim();
  const idx = data.findIndex((r) => String(r.title ?? '').trim() === matchTitle);
  const prev = idx >= 0 ? data[idx] : {};
  const nextStatus = options.status === 'draft' || options.status === 'approved'
    ? options.status : skillRowStatus(prev);
  const nextRow = {
    ...prev,
    title,
    prompt: promptText,
    category: row.category !== undefined ? row.category : (prev.category ?? ''),
    icon: row.icon !== undefined ? row.icon : (prev.icon ?? ''),
    status: nextStatus,
  };
  if (idx >= 0) data[idx] = nextRow; else data.push(nextRow);
  cfg[PROMPTS_SHEET] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  return save.ok ? { status: save.status } : { error: `Save failed (${save.status})` };
}

export async function deletePromptFromConfig(org, site, title) {
  const t = String(title || '').trim();
  if (!t) return { error: 'Title required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) return { error: 'Could not load config' };

  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg[PROMPTS_SHEET];
  if (!sheet?.data?.length) return { error: 'No prompts in config' };

  const data = sheet.data.filter((r) => String(r.title ?? '').trim() !== t);
  if (data.length === sheet.data.length) return { error: 'Prompt not found' };
  cfg[PROMPTS_SHEET] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  return save.ok ? { status: save.status } : { error: `Delete failed (${save.status})` };
}

// ─── generated tools ────────────────────────────────────────────────────────

const GEN_TOOLS_SHEET = 'generated-tools';

function generatedToolRowsToDefs(rows) {
  const out = [];
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const raw = r.content ?? r.value ?? r.body ?? '';
    if (!raw) return;
    try {
      const def = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (def && typeof def === 'object' && String(def.id || '').trim()) out.push(def);
    } catch { /* skip */ }
  });
  return out;
}

export async function loadGeneratedTools(org, site) {
  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok || !loaded.json) return [];
  return generatedToolRowsToDefs(loaded.json[GEN_TOOLS_SHEET]?.data);
}

export async function upsertGeneratedTool(org, site, def) {
  const id = String(def?.id ?? '').trim();
  if (!id) return { error: 'Tool id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) return { error: 'Could not load config' };

  const cfg = { ...(loaded.json || {}) };
  if (!cfg[GEN_TOOLS_SHEET]) cfg[GEN_TOOLS_SHEET] = { total: 0, limit: 1000, offset: 0, data: [] };
  const sheet = cfg[GEN_TOOLS_SHEET];
  const data = [...(sheet.data || [])];
  const idx = data.findIndex((r) => String(r.key ?? r.id ?? '').trim() === id);
  const row = { key: id, content: JSON.stringify(def) };
  if (idx >= 0) data[idx] = { ...data[idx], ...row }; else data.push(row);
  cfg[GEN_TOOLS_SHEET] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  return save.ok ? { status: save.status } : { error: `Save failed (${save.status})` };
}

export async function deleteGeneratedTool(org, site, toolId) {
  const id = String(toolId || '').trim();
  if (!id) return { error: 'Tool id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) return { error: 'Could not load config' };

  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg[GEN_TOOLS_SHEET];
  if (!sheet?.data?.length) return { error: 'No generated tools in config' };

  const data = sheet.data.filter((r) => String(r.key ?? r.id ?? '').trim() !== id);
  if (data.length === sheet.data.length) return { error: 'Tool not found' };
  cfg[GEN_TOOLS_SHEET] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  return save.ok ? { status: save.status } : { error: `Delete failed (${save.status})` };
}

export async function setGeneratedToolEnabled(org, site, toolId, enabled) {
  const id = String(toolId || '').trim();
  if (!id) return { ok: false, error: 'Tool id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) return { ok: false, error: 'Could not load config' };

  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg[GEN_TOOLS_SHEET];
  if (!sheet?.data?.length) return { ok: false, error: 'No generated tools' };

  const data = [...sheet.data];
  const idx = data.findIndex((r) => String(r.key ?? r.id ?? '').trim() === id);
  if (idx < 0) return { ok: false, error: 'Tool not found' };

  const raw = data[idx].content ?? data[idx].value ?? '';
  let def;
  try {
    def = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }

  data[idx] = { ...data[idx], key: id, content: JSON.stringify({ ...def, enabled: !!enabled }) };
  cfg[GEN_TOOLS_SHEET] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  return save.ok ? { ok: true } : { ok: false, error: `Save failed (${save.status})` };
}

// ─── MCP servers ────────────────────────────────────────────────────────────

export async function registerMcpServer(org, site, key, url) {
  const k = String(key || '').trim();
  const u = String(url || '').trim();
  if (!k || !u) return { ok: false, error: 'Key and URL required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) return { ok: false, error: 'Could not load config' };

  const cfg = { ...(loaded.json || {}) };
  if (!cfg['mcp-servers']) cfg['mcp-servers'] = { total: 0, limit: 1000, offset: 0, data: [] };
  const sheet = cfg['mcp-servers'];
  const data = [...(sheet.data || [])];
  const idx = data.findIndex((r) => r.key === k);
  const row = { key: k, url: u };
  if (idx >= 0) data[idx] = { ...data[idx], ...row }; else data.push(row);
  cfg['mcp-servers'] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  return save.ok ? { ok: true } : { ok: false, error: `Save failed (${save.status})` };
}

export async function setMcpServerEnabled(org, site, key, enabled) {
  const k = String(key || '').trim();
  if (!k) return { ok: false, error: 'Server id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) return { ok: false, error: 'Could not load config' };

  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg['mcp-servers'];
  if (!sheet?.data?.length) return { ok: false, error: 'No MCP servers' };

  const data = [...sheet.data];
  const idx = data.findIndex((r) => String(r.key || '').trim() === k);
  if (idx < 0) return { ok: false, error: 'Server not found' };
  data[idx] = { ...data[idx], enabled: !!enabled };
  cfg['mcp-servers'] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  return save.ok ? { ok: true } : { ok: false, error: `Save failed (${save.status})` };
}

export async function fetchMcpToolsFromAgent(servers) {
  if (!Object.keys(servers || {}).length) return { servers: [] };
  try {
    const resp = await fetch(`${getAgentOrigin()}/mcp-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servers }),
    });
    return resp.ok ? resp.json() : null;
  } catch { return null; }
}

// ─── agent presets ──────────────────────────────────────────────────────────

const AGENTS_PATH = '.da/agents';

export async function loadAgentPresets(org, site) {
  const out = [];
  try {
    const listResp = await daFetch(`${DA_ORIGIN}/list/${org}/${site}/${AGENTS_PATH}`);
    if (!listResp.ok) return out;
    const json = await listResp.json();
    if (!Array.isArray(json)) return out;
    const jsonFiles = json.filter((item) => item.ext === 'json' || (item.name || '').endsWith('.json'));
    await Promise.all(jsonFiles.map(async (item) => {
      const id = (item.name || '').replace(/\.json$/i, '');
      if (!id) return;
      try {
        const src = await daFetch(`${DA_ORIGIN}/source${item.path}`);
        if (!src.ok) return;
        out.push({ id, preset: JSON.parse(await src.text()) });
      } catch { /* skip */ }
    }));
  } catch { /* noop */ }
  return out;
}

// ─── utilities ──────────────────────────────────────────────────────────────

export function extractToolRefs(md) {
  const text = String(md || '');
  const found = new Set();
  for (const m of text.matchAll(/mcp__([a-zA-Z0-9_-]+)__([a-zA-Z0-9_-]+)/g)) {
    found.add(`mcp__${m[1]}__${m[2]}`);
  }
  for (const m of text.matchAll(/\b(da_[a-z_]+)\b/g)) {
    found.add(m[1]);
  }
  return [...found];
}

/**
 * Fetch site source text by path under site (e.g. /drafts/page.html).
 * Used by the generated-tools "Try it" panel to load live page HTML.
 */
export async function fetchSiteSourceText(org, site, pathUnderSite) {
  const p = String(pathUnderSite || '').replace(/^\//, '');
  if (!p) return { error: 'Path required' };
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source/${org}/${site}/${p}`);
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    return { text: await resp.text() };
  } catch (e) {
    return { error: String(e?.message ?? e) };
  }
}
