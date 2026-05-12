/**
 * Data layer for Skills Editor — config sheet CRUD, .md file I/O,
 * MCP / agent-presets, and chat suggestion events.
 *
 * Ported from exp-workspace nx/blocks/browse/skills-lab-api.js,
 * adapted for nx2 imports and the skills-editor naming convention.
 */

import { DA_ORIGIN, daFetch } from '../../utils/daFetch.js';
import { parseSheetBoolean, normaliseRowKey } from '../../utils/sheet-utils.js';

// ─── agent origin ───────────────────────────────────────────────────────────

export function getAgentOrigin() {
  const params = new URLSearchParams(window.location.search);
  const isLocal = params.get('ref') === 'local' || params.get('nx') === 'local';
  return isLocal ? 'http://localhost:4002' : 'https://da-agent.adobeaem.workers.dev';
}

// ─── lightweight in-memory caches (per org/site) ────────────────────────────

const CACHE_TTL_MS = 15000;
const configCache = new Map();
const inflightConfig = new Map();
const skillMdCache = new Map();
const inflightSkillMd = new Map();

function siteKey(org, site) {
  return site ? `${org}/${site}` : String(org);
}

function getCached(map, key) {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setCached(map, key, value) {
  map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidateConfigCache(org, site) {
  configCache.delete(siteKey(org, site));
  inflightConfig.delete(siteKey(org, site));
}

function invalidateSkillMdCache(org, site) {
  skillMdCache.delete(siteKey(org, site));
  inflightSkillMd.delete(siteKey(org, site));
}

// ─── chat ↔ skills-editor suggestion (sessionStorage + custom events) ────────

const SKILL_CHAT_PROSE_KEY = 'da-skills-editor-skill-chat-prose';
const LEGACY_SKILL_CHAT_PROSE_KEY = 'da-skills-lab-skill-chat-prose';
const SUGGEST_HANDOFF_KEY = 'da-skills-editor-suggestion';
const LEGACY_SUGGEST_HANDOFF_KEY = 'da-skills-lab-suggest-handoff';

export const DA_SKILLS_EDITOR_SUGGESTION_HANDOFF = 'da-skills-editor-suggestion-handoff';
export const DA_SKILLS_EDITOR_FORM_DISMISS = 'da-skills-editor-form-column-dismiss';
export const DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT = 'da-skills-editor-clear-form-from-chat';
export const DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT = 'da-skills-editor-prompt-add-to-chat';
export const DA_SKILLS_EDITOR_PROMPT_SEND = 'da-skills-editor-prompt-send';
export const DA_SKILLS_LAB_SUGGESTION_HANDOFF = 'da-skills-lab-suggestion-handoff';
export const DA_SKILLS_LAB_FORM_DISMISS = 'da-skills-lab-form-column-dismiss';
export const DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT = 'da-skills-lab-clear-form-from-chat';
export const DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT = 'da-skills-lab-prompt-add-to-chat';
export const DA_SKILLS_LAB_PROMPT_SEND = 'da-skills-lab-prompt-send';

export function setSkillChatProse(text) {
  try {
    if (text && String(text).trim()) {
      const prose = String(text);
      sessionStorage.setItem(SKILL_CHAT_PROSE_KEY, prose);
      sessionStorage.setItem(LEGACY_SKILL_CHAT_PROSE_KEY, prose);
    } else {
      sessionStorage.removeItem(SKILL_CHAT_PROSE_KEY);
      sessionStorage.removeItem(LEGACY_SKILL_CHAT_PROSE_KEY);
    }
  } catch { /* noop */ }
}

export function consumeSkillChatProse() {
  try {
    const t = sessionStorage.getItem(SKILL_CHAT_PROSE_KEY)
      || sessionStorage.getItem(LEGACY_SKILL_CHAT_PROSE_KEY);
    sessionStorage.removeItem(SKILL_CHAT_PROSE_KEY);
    sessionStorage.removeItem(LEGACY_SKILL_CHAT_PROSE_KEY);
    return t && String(t).trim() ? String(t) : '';
  } catch { return ''; }
}

/** @param {{ prose?: string, id?: string, body?: string } | null} payload */
export function setSuggestionHandoff(payload) {
  try {
    if (!payload || typeof payload !== 'object') {
      sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
      sessionStorage.removeItem(LEGACY_SUGGEST_HANDOFF_KEY);
      return;
    }
    const { prose = '', id = '', body = '' } = payload;
    if (!prose.trim() && !id.trim() && !body.trim()) {
      sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
      sessionStorage.removeItem(LEGACY_SUGGEST_HANDOFF_KEY);
      return;
    }
    const serialized = JSON.stringify({ prose, id: id.trim(), body });
    sessionStorage.setItem(SUGGEST_HANDOFF_KEY, serialized);
    sessionStorage.setItem(LEGACY_SUGGEST_HANDOFF_KEY, serialized);
  } catch { /* noop */ }
}

/** @returns {{ prose: string, id: string, body: string } | null} */
export function consumeSuggestionHandoff() {
  try {
    const raw = sessionStorage.getItem(SUGGEST_HANDOFF_KEY)
      || sessionStorage.getItem(LEGACY_SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(LEGACY_SUGGEST_HANDOFF_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object') return null;
    return { prose: String(payload.prose || ''), id: String(payload.id || '').trim(), body: String(payload.body || '') };
  } catch { return null; }
}

export function clearSuggestionSession() {
  try {
    sessionStorage.removeItem(SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(LEGACY_SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(SKILL_CHAT_PROSE_KEY);
    sessionStorage.removeItem(LEGACY_SKILL_CHAT_PROSE_KEY);
  } catch { /* noop */ }
}

// ─── config sheet helpers ───────────────────────────────────────────────────

function rowEnabledState(row, defaultEnabled = true) {
  if (!row || typeof row !== 'object') return defaultEnabled;
  const explicitEnabled = parseSheetBoolean(row.enabled);
  if (typeof explicitEnabled === 'boolean') return explicitEnabled;
  const explicitDisabled = parseSheetBoolean(row.disabled);
  if (typeof explicitDisabled === 'boolean') return !explicitDisabled;
  return defaultEnabled;
}

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
  if (resp.ok) invalidateConfigCache(org, site);
  return { ok: resp.ok, status: resp.status };
}

const inflightBootstrap = new Map();

async function materializeConfigAfter404(org, site) {
  const path = site ? `${org}/${site}` : org;
  let boot = inflightBootstrap.get(path);
  if (!boot) {
    boot = saveDaConfig(org, site, {});
    inflightBootstrap.set(path, boot);
    boot.finally(() => inflightBootstrap.delete(path)).catch(() => { /* bootstrap cleanup */ });
  }
  await boot;
}

const EMPTY_CONFIG = Object.freeze({
  ok: true,
  json: {},
  mcpRows: [],
  agentRows: [],
  configuredMcpServers: {},
  configuredMcpServerHeaders: {},
  toolOverrides: {},
});

const TOOL_OVERRIDES_SHEET = 'tool-overrides';

const AUTH_FAIL = {
  ok: false,
  status: 401,
  error: 'Unauthorized',
  mcpRows: [],
  agentRows: [],
  configuredMcpServers: {},
  configuredMcpServerHeaders: {},
  toolOverrides: {},
};

export async function fetchDaConfigSheets(org, site, options = {}) {
  const cacheKey = siteKey(org, site);
  if (!options.force) {
    const cached = getCached(configCache, cacheKey);
    if (cached) return cached;
    const inflight = inflightConfig.get(cacheKey);
    if (inflight) return inflight;
  }

  const path = site ? `${org}/${site}` : org;
  const url = `${DA_ORIGIN}/config/${path}/`;
  const promise = (async () => {
    try {
      let resp = await daFetch(url);
      if (resp.status === 401) return { ...AUTH_FAIL };
      if (resp.status === 404) {
        await materializeConfigAfter404(org, site);
        resp = await daFetch(url);
        if (resp.status === 401) return { ...AUTH_FAIL };
      }

      if (!resp.ok) {
        return resp.status === 404
          ? { ...EMPTY_CONFIG }
          // eslint-disable-next-line max-len
          : {
            ok: false,
            status: resp.status,
            mcpRows: [],
            agentRows: [],
            configuredMcpServers: {},
            configuredMcpServerHeaders: {},
            toolOverrides: {},
          };
      }

      const json = await resp.json();
      const mcpRows = json?.['mcp-servers']?.data || [];
      const servers = {};
      const serverHeaders = {};
      mcpRows.forEach((row) => {
        const rowUrl = row.url || row.value;
        const s = String(row?.status ?? '').trim().toLowerCase();
        const approved = s !== 'draft';
        const enabled = rowEnabledState(row, true);
        const rowKey = String(row?.key || '').trim();
        if (rowKey && rowUrl && approved && enabled) {
          servers[rowKey] = rowUrl;
          const headerName = String(row?.authHeaderName || '').trim();
          const headerValue = String(row?.authHeaderValue || '').trim();
          if (headerName && headerValue) serverHeaders[rowKey] = { [headerName]: headerValue };
        }
      });
      const agentRows = (json?.agents?.data || [])
        .filter((r) => r.key && (r.url || r.value))
        .map((r) => ({ ...r, url: r.url || r.value }));
      const toolOverrides = {};
      (json?.[TOOL_OVERRIDES_SHEET]?.data ?? []).forEach((r) => {
        const rowKey = String(r.key || '').trim();
        if (rowKey) toolOverrides[rowKey] = rowEnabledState(r, true);
      });

      const result = {
        ok: true,
        json,
        mcpRows,
        configuredMcpServers: servers,
        configuredMcpServerHeaders: serverHeaders,
        agentRows,
        toolOverrides,
      };
      setCached(configCache, cacheKey, result);
      return result;
    } catch (err) {
      return {
        ok: false,
        error: String(err?.message ?? err),
        mcpRows: [],
        agentRows: [],
        configuredMcpServers: {},
        configuredMcpServerHeaders: {},
        toolOverrides: {},
      };
    } finally {
      inflightConfig.delete(cacheKey);
    }
  })();
  inflightConfig.set(cacheKey, promise);
  return promise;
}

// ─── generic config sheet mutation helpers ──────────────────────────────────
// Every config sheet mutator follows the same flow:
//   1. fetchDaConfigSheets  2. ensure sheet exists  3. mutate data[]  4. saveDaConfig
// These two helpers centralize that lifecycle and the { ok, error, status } shape.

/**
 * Upsert a row in a config sheet.
 * @param {string} org
 * @param {string} site
 * @param {string} sheetName
 * @param {(row: object) => boolean} matchFn — identifies existing row
 * @param {(prev: object) => object} buildRowFn — receives prev row ({} if new) and returns next row
 * @param {string} label — human-readable name for error messages (e.g. "skill", "prompt")
 */
async function upsertSheetRow(org, site, sheetName, matchFn, buildRowFn, label = 'row') {
  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error || `Could not load config (${loaded.status})` };
  }
  const cfg = { ...(loaded.json || {}) };
  if (!cfg[sheetName]) cfg[sheetName] = { total: 0, limit: 1000, offset: 0, data: [] };
  const sheet = cfg[sheetName];
  const data = [...(sheet.data || [])];
  const idx = data.findIndex(matchFn);
  const prev = idx >= 0 ? data[idx] : {};
  const nextRow = buildRowFn(prev);
  if (idx >= 0) data[idx] = nextRow;
  else data.push(nextRow);
  cfg[sheetName] = { ...sheet, data, total: data.length };
  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { ok: false, error: `${label} save failed (${save.status})` };
  return { ok: true, status: save.status };
}

/**
 * Delete a row from a config sheet.
 * @param {string} org
 * @param {string} site
 * @param {string} sheetName
 * @param {(row: object) => boolean} matchFn — identifies the row to remove
 * @param {string} label
 */
async function deleteSheetRow(org, site, sheetName, matchFn, label = 'row') {
  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error || `Could not load config (${loaded.status})` };
  }
  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg[sheetName];
  if (!sheet?.data?.length) return { ok: false, error: `No ${label}s in config` };
  const data = sheet.data.filter((r) => !matchFn(r));
  if (data.length === sheet.data.length) return { ok: false, error: `${label} not found` };
  cfg[sheetName] = { ...sheet, data, total: data.length };
  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { ok: false, error: `${label} delete failed (${save.status})` };
  return { ok: true, status: save.status };
}

// ─── skills CRUD (config sheet + .md file) ──────────────────────────────────

const SKILLS_SHEET = 'skills';

export function skillRowStatus(row) {
  if (!row || typeof row !== 'object') return 'approved';
  return String(row.status ?? '').trim().toLowerCase() === 'draft' ? 'draft' : 'approved';
}

export function skillRowEnabled(row) {
  return rowEnabledState(row, true);
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
  const cacheKey = siteKey(org, site);
  const cached = getCached(skillMdCache, cacheKey);
  if (cached) return cached;
  const inflight = inflightSkillMd.get(cacheKey);
  if (inflight) return inflight;

  const folder = `/${org}/${site}/.da/skills`;
  const promise = (async () => {
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
        const fileKey = filename.replace(/\.md$/i, '').trim();
        if (!fileKey) return;
        const srcPath = pathStr || `${folder}/${filename}`;
        try {
          const r = await daFetch(`${DA_ORIGIN}/source${srcPath}`);
          if (!r.ok) return;
          const text = await r.text();
          if (text) out[fileKey] = text;
        } catch { /* skip */ }
      }));
      setCached(skillMdCache, cacheKey, out);
      return out;
    } catch {
      return {};
    } finally {
      inflightSkillMd.delete(cacheKey);
    }
  })();
  inflightSkillMd.set(cacheKey, promise);
  return promise;
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

