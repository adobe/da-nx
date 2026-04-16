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
 * Session copy of assistant text (chat-formatted) when opening Skills Lab
 * from a skill suggestion.
 */
const SKILL_LAB_CHAT_PROSE_KEY = 'da-skills-lab-skill-chat-prose';

/**
 * Stash prose the chat assistant showed (same string passed to `renderMessageContent` there).
 * Skills Lab reads it once on load via `consumeSkillsLabSkillChatProse()`.
 * @param {string} [text]
 */
export function setSkillsLabSkillChatProse(text) {
  try {
    if (text && String(text).trim()) sessionStorage.setItem(SKILL_LAB_CHAT_PROSE_KEY, String(text));
    else sessionStorage.removeItem(SKILL_LAB_CHAT_PROSE_KEY);
  } catch {
    /* ignore */
  }
}

/** @returns {string} */
export function consumeSkillsLabSkillChatProse() {
  try {
    const t = sessionStorage.getItem(SKILL_LAB_CHAT_PROSE_KEY);
    sessionStorage.removeItem(SKILL_LAB_CHAT_PROSE_KEY);
    return t && String(t).trim() ? String(t) : '';
  } catch {
    return '';
  }
}

/** One-shot handoff when chat “Create Skill” opens full Skills Lab (id, body, assistant prose). */
const SKILLS_LAB_SUGGEST_HANDOFF_KEY = 'da-skills-lab-suggest-handoff';

/**
 * Fired when chat stores a handoff but the URL hash is already `#/…/skills-lab` (no hashchange).
 */
export const DA_SKILLS_LAB_SUGGESTION_HANDOFF_EVENT = 'da-skills-lab-suggestion-handoff';

/** Form column Dismiss: clear editor only; chat re-enables “Create Skill”. */
export const DA_SKILLS_LAB_FORM_COLUMN_DISMISS_EVENT = 'da-skills-lab-form-column-dismiss';

/** Chat pattern Dismiss: hide suggestion + clear Skills Lab form. */
export const DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT_EVENT = 'da-skills-lab-clear-form-from-chat';

/** Browse `da-chat`: insert prompt text into the input. Detail: `{ prompt: string }`. */
export const DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT = 'da-skills-lab-prompt-add-to-chat';

/** Browse `da-chat`: send prompt immediately. Detail: `{ prompt: string }`. */
export const DA_SKILLS_LAB_PROMPT_SEND = 'da-skills-lab-prompt-send';

/**
 * @param {{ prose?: string, id?: string, body?: string } | null | undefined} payload
 */
export function setSkillsLabSuggestionHandoff(payload) {
  try {
    if (!payload || typeof payload !== 'object') {
      sessionStorage.removeItem(SKILLS_LAB_SUGGEST_HANDOFF_KEY);
      return;
    }
    const prose = typeof payload.prose === 'string' ? payload.prose : '';
    const id = typeof payload.id === 'string' ? payload.id.trim() : '';
    const body = typeof payload.body === 'string' ? payload.body : '';
    if (!prose.trim() && !id && !body.trim()) {
      sessionStorage.removeItem(SKILLS_LAB_SUGGEST_HANDOFF_KEY);
      return;
    }
    sessionStorage.setItem(
      SKILLS_LAB_SUGGEST_HANDOFF_KEY,
      JSON.stringify({ prose, id, body }),
    );
  } catch {
    /* ignore */
  }
}

/** @returns {{ prose: string, id: string, body: string } | null} */
export function consumeSkillsLabSuggestionHandoff() {
  try {
    const raw = sessionStorage.getItem(SKILLS_LAB_SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(SKILLS_LAB_SUGGEST_HANDOFF_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== 'object') return null;
    return {
      prose: String(o.prose || ''),
      id: String(o.id || '').trim(),
      body: String(o.body || ''),
    };
  } catch {
    return null;
  }
}

/** Clears Skills Lab suggestion handoff and legacy chat-prose session keys. */
export function clearSkillsLabSuggestionSession() {
  try {
    sessionStorage.removeItem(SKILLS_LAB_SUGGEST_HANDOFF_KEY);
    sessionStorage.removeItem(SKILL_LAB_CHAT_PROSE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Rebuild `:names` and `:type` so the config page renders every sheet as a tab.
 * Keys starting with `:` or `private-` are metadata / private and excluded from `:names`.
 */
function syncConfigMeta(cfg) {
  const names = Object.keys(cfg).filter(
    (k) => !k.startsWith(':') && !k.startsWith('private-') && typeof cfg[k] === 'object',
  );
  if (names.length > 1) {
    cfg[':names'] = names;
    cfg[':type'] = 'multi-sheet';
  } else if (names.length === 1) {
    cfg[':names'] = names;
    cfg[':type'] = 'multi-sheet';
  }
}

/**
 * POST merged config back (preserves existing sheets; adds/updates mcp-servers).
 * @param {string} org
 * @param {string} site
 * @param {object} fullConfig - complete multi-sheet object from GET
 */
export async function saveDaConfig(org, site, fullConfig) {
  syncConfigMeta(fullConfig);
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
      const rowStatus = String(row?.status ?? '')
        .trim()
        .toLowerCase();
      const approved = rowStatus !== 'draft';
      let enabled = true;
      if (typeof row?.enabled === 'boolean') {
        enabled = row.enabled;
      } else if (typeof row?.disabled === 'boolean') {
        enabled = !row.disabled;
      }
      if (
        row.key
        && rowUrl
        && approved
        && enabled
      ) {
        servers[row.key] = rowUrl;
      }
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

/** Repo-relative folder for skill markdown (dual storage with KV `skills` sheet). */
const SKILLS_MD_REL = '.da/skills';

/**
 * @param {string} skillId
 * @returns {string}
 */
function sanitizeSkillFilename(skillId) {
  const t = String(skillId || '')
    .trim()
    .replace(/\.md$/i, '');
  if (!t || t.includes('/') || t.includes('..') || t.includes('\\')) return '';
  return t;
}

/**
 * @param {string} org
 * @param {string} site
 * @returns {string}
 */
function skillsMdFolderPath(org, site) {
  const o = String(org || '').trim();
  const s = String(site || '').trim();
  if (!o || !s) return '';
  return `/${o}/${s}/${SKILLS_MD_REL}`;
}

/**
 * @param {string} org
 * @param {string} site
 * @param {string} skillId
 * @returns {string}
 */
function skillMdSourcePath(org, site, skillId) {
  const folder = skillsMdFolderPath(org, site);
  const base = sanitizeSkillFilename(skillId);
  if (!folder || !base) return '';
  return `${folder}/${base}.md`;
}

/**
 * PUT skill body to `/.da/skills/{id}.md` (DA `/source` API).
 * @returns {Promise<{ ok: boolean, status?: number }>}
 */
async function putSkillMdFile(org, site, skillId, content) {
  const path = skillMdSourcePath(org, site, skillId);
  if (!path) return { ok: false, status: 0 };
  const blob = new Blob([String(content ?? '')], { type: 'text/markdown' });
  const body = new FormData();
  body.append('data', blob);
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'PUT', body });
    return { ok: resp.ok, status: resp.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

/**
 * DELETE `/.da/skills/{id}.md` if present (ignore 404).
 */
async function deleteSkillMdFile(org, site, skillId) {
  const path = skillMdSourcePath(org, site, skillId);
  if (!path) return { ok: true };
  try {
    const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'DELETE' });
    if (resp.status === 404) return { ok: true };
    return { ok: resp.ok, status: resp.status };
  } catch {
    return { ok: false };
  }
}

/**
 * Load skills from `.da/skills/*.md` (merged with KV in callers).
 * @returns {Promise<Record<string, string>>}
 */
async function loadSkillsFromMdFiles(org, site) {
  const folder = skillsMdFolderPath(org, site);
  if (!folder) return {};
  try {
    const resp = await daFetch(`${DA_ORIGIN}/list${folder}`);
    if (resp.status === 401 || resp.status === 404) return {};
    if (!resp.ok) return {};
    const payload = await resp.json();
    const items = Array.isArray(payload) ? payload : payload?.items ?? [];
    /** @type {Record<string, string>} */
    const out = {};
    await Promise.all(
      items.map(async (item) => {
        const name = String(item?.name || '').trim();
        if (!name.toLowerCase().endsWith('.md')) return;
        const key = sanitizeSkillFilename(name);
        if (!key) return;
        const filePath = `${folder}/${name}`;
        try {
          const r = await daFetch(`${DA_ORIGIN}/source${filePath}`);
          if (!r.ok) return;
          const text = await r.text();
          if (key && text) out[key] = text;
        } catch {
          /* skip */
        }
      }),
    );
    return out;
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, unknown> | undefined} row
 * @returns {'draft'|'approved'}
 */
export function skillRowStatus(row) {
  if (!row || typeof row !== 'object') return 'approved';
  const s = String(row.status ?? '')
    .trim()
    .toLowerCase();
  if (s === 'draft') return 'draft';
  return 'approved';
}

/**
 * @param {Record<string, unknown> | undefined} row
 * @returns {boolean}
 */
export function skillRowEnabled(row) {
  if (!row || typeof row !== 'object') return true;
  if (typeof row.enabled === 'boolean') return row.enabled;
  if (typeof row.disabled === 'boolean') return !row.disabled;
  return true;
}

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
 * Same rows as the skills sheet, plus id → lifecycle status for admin UI.
 * @param {unknown[]} rows
 * @returns {{ map: Record<string, string>, statuses: Record<string, 'draft'|'approved'> }}
 */
export function skillsRowsToMapAndStatuses(rows) {
  /** @type {Record<string, string>} */
  const map = {};
  /** @type {Record<string, 'draft'|'approved'>} */
  const statuses = {};
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (!r || typeof r !== 'object') return;
    const key = String(r.key ?? r.id ?? '')
      .trim()
      .replace(/\.md$/i, '');
    const content = String(r.content ?? r.value ?? r.body ?? '');
    if (key && content) {
      map[key] = content;
      statuses[key] = skillRowStatus(r);
    }
  });
  return { map, statuses };
}

/**
 * Load all skills from the site config `skills` sheet **and** `/.da/skills/*.md`.
 * Same key in both: file body wins (repo markdown can override KV without deleting KV rows).
 * @param {string} org
 * @param {string} site
 * @returns {Promise<Record<string, string>>}
 */
export async function loadSkillsFromConfig(org, site) {
  const loaded = await fetchDaConfigSheets(org, site);
  const kvMap = (!loaded.ok || !loaded.json)
    ? {}
    : skillsRowsToMap(loaded.json[SKILLS_SHEET_KEY]?.data);
  const fileMap = await loadSkillsFromMdFiles(org, site);
  return { ...kvMap, ...fileMap };
}

/**
 * Skills markdown plus draft/approved flags (for Skills Lab filters).
 * @param {string} org
 * @param {string} site
 * @returns {Promise<{ map: Record<string, string>, statuses: Record<string, 'draft'|'approved'> }>}
 */
export async function loadSkillsFromConfigWithStatuses(org, site) {
  const loaded = await fetchDaConfigSheets(org, site);
  const fileMap = await loadSkillsFromMdFiles(org, site);
  if (!loaded.ok || !loaded.json) {
    /** @type {Record<string, 'draft'|'approved'>} */
    const statuses = {};
    Object.keys(fileMap).forEach((k) => {
      statuses[k] = 'approved';
    });
    return { map: fileMap, statuses };
  }
  const rows = loaded.json[SKILLS_SHEET_KEY]?.data;
  const { map: kvMap, statuses: kvStatuses } = skillsRowsToMapAndStatuses(rows);
  const mergedMap = { ...kvMap, ...fileMap };
  const mergedStatuses = { ...kvStatuses };
  Object.keys(fileMap).forEach((k) => {
    if (!mergedStatuses[k]) mergedStatuses[k] = 'approved';
  });
  return { map: mergedMap, statuses: mergedStatuses };
}

/**
 * Create or update one skill row in the `skills` sheet.
 * @param {string} org
 * @param {string} site
 * @param {string} skillId
 * @param {string} content
 * @param {{ status?: 'draft'|'approved' }} [options]
 */
export async function upsertSkillInConfig(org, site, skillId, content, options = {}) {
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
  const prev = idx >= 0 ? data[idx] : {};
  const nextStatus = options.status === 'draft' || options.status === 'approved'
    ? options.status
    : skillRowStatus(prev);
  const row = { ...prev, key: trimmedId, content, status: nextStatus };
  if (idx >= 0) data[idx] = row;
  else data.push(row);
  cfg[SKILLS_SHEET_KEY] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { error: `Save failed (${save.status})` };
  const filePut = await putSkillMdFile(org, site, trimmedId, content);
  if (!filePut.ok) {
    return {
      status: save.status,
      warning: 'Saved to site config; writing .da/skills/*.md failed — retry save or check permissions.',
      fileStatus: filePut.status,
    };
  }
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
  const sheet = cfg[SKILLS_SHEET_KEY] || { total: 0, limit: 1000, offset: 0, data: [] };
  const existingData = [...(sheet.data || [])];
  const data = existingData.filter(
    (r) => String(r.key ?? r.id ?? '')
      .trim()
      .replace(/\.md$/i, '') !== trimmedId,
  );

  if (data.length === existingData.length) {
    const delFile = await deleteSkillMdFile(org, site, trimmedId);
    if (!delFile.ok) return { error: 'Skill not found in config or under .da/skills' };
    return { status: 200 };
  }

  cfg[SKILLS_SHEET_KEY] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { error: `Delete failed (${save.status})` };
  const delFile = await deleteSkillMdFile(org, site, trimmedId);
  if (!delFile.ok) {
    return {
      status: save.status,
      warning: 'Removed from site config; deleting .da/skills/*.md may have failed.',
    };
  }
  return { status: save.status };
}

const PROMPTS_SHEET_KEY = 'prompts';

/**
 * Create or update one row in the `prompts` sheet.
 * @param {string} org
 * @param {string} site
 * @param {{ title: string, prompt: string, category?: string, icon?: string }} row
 * @param {{ status?: 'draft'|'approved', originalTitle?: string }} [options]
 */
export async function upsertPromptRowInConfig(org, site, row, options = {}) {
  const title = String(row.title || '').trim();
  const promptText = String(row.prompt || '').trim();
  if (!title || !promptText) return { error: 'Title and prompt are required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return { error: loaded.status ? `Could not load config (${loaded.status})` : 'Could not load config' };
  }
  const cfg = { ...(loaded.json || {}) };
  if (!cfg[PROMPTS_SHEET_KEY]) {
    cfg[PROMPTS_SHEET_KEY] = { total: 0, limit: 1000, offset: 0, data: [] };
  }
  const sheet = cfg[PROMPTS_SHEET_KEY];
  const data = [...(sheet.data || [])];
  const matchTitle = String(options.originalTitle ?? title).trim();
  const idx = data.findIndex((r) => String(r.title ?? '').trim() === matchTitle);
  const prev = idx >= 0 ? data[idx] : {};
  const nextStatus = options.status === 'draft' || options.status === 'approved'
    ? options.status
    : skillRowStatus(prev);
  const nextRow = {
    ...prev,
    title,
    prompt: promptText,
    category: row.category !== undefined ? row.category : (prev.category ?? ''),
    icon: row.icon !== undefined ? row.icon : (prev.icon ?? ''),
    status: nextStatus,
  };
  if (idx >= 0) data[idx] = nextRow;
  else data.push(nextRow);
  cfg[PROMPTS_SHEET_KEY] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { error: `Save failed (${save.status})` };
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
 * Set one `mcp-servers` row enabled state without changing draft/approved status.
 * @param {string} org
 * @param {string} site
 * @param {string} key
 * @param {boolean} enabled
 */
export async function setMcpServerEnabledInConfig(org, site, key, enabled) {
  const trimmedKey = String(key || '').trim();
  if (!trimmedKey) return { ok: false, error: 'Server id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return {
      ok: false,
      error: loaded.status ? `Could not load config (${loaded.status})` : 'Could not load config',
    };
  }
  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg['mcp-servers'];
  if (!sheet?.data?.length) return { ok: false, error: 'No MCP servers in config' };

  const data = [...sheet.data];
  const idx = data.findIndex((r) => String(r.key || '').trim() === trimmedKey);
  if (idx < 0) return { ok: false, error: 'MCP server not found' };
  data[idx] = { ...data[idx], enabled: !!enabled };
  cfg['mcp-servers'] = { ...sheet, data, total: data.length };

  const save = await saveDaConfig(org, site, cfg);
  if (!save.ok) return { ok: false, error: `Save failed (${save.status})` };
  return { ok: true };
}

/**
 * Set one generated tool row enabled state without changing lifecycle status.
 * @param {string} org
 * @param {string} site
 * @param {string} toolId
 * @param {boolean} enabled
 */
export async function setGeneratedToolEnabledInConfig(org, site, toolId, enabled) {
  const id = String(toolId || '').trim();
  if (!id) return { ok: false, error: 'Tool id required' };

  const loaded = await fetchDaConfigSheets(org, site);
  if (!loaded.ok) {
    return {
      ok: false,
      error: loaded.status ? `Could not load config (${loaded.status})` : 'Could not load config',
    };
  }
  const cfg = { ...(loaded.json || {}) };
  const sheet = cfg[GENERATED_TOOLS_SHEET_KEY];
  if (!sheet?.data?.length) return { ok: false, error: 'No generated tools in config' };

  const data = [...sheet.data];
  const idx = data.findIndex((r) => String(r.key ?? r.id ?? '').trim() === id);
  if (idx < 0) return { ok: false, error: 'Generated tool not found' };

  const row = data[idx];
  const raw = row.content ?? row.value ?? row.body ?? '';
  let def;
  try {
    def = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return { ok: false, error: 'Generated tool row JSON is invalid' };
  }
  if (!def || typeof def !== 'object') return { ok: false, error: 'Generated tool row is invalid' };

  const nextDef = { ...def, enabled: !!enabled };
  data[idx] = { ...row, key: id, content: JSON.stringify(nextDef) };
  cfg[GENERATED_TOOLS_SHEET_KEY] = { ...sheet, data, total: data.length };

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

/**
 * GET page/source HTML (or any text body) for a path under org/site.
 * @param {string} org
 * @param {string} site
 * @param {string} pathUnderSite - e.g. `drafts/article.html` or `/drafts/article.html`
 * @returns {Promise<{ text?: string, error?: string }>}
 */
export async function fetchSiteSourceText(org, site, pathUnderSite) {
  const o = String(org || '').trim();
  const s = String(site || '').trim();
  let p = String(pathUnderSite || '').trim();
  if (!o || !s || !p) {
    return { error: 'Org, site, and page path are required' };
  }
  if (!p.startsWith('/')) p = `/${p}`;
  const url = `${DA_ORIGIN}/source/${o}/${s}${p}`;
  try {
    const resp = await daFetch(url);
    if (!resp.ok) {
      return { error: `Could not load page (${resp.status})` };
    }
    const text = await resp.text();
    return { text };
  } catch (e) {
    return { error: String(e?.message || e) };
  }
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