export async function loadSkillsWithStatuses(org, site, loadedConfig = null, options = {}) {
  const loaded = loadedConfig || await fetchDaConfigSheets(org, site);
  if (!loaded.ok || !loaded.json) return { map: {}, statuses: {} };
  if (options.includeMdFiles === false) {
    return skillsRowsToMapAndStatuses(loaded.json[SKILLS_SHEET]?.data);
  }
  return mergeSkillsWithMdFiles(loaded.json[SKILLS_SHEET]?.data, org, site);
}

function skillKeyMatch(id) {
  return (r) => normaliseRowKey(r) === id;
}

/**
 * Bidirectional sync between .da/skills/*.md files and the config `skills` sheet.
 *
 * 1. .md orphans (file exists, no config row) → back-fill config entry
 * 2. Config orphans (config row exists, no .md file) → write .md file
 *
 * This guarantees that every skill is visible to both the editor (reads .md)
 * and the agent/slash commands (reads config sheet).
 *
 * @returns {Promise<{ configBackfilled: string[], filesWritten: string[] }>}
 */
export async function syncOrphanSkillsToConfig(org, site) {
  const [fileMap, loaded] = await Promise.all([
    loadSkillsFromMdFiles(org, site),
    fetchDaConfigSheets(org, site),
  ]);
  if (!loaded.ok) return { configBackfilled: [], filesWritten: [] };

  const cfg = { ...(loaded.json || {}) };
  if (!cfg[SKILLS_SHEET]) cfg[SKILLS_SHEET] = { total: 0, limit: 1000, offset: 0, data: [] };
  const sheet = cfg[SKILLS_SHEET];
  const data = [...(sheet.data || [])];

  const configKeys = new Set(
    data.map((r) => String(r.key ?? r.id ?? '').trim().replace(/\.md$/i, '')),
  );
  const fileKeys = new Set(Object.keys(fileMap));

  // 1. .md files missing from config → add config rows
  const configBackfilled = [...fileKeys].filter((k) => k && !configKeys.has(k));

  // 2. Config rows missing .md files → write files
  const configOnlyIds = [...configKeys].filter((k) => k && !fileKeys.has(k));
  const configOnlyRows = configOnlyIds.map((id) => {
    const row = data.find(
      (r) => String(r.key ?? r.id ?? '').trim().replace(/\.md$/i, '') === id,
    );
    return row ? { id, body: String(row.content ?? row.value ?? row.body ?? '') } : null;
  }).filter((e) => e && e.body.trim());

  // Back-fill config sheet
  if (configBackfilled.length) {
    configBackfilled.forEach((id) => {
      data.push({ key: id, content: fileMap[id], status: 'approved' });
    });
    cfg[SKILLS_SHEET] = { ...sheet, data, total: data.length };
    await saveDaConfig(org, site, cfg);
    invalidateConfigCache(org, site);
  }

  // Write missing .md files (fire-and-forget, don't block load)
  const filesWritten = [];
  await Promise.all(configOnlyRows.map(async ({ id, body }) => {
    // eslint-disable-next-line no-use-before-define
    const result = await writeSkillMdFile(org, site, id, body);
    if (result.ok) filesWritten.push(id);
  }));

  if (filesWritten.length) invalidateSkillMdCache(org, site);

  return { configBackfilled, filesWritten };
}

export async function upsertSkillInConfig(org, site, skillId, content, options = {}) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return { ok: false, error: 'Skill id required' };
  const nextStatus = options.status === 'draft' || options.status === 'approved'
    ? options.status : undefined;
  return upsertSheetRow(
    org,
    site,
    SKILLS_SHEET,
    skillKeyMatch(id),
    (prev) => ({
      ...prev,
      key: id,
      content,
      status: nextStatus ?? skillRowStatus(prev),
    }),
    'Skill',
  );
}

export async function deleteSkillFromConfig(org, site, skillId) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return { ok: false, error: 'Skill id required' };
  return deleteSheetRow(org, site, SKILLS_SHEET, skillKeyMatch(id), 'Skill');
}

/** Write skill markdown to .da/skills/{id}.md via DA Admin source API. */
export async function writeSkillMdFile(org, site, skillId, markdown) {
  const id = String(skillId || '').trim().replace(/\.md$/i, '');
  if (!id) return { ok: false, error: 'Skill id required' };
  const path = `/${org}/${site}/.da/skills/${id}.md`;
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const body = new FormData();
  body.append('data', blob, `${id}.md`);
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'PUT', body });
    if (resp.ok) invalidateSkillMdCache(org, site);
    return { ok: resp.ok, status: resp.status };
  } catch {
    return { ok: false, error: 'Network error writing skill file' };
  }
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
  if (!id) return { ok: false, error: 'Skill id required' };
  const path = `/${org}/${site}/.da/skills/${id}.md`;
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
    // 404 means the file never existed — treat as success so callers don't error
    const ok = resp.ok || resp.status === 404;
    if (ok) invalidateSkillMdCache(org, site);
    return { ok, status: resp.status };
  } catch {
    return { ok: false, error: 'Network error deleting skill file' };
  }
}

// ─── prompts CRUD ───────────────────────────────────────────────────────────

const PROMPTS_SHEET = 'prompts';

export async function upsertPromptInConfig(org, site, row, options = {}) {
  const title = String(row.title || '').trim();
  const promptText = String(row.prompt || '').trim();
  if (!title || !promptText) return { ok: false, error: 'Title and prompt are required' };

  const matchTitle = String(options.originalTitle ?? title).trim();
  const nextStatus = options.status === 'draft' || options.status === 'approved'
    ? options.status : undefined;

  return upsertSheetRow(
    org,
    site,
    PROMPTS_SHEET,
    (r) => String(r.title ?? '').trim() === matchTitle,
    (prev) => ({
      ...prev,
      title,
      prompt: promptText,
      category: row.category !== undefined ? row.category : (prev.category ?? ''),
      icon: row.icon !== undefined ? row.icon : (prev.icon ?? ''),
      status: nextStatus ?? skillRowStatus(prev),
    }),
    'Prompt',
  );
}

export async function deletePromptFromConfig(org, site, title) {
  const titleStr = String(title || '').trim();
  if (!titleStr) return { ok: false, error: 'Title required' };
  return deleteSheetRow(
    org,
    site,
    PROMPTS_SHEET,
    (r) => String(r.title ?? '').trim() === titleStr,
    'Prompt',
  );
}

// ─── tool overrides ─────────────────────────────────────────────────────────

export async function setToolOverride(org, site, serverId, toolName, enabled) {
  const key = `${serverId}/${toolName}`;
  return upsertSheetRow(
    org,
    site,
    TOOL_OVERRIDES_SHEET,
    (r) => String(r.key || '').trim() === key,
    (prev) => ({ ...prev, key, server: serverId, tool: toolName, enabled: !!enabled }),
    'Tool override',
  );
}

export async function deleteToolOverride(org, site, serverId, toolName) {
  const key = `${serverId}/${toolName}`;
  return deleteSheetRow(
    org,
    site,
    TOOL_OVERRIDES_SHEET,
    (r) => String(r.key || '').trim() === key,
    'Tool override',
  );
}

// ─── MCP servers ────────────────────────────────────────────────────────────

const MCP_SHEET = 'mcp-servers';

function mcpKeyMatch(serverKey) {
  return (r) => normaliseRowKey(r) === serverKey;
}

export async function registerMcpServer(
  org,
  site,
  key,
  url,
  description = '',
  authHeaderName = '',
  authHeaderValue = '',
) {
  const serverKey = String(key || '').trim();
  const serverUrl = String(url || '').trim();
  if (!serverKey || !serverUrl) return { ok: false, error: 'Key and URL required' };
  const safeHeaderName = String(authHeaderName || '').trim();
  const safeHeaderValue = String(authHeaderValue || '').trim();
  return upsertSheetRow(
    org,
    site,
    MCP_SHEET,
    mcpKeyMatch(serverKey),
    (prev) => {
      const row = { ...prev, key: serverKey, url: serverUrl };
      if (description) row.description = String(description).trim();
      if (safeHeaderName && safeHeaderValue) {
        row.authHeaderName = safeHeaderName;
        row.authHeaderValue = safeHeaderValue;
      } else {
        delete row.authHeaderName;
        delete row.authHeaderValue;
      }
      return row;
    },
    'MCP server',
  );
}

export async function setMcpServerEnabled(org, site, key, enabled) {
  const serverKey = String(key || '').trim();
  if (!serverKey) return { ok: false, error: 'Server id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) return { ok: false, error: 'Could not load config' };

  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg[MCP_SHEET];
  if (!sheet?.data?.length) return { ok: false, error: 'No MCP servers' };

  const data = [...sheet.data];
  const idx = data.findIndex(mcpKeyMatch(serverKey));
  if (idx < 0) return { ok: false, error: 'Server not found' };
  data[idx] = { ...data[idx], enabled: !!enabled };
  cfg[MCP_SHEET] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  return save.ok ? { ok: true } : { ok: false, error: `Save failed (${save.status})` };
}

export async function deleteMcpServer(org, site, key) {
  const serverKey = String(key || '').trim();
  if (!serverKey) return { ok: false, error: 'Key required' };
  return deleteSheetRow(org, site, MCP_SHEET, mcpKeyMatch(serverKey), 'MCP server');
}

export async function fetchMcpToolsFromAgent(servers, serverHeaders = {}) {
  if (!Object.keys(servers || {}).length) return { servers: [] };
  try {
    const resp = await fetch(`${getAgentOrigin()}/mcp-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ servers, serverHeaders }),
      signal: AbortSignal.timeout(10_000),
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
    const json = await listResp.json().catch(() => null);
    if (!Array.isArray(json)) return out;
    const jsonFiles = json.filter((item) => item.ext === 'json' || (item.name || '').endsWith('.json'));
    await Promise.all(jsonFiles.map(async (item) => {
      const id = (item.name || '').replace(/\.json$/i, '');
      if (!id) return;
      try {
        const src = await daFetch(`${DA_ORIGIN}/source${item.path}`);
        if (!src.ok) return;
        const preset = JSON.parse(await src.text());
        if (preset && typeof preset === 'object') {
          out.push({
            id,
            preset,
            ...preset,
          });
        }
      } catch { /* skip */ }
    }));
  } catch { /* noop */ }
  return out;
}

export async function saveAgentPresetFile(org, site, agentId, preset) {
  const id = String(agentId || '').trim().replace(/\.json$/i, '');
  if (!id) return { ok: false, error: 'Agent id required' };
  const path = `/${org}/${site}/${AGENTS_PATH}/${id}.json`;
  const body = new FormData();
  body.append(
    'data',
    new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }),
    `${id}.json`,
  );
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'POST', body });
    return resp.ok ? { ok: true, status: resp.status } : { ok: false, error: `Save failed (${resp.status})` };
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

// ─── utilities ──────────────────────────────────────────────────────────────

export { extractToolRefs } from '../../utils/markdown.js';

/**
 * Fetch site source text by path under site (e.g. /drafts/page.html).
 * Used by the memory tab to load/display the agent memory file.
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
