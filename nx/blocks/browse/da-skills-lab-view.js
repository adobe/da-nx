// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';
import { getConfig } from '../../scripts/nexter.js';
import { DA_ORIGIN } from '../../public/utils/constants.js';
import { daFetch } from '../../utils/daFetch.js';
import { saveSkill, deleteSkill } from '../skills-editor/utils/utils.js';
import { loadGeneratedTools } from '../canvas/src/generated-tools/utils.js';
import '../canvas/src/generated-tools/generated-tools.js';
import {
  consumeSkillsLabSuggestionHandoff,
  DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT_EVENT,
  DA_SKILLS_LAB_FORM_COLUMN_DISMISS_EVENT,
  DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT,
  DA_SKILLS_LAB_PROMPT_SEND,
  DA_SKILLS_LAB_SUGGESTION_HANDOFF_EVENT,
  extractToolRefsFromSkillMarkdown,
  fetchDaConfigSheets,
  fetchMcpToolsFromAgent,
  loadAgentPresetsFromRepo,
  registerMcpServer,
  skillRowStatus,
  skillsRowsToMapAndStatuses,
  upsertPromptRowInConfig,
} from './skills-lab-api.js';

const BANNER_KEY = 'da-skills-lab-banner-text';

const BUILTIN_TOOLS = [
  { id: 'da_list_sources', label: 'List sources', group: 'DA Tools' },
  { id: 'da_get_source', label: 'Get source', group: 'DA Tools' },
  { id: 'da_create_source', label: 'Create source', group: 'DA Tools' },
  { id: 'da_update_source', label: 'Update source', group: 'DA Tools' },
  { id: 'da_delete_source', label: 'Delete source', group: 'DA Tools' },
  { id: 'da_copy_content', label: 'Copy content', group: 'DA Tools' },
  { id: 'da_move_content', label: 'Move content', group: 'DA Tools' },
  { id: 'da_create_version', label: 'Create version', group: 'DA Tools' },
  { id: 'da_get_versions', label: 'Get versions', group: 'DA Tools' },
  { id: 'da_lookup_media', label: 'Lookup media', group: 'DA Tools' },
  { id: 'da_lookup_fragment', label: 'Lookup fragment', group: 'DA Tools' },
  { id: 'da_upload_media', label: 'Upload media', group: 'DA Tools' },
  { id: 'da_get_skill', label: 'Get skill', group: 'Skills & Agents' },
  { id: 'da_create_skill', label: 'Create skill', group: 'Skills & Agents' },
  { id: 'da_list_agents', label: 'List agents', group: 'Skills & Agents' },
  { id: 'da_create_agent', label: 'Create agent', group: 'Skills & Agents' },
];

const BUILTIN_MCP_SERVERS = [
  {
    id: 'da-tools',
    description: 'Core DA authoring tools — read, write, list, copy, and manage content',
    transport: 'built-in',
  },
  {
    id: 'eds-preview',
    description: 'Preview and publish content to Edge Delivery Services',
    transport: 'built-in',
  },
];

const BUILTIN_AGENTS = [
  {
    id: 'da-assistant',
    name: 'DA Assistant',
    description: 'Default content authoring assistant with full DA tooling',
    mcpServers: ['da-tools', 'eds-preview'],
    builtin: true,
  },
];

/** @param {{ builtin?: boolean, mcpServers?: string[] }} spec */
function agentToolIds(spec, mcpPayload) {
  if (spec.builtin) {
    const ids = new Set(BUILTIN_TOOLS.map((t) => t.id));
    const servers = mcpPayload?.servers || [];
    servers.forEach((s) => {
      if (spec.mcpServers?.includes(s.id) && s.tools) {
        s.tools.forEach((t) => ids.add(`mcp__${s.id}__${t.name}`));
      }
    });
    return [...ids];
  }
  const ids = new Set();
  (spec.mcpServers || []).forEach((sid) => {
    const srv = (mcpPayload?.servers || []).find((x) => x.id === sid);
    if (srv?.tools) {
      srv.tools.forEach((t) => ids.add(`mcp__${sid}__${t.name}`));
    }
  });
  BUILTIN_TOOLS.forEach((t) => ids.add(t.id));
  return [...ids];
}

const style = await getStyle(import.meta.url);

/**
 * Full-page Skills Lab: catalog of agents, skills, MCP servers, tools with cross-links.
 * @customElement da-skills-lab-view
 */
class DaSkillsLabView extends LitElement {
  static properties = {
    org: { type: String },
    site: { type: String },
    _loading: { state: true },
    _error: { state: true },
    _skills: { state: true },
    _mcpRows: { state: true },
    _agentRows: { state: true },
    _customAgents: { state: true },
    _mcpToolsPayload: { state: true },
    _generatedTools: { state: true },
    _capSel: { state: true },
    _toolSel: { state: true },
    _bannerText: { state: true },
    _registerKey: { state: true },
    _registerUrl: { state: true },
    _registerBusy: { state: true },
    /** When set, Register form is updating this MCP row (button shows Update). */
    _editingMcpKey: { state: true },
    _newSkillId: { state: true },
    _newSkillBody: { state: true },
    /** When set, the Skills Editor is updating this skill id (id field is read-only). */
    _editingSkillId: { state: true },
    _skillSaveBusy: { state: true },
    /** @type {Record<string, 'draft'|'approved'>} */
    _skillStatuses: { state: true },
    /** Prompts sheet rows for catalog tab */
    _promptRows: { state: true },
    /** Fourth column: skills | agents | prompts | mcp */
    _catalogTab: { state: true },
    /** Catalog filter: all | draft | approved */
    _catalogFilter: { state: true },
    /** Tools column: generated | available */
    _toolsTab: { state: true },
    /** True after chat “Create Skill” handoff until dismiss, save, or edit another skill. */
    _skillEditorFromChatHandoff: { state: true },
    /** When set, column 1 edits a config prompt instead of a skill. */
    _promptEdit: { state: true },
    _promptSaveBusy: { state: true },
    _newAgentId: { state: true },
    _newAgentName: { state: true },
    _agentSaveBusy: { state: true },
    _formMsg: { state: true },
  };

  constructor() {
    super();
    this.org = '';
    this.site = '';
    this._loading = true;
    this._error = '';
    this._skills = {};
    this._mcpRows = [];
    this._agentRows = [];
    this._customAgents = [];
    this._mcpToolsPayload = null;
    this._generatedTools = [];
    this._capSel = null;
    this._toolSel = null;
    this._bannerText = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(BANNER_KEY) || '' : '';
    this._registerKey = '';
    this._registerUrl = '';
    this._registerBusy = false;
    this._editingMcpKey = null;
    this._newSkillId = '';
    this._newSkillBody = '# New skill\n\n';
    this._editingSkillId = null;
    this._skillSaveBusy = false;
    this._skillStatuses = {};
    this._promptRows = [];
    this._catalogTab = 'skills';
    this._catalogFilter = 'all';
    this._toolsTab = 'available';
    this._skillEditorFromChatHandoff = false;
    this._promptEdit = null;
    this._promptSaveBusy = false;
    this._newAgentId = '';
    this._newAgentName = '';
    this._agentSaveBusy = false;
    this._formMsg = '';
    /** Same-tab handoff when chat stores session while already on `/apps/skills`. */
    this._onWindowSuggestHandoff = () => {
      this._applySuggestionHandoff(consumeSkillsLabSuggestionHandoff());
    };
    this._onClearFormFromChat = () => {
      this._clearSkillEditor();
    };
  }

  createRenderRoot() {
    const r = super.createRenderRoot();
    r.adoptedStyleSheets = [style];
    return r;
  }

  connectedCallback() {
    super.connectedCallback();
    this._applySuggestionHandoff(consumeSkillsLabSuggestionHandoff());
    this._onHashForContext = () => {
      this.requestUpdate();
      this._applySuggestionHandoff(consumeSkillsLabSuggestionHandoff());
    };
    window.addEventListener('hashchange', this._onHashForContext);
    window.addEventListener(DA_SKILLS_LAB_SUGGESTION_HANDOFF_EVENT, this._onWindowSuggestHandoff);
    window.addEventListener(DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT_EVENT, this._onClearFormFromChat);
    this._collapsibleVpMql = window.matchMedia('(max-width: 1023px)');
    this._onCollapsibleVp = () => {
      const narrow = this._collapsibleVpMql.matches;
      this.renderRoot?.querySelectorAll('details[data-sl-collapsible]').forEach((el) => {
        if (narrow) el.removeAttribute('open');
        else el.setAttribute('open', '');
      });
    };
    this._collapsibleVpMql.addEventListener('change', this._onCollapsibleVp);
  }

  disconnectedCallback() {
    window.removeEventListener('hashchange', this._onHashForContext);
    window.removeEventListener(
      DA_SKILLS_LAB_SUGGESTION_HANDOFF_EVENT,
      this._onWindowSuggestHandoff,
    );
    window.removeEventListener(DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT_EVENT, this._onClearFormFromChat);
    this._collapsibleVpMql?.removeEventListener('change', this._onCollapsibleVp);
    super.disconnectedCallback();
  }

  firstUpdated(changedProperties) {
    super.firstUpdated(changedProperties);
    this._onCollapsibleVp();
  }

  updated(changed) {
    super.updated(changed);
    if ((changed.has('org') || changed.has('site')) && this.org && this.site) {
      this._reload();
    }
    /* `firstUpdated` runs while `_loading` may still be true (spinner only), so `<details>` are
     * not in the tree yet — re-apply open/closed when the catalog finishes loading. */
    if (changed.has('_loading') && !this._loading) {
      queueMicrotask(() => this._onCollapsibleVp());
    }
  }

  async _reload() {
    if (!this.org || !this.site) return;
    this._loading = true;
    this._error = '';
    try {
      const cfg = await fetchDaConfigSheets(this.org, this.site);
      this._mcpRows = cfg.mcpRows || [];
      this._agentRows = cfg.agentRows || [];
      const cfgJson = cfg.json || {};

      const { map: skillsMap, statuses: skillStatuses } = skillsRowsToMapAndStatuses(
        cfgJson.skills?.data || [],
      );
      this._skills = skillsMap || {};
      this._skillStatuses = skillStatuses || {};

      this._promptRows = (cfgJson.prompts?.data || []).filter((r) => r.title && r.prompt);

      const [customAgents, gen] = await Promise.all([
        loadAgentPresetsFromRepo(this.org, this.site),
        loadGeneratedTools(this.org, this.site),
      ]);
      this._customAgents = customAgents || [];
      this._generatedTools = Array.isArray(gen) ? gen : [];

      const servers = cfg.configuredMcpServers || {};
      this._mcpToolsPayload = await fetchMcpToolsFromAgent(servers);
    } catch (e) {
      this._error = String(e?.message || e);
    } finally {
      this._loading = false;
    }
  }

  _dismissBanner() {
    this._bannerText = '';
    try {
      sessionStorage.removeItem(BANNER_KEY);
    } catch {
      /* ignore */
    }
  }

  _selectCap(kind, id) {
    this._toolSel = null;
    if (this._capSel?.kind === kind && this._capSel?.id === id) {
      this._capSel = null;
      return;
    }
    this._capSel = { kind, id };
  }

  _selectTool(id) {
    this._capSel = null;
    if (this._toolSel === id) {
      this._toolSel = null;
      return;
    }
    this._toolSel = id;
  }

  /** @returns {Array<{ id: string, label: string, wrap: string, group: string }>} */
  _allToolRows() {
    const rows = BUILTIN_TOOLS.map((t) => ({
      id: t.id,
      label: t.label,
      group: t.group,
      wrap: 'da-agent worker · DA admin / EDS',
    }));
    const servers = this._mcpToolsPayload?.servers || [];
    servers.forEach((s) => {
      if (s.tools?.length) {
        s.tools.forEach((tool) => {
          const id = `mcp__${s.id}__${tool.name}`;
          rows.push({
            id,
            label: tool.name,
            group: `MCP: ${s.id}`,
            wrap: `MCP SSE · ${s.id} → ${(this._mcpRows.find((r) => r.key === s.id) || {}).url || 'config URL'}`,
          });
        });
      }
    });
    (this._generatedTools || []).forEach((def) => {
      if (def?.id) {
        rows.push({
          id: `gen__${def.id}`,
          label: def.name || def.id,
          group: 'Generated',
          wrap: `DA config · generated-tools sheet · ${def.id}`,
        });
      }
    });
    return rows;
  }

  /** Tool rows with references from the current skill draft listed first. */
  _orderedToolRows() {
    const all = this._allToolRows();
    const refs = new Set(extractToolRefsFromSkillMarkdown(this._newSkillBody));
    const suggested = all.filter((t) => refs.has(t.id));
    const rest = all.filter((t) => !refs.has(t.id));
    return [...suggested, ...rest];
  }

  /** @param {'draft'|'approved'} status */
  _catalogFilterPasses(status) {
    if (this._catalogFilter === 'all') return true;
    return status === this._catalogFilter;
  }

  _toolHighlighted(toolId) {
    if (this._toolSel === toolId) return true;
    if (!this._capSel) return false;
    const { kind, id } = this._capSel;
    if (kind === 'mcp') {
      return toolId.startsWith(`mcp__${id}__`);
    }
    if (kind === 'skill') {
      const body = this._skills[id] || '';
      return extractToolRefsFromSkillMarkdown(body).includes(toolId);
    }
    if (kind === 'agent') {
      if (id === 'da-assistant') {
        return agentToolIds(BUILTIN_AGENTS[0], this._mcpToolsPayload).includes(toolId);
      }
      const ca = this._customAgents.find((a) => a.id === id);
      if (!ca?.preset) return false;
      const ids = agentToolIds(
        { mcpServers: ca.preset.mcpServers || [] },
        this._mcpToolsPayload,
      );
      return ids.includes(toolId);
    }
    return false;
  }

  _capHighlighted(kind, id) {
    if (this._toolSel) {
      const cons = this._consumersForTool(this._toolSel);
      if (kind === 'skill' && cons.skills.includes(id)) return true;
      if (kind === 'agent') {
        if (id === 'da-assistant' && cons.agents.includes('da-assistant')) return true;
        if (cons.agents.includes(id)) return true;
      }
      if (kind === 'mcp' && cons.mcpServers.includes(id)) return true;
      return false;
    }
    return this._capSel?.kind === kind && this._capSel?.id === id;
  }

  _consumersForTool(toolId) {
    const agents = [];
    const skills = [];
    const mcpServers = [];

    if (toolId.startsWith('mcp__')) {
      const parts = toolId.split('__');
      if (parts.length >= 2) mcpServers.push(parts[1]);
    }

    if (toolId.startsWith('da_') || toolId.startsWith('gen__')) {
      agents.push('da-assistant');
      this._customAgents.forEach((a) => agents.push(a.id));
    }

    Object.entries(this._skills || {}).forEach(([sid, body]) => {
      if (extractToolRefsFromSkillMarkdown(body).includes(toolId)) skills.push(sid);
    });

    if (toolId.startsWith('mcp__')) {
      const sid = toolId.split('__')[1];
      if (BUILTIN_AGENTS[0].mcpServers.includes(sid)) agents.push('da-assistant');
      this._customAgents.forEach((a) => {
        if ((a.preset?.mcpServers || []).includes(sid)) agents.push(a.id);
      });
    }

    return {
      agents: [...new Set(agents)],
      skills: [...new Set(skills)],
      mcpServers: [...new Set(mcpServers)],
    };
  }

  async _onRegisterMcp(e) {
    e.preventDefault();
    this._formMsg = '';
    this._registerBusy = true;
    const r = await registerMcpServer(this.org, this.site, this._registerKey, this._registerUrl);
    this._registerBusy = false;
    if (!r.ok) {
      this._formMsg = r.error || 'Register failed';
      return;
    }
    this._registerKey = '';
    this._registerUrl = '';
    this._editingMcpKey = null;
    this._formMsg = 'MCP server registered. Refreshing…';
    await this._reload();
    this._formMsg = 'Saved to DA config.';
  }

  _onEditMcp(row, e) {
    e.stopPropagation();
    this._promptEdit = null;
    this._editingMcpKey = row.key;
    this._registerKey = row.key;
    this._registerUrl = row.url || '';
    this._formMsg = '';
    this._selectCap('mcp', row.key);
  }

  _dispatchPromptAddToChat(text) {
    window.dispatchEvent(new CustomEvent(DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT, {
      bubbles: true,
      composed: true,
      detail: { prompt: text },
    }));
  }

  _dispatchPromptSend(text) {
    window.dispatchEvent(new CustomEvent(DA_SKILLS_LAB_PROMPT_SEND, {
      bubbles: true,
      composed: true,
      detail: { prompt: text },
    }));
  }

  _openPromptEditor(p, e) {
    e.stopPropagation();
    this._promptEdit = {
      title: String(p.title || ''),
      prompt: String(p.prompt || ''),
      category: String(p.category || ''),
      icon: String(p.icon || ''),
      originalTitle: String(p.title || '').trim(),
    };
    this._formMsg = '';
    this._skillEditorFromChatHandoff = false;
    this._selectCap('prompt', String(p.title || '').trim());
  }

  _backToSkillFromPrompt = () => {
    this._promptEdit = null;
    this._formMsg = '';
  };

  _dismissPromptFormFromColumn() {
    this._promptEdit = null;
    this._formMsg = '';
    window.dispatchEvent(new CustomEvent(DA_SKILLS_LAB_FORM_COLUMN_DISMISS_EVENT));
  }

  /**
   * @param {Event} e
   * @param {'draft'|'approved'} status
   */
  async _onSavePromptWithStatus(e, status) {
    e.preventDefault();
    const pe = this._promptEdit;
    if (!pe) return;
    const title = String(pe.title || '').trim();
    const promptText = String(pe.prompt || '').trim();
    if (!title || !promptText) {
      this._formMsg = 'Title and prompt are required';
      return;
    }
    this._promptSaveBusy = true;
    this._formMsg = '';
    const res = await upsertPromptRowInConfig(this.org, this.site, {
      title,
      prompt: promptText,
      category: pe.category,
      icon: pe.icon,
    }, {
      status,
      originalTitle: pe.originalTitle?.trim() || undefined,
    });
    this._promptSaveBusy = false;
    if (res.error) {
      this._formMsg = res.error;
      return;
    }
    await this._reload();
    this._promptEdit = {
      ...pe,
      title,
      prompt: promptText,
      originalTitle: title,
    };
    this._formMsg = status === 'approved' ? 'Prompt saved and approved.' : 'Prompt saved as draft.';
  }

  _clearMcpRegisterForm() {
    this._editingMcpKey = null;
    this._registerKey = '';
    this._registerUrl = '';
    this._formMsg = '';
  }

  /** Default page path for generated-tools “load HTML” when hash points at a document. */
  _contextPagePathForGeneratedTools() {
    const h = window.location.hash || '';
    const segs = h.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (segs.length < 3) return '';
    const doc = segs.slice(2).join('/');
    if (!doc) return '';
    return `/${doc}`;
  }

  _onEditSkill(sid, e) {
    e.stopPropagation();
    this._promptEdit = null;
    this._editingSkillId = sid;
    this._newSkillId = sid;
    this._newSkillBody = this._skills[sid] ?? '';
    this._formMsg = '';
    this._skillEditorFromChatHandoff = false;
    this._selectCap('skill', sid);
  }

  _clearSkillEditor = () => {
    this._editingSkillId = null;
    this._newSkillId = '';
    this._newSkillBody = '# New skill\n\n';
    this._formMsg = '';
    this._skillEditorFromChatHandoff = false;
    this._promptEdit = null;
  };

  _dismissSkillFormFromColumn() {
    this._clearSkillEditor();
    window.dispatchEvent(new CustomEvent(DA_SKILLS_LAB_FORM_COLUMN_DISMISS_EVENT));
  }

  /**
   * Prefill Skills Lab from chat “Create Skill” (session handoff).
   * @param {{ prose: string, id: string, body: string } | null} handoff
   */
  _applySuggestionHandoff(handoff) {
    if (!handoff) return;
    const prose = String(handoff.prose || '');
    const id = String(handoff.id || '').trim();
    const body = String(handoff.body || '');
    const hasProse = Boolean(prose.trim());
    const hasBody = Boolean(body.trim());
    const hasId = Boolean(id);
    if (!hasProse && !hasBody && !hasId) return;
    this._promptEdit = null;
    this._editingSkillId = null;
    if (hasId) {
      this._newSkillId = id.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }
    if (hasBody) {
      this._newSkillBody = body;
    } else if (hasId || hasProse) {
      this._newSkillBody = '# New skill\n\n';
    }
    this._skillEditorFromChatHandoff = true;
    this._catalogTab = 'skills';
    this._capSel = null;
    this._toolSel = null;
    this._formMsg = '';
    this.requestUpdate();
  }

  /** @public — refresh catalog after toolbar “New” creates a skill file. */
  refresh() {
    return this._reload();
  }

  /**
   * @param {Event} e
   * @param {'draft'|'approved'} status
   */
  async _onSaveSkillWithStatus(e, status) {
    e.preventDefault();
    const id = (this._editingSkillId || this._newSkillId).trim();
    if (!id) {
      this._formMsg = 'Skill id required';
      return;
    }
    const ta = this.shadowRoot?.querySelector('.skills-lab-textarea');
    const body = ta?.value ?? this._newSkillBody;
    this._newSkillBody = body;
    this._skillSaveBusy = true;
    this._formMsg = '';
    const prefix = `/${this.org}/${this.site}`;
    const res = await saveSkill(prefix, id, body, { status });
    this._skillSaveBusy = false;
    if (res.error) {
      this._formMsg = res.error;
      return;
    }
    const wasNew = !this._editingSkillId;
    if (wasNew) {
      this._newSkillId = '';
      this._newSkillBody = '# New skill\n\n';
      this._skillEditorFromChatHandoff = false;
      window.dispatchEvent(new CustomEvent(DA_SKILLS_LAB_FORM_COLUMN_DISMISS_EVENT));
    }
    await this._reload();
    if (this._editingSkillId) {
      this._newSkillBody = this._skills[this._editingSkillId] ?? this._newSkillBody;
    }
    this._formMsg = status === 'approved' ? 'Skill saved and approved for chat.' : 'Skill saved as draft.';
  }

  async _onDeleteSkill() {
    const id = this._editingSkillId?.trim();
    if (!id) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete skill "${id}" from site config?`)) return;
    this._skillSaveBusy = true;
    this._formMsg = '';
    const prefix = `/${this.org}/${this.site}`;
    const res = await deleteSkill(prefix, id);
    this._skillSaveBusy = false;
    if (res.error) {
      this._formMsg = res.error;
      return;
    }
    this._clearSkillEditor();
    await this._reload();
    this._formMsg = 'Skill deleted.';
  }

  async _onSaveAgent(e) {
    e.preventDefault();
    const id = this._newAgentId.trim().replace(/\.json$/i, '');
    const name = this._newAgentName.trim() || id;
    if (!id) {
      this._formMsg = 'Agent id required';
      return;
    }
    this._agentSaveBusy = true;
    this._formMsg = '';
    const preset = {
      name,
      description: '',
      systemPrompt: '',
      skills: [],
      mcpServers: [],
    };
    const path = `/${this.org}/${this.site}/.da/agents/${id}.json`;
    const body = new FormData();
    body.append('data', new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }));
    try {
      const resp = await daFetch(`${DA_ORIGIN}/source${path}`, { method: 'POST', body });
      if (!resp.ok) {
        this._formMsg = `Save failed: ${resp.status}`;
      } else {
        this._newAgentId = '';
        this._newAgentName = '';
        await this._reload();
        this._formMsg = 'Agent file saved to /.da/agents/.';
      }
    } catch (err) {
      this._formMsg = String(err?.message || err);
    } finally {
      this._agentSaveBusy = false;
    }
  }

  render() {
    if (!this.org || !this.site) {
      return html`<div class="skills-lab-loading">Missing org or site.</div>`;
    }
    if (this._loading) {
      return html`<div class="skills-lab-loading">Loading capabilities…</div>`;
    }

    const allSkillIds = Object.keys(this._skills || {});
    const skillIds = allSkillIds.filter((sid) => {
      const st = this._skillStatuses[sid] || 'approved';
      return this._catalogFilterPasses(st);
    });
    const toolRows = this._orderedToolRows();
    const browseHash = `#/${this.org}/${this.site}`;
    const { nxBase } = getConfig();
    const editIconSrc = `${nxBase}/public/icons/S2_Icon_Edit_20_N.svg`;
    const configHash = `https://da.live/config#/${this.org}/${this.site}/`;

    const filterBar = html`
      <div class="skills-lab-catalog-toolbar" role="toolbar" aria-label="Lifecycle filter">
        <span class="skills-lab-filter-label">Show</span>
        ${(['all', 'draft', 'approved']).map((f) => html`
          <button type="button" class="skills-lab-filter-chip ${this._catalogFilter === f ? 'is-active' : ''}"
            @click=${() => { this._catalogFilter = f; }}>
            ${{ all: 'All', draft: 'Draft', approved: 'Approved' }[f] || f}
          </button>
        `)}
      </div>`;

    const tabBtn = (id, label) => html`
      <button type="button" class="skills-lab-cat-tab ${this._catalogTab === id ? 'is-active' : ''}"
        @click=${() => { this._catalogTab = id; }}>${label}</button>`;

    const rowPassesCatalogFilter = (row) => this._catalogFilterPasses(skillRowStatus(row));
    const filteredPrompts = (this._promptRows || []).filter(rowPassesCatalogFilter);
    const filteredMcpCustom = (this._mcpRows || []).filter(rowPassesCatalogFilter);
    const showAgentsCatalog = this._catalogFilterPasses('approved');

    let agentsCatalogMain = nothing;
    if (showAgentsCatalog) {
      agentsCatalogMain = html`
              <h3 class="skills-lab-section-h">Agents (${1 + this._customAgents.length})</h3>
              ${BUILTIN_AGENTS.map((a) => html`
                <div class="skills-lab-card ${this._capHighlighted('agent', a.id) ? 'sl-highlight' : ''}"
                  @click=${() => this._selectCap('agent', a.id)}>
                  <span class="skills-lab-type-badge agent">agent</span>
                  <div class="skills-lab-card-title">${a.name}</div>
                  <div class="skills-lab-card-meta">builtin · ${a.id}</div>
                  <div class="skills-lab-card-desc">${a.description}</div>
                  <div class="skills-lab-pills">${agentToolIds(a, this._mcpToolsPayload).slice(0, 12).map((t) => html`<span class="skills-lab-pill">${t}</span>`)}${agentToolIds(a, this._mcpToolsPayload).length > 12 ? html`<span class="skills-lab-pill">…</span>` : nothing}</div>
                </div>`)}
              ${this._customAgents.map(({ id, preset }) => html`
                <div class="skills-lab-card ${this._capHighlighted('agent', id) ? 'sl-highlight' : ''}"
                  @click=${() => this._selectCap('agent', id)}>
                  <span class="skills-lab-type-badge agent">agent</span>
                  <div class="skills-lab-card-title">${preset?.name || id}</div>
                  <div class="skills-lab-card-meta">/.da/agents/${id}.json</div>
                  <div class="skills-lab-card-desc">${preset?.description || ''}</div>
                  <div class="skills-lab-pills">${agentToolIds({ mcpServers: preset?.mcpServers || [] }, this._mcpToolsPayload).slice(0, 10).map((t) => html`<span class="skills-lab-pill">${t}</span>`)}${agentToolIds({ mcpServers: preset?.mcpServers || [] }, this._mcpToolsPayload).length > 10 ? html`<span class="skills-lab-pill">…</span>` : nothing}</div>
                </div>`)}
              ${(this._agentRows || []).length ? html`
                <h3 class="skills-lab-section-h">Config agents (${this._agentRows.length})</h3>
                ${this._agentRows.map((row) => html`
                  <div class="skills-lab-card">
                    <span class="skills-lab-type-badge agent">config</span>
                    <div class="skills-lab-card-title">${row.key}</div>
                    <div class="skills-lab-card-meta">${row.url}</div>
                    <div class="skills-lab-card-desc">DA config <code>agents</code> sheet</div>
                  </div>`)}
              ` : nothing}
            `;
    } else if (this._catalogFilter === 'draft') {
      agentsCatalogMain = html`<p class="skills-lab-form-hint">No draft agent entries in the catalog (presets are treated as approved).</p>`;
    }

    const catalogSkills = html`
          <h3 class="skills-lab-section-h">Skills (${skillIds.length})</h3>
          ${skillIds.map((sid) => {
        const st = this._skillStatuses[sid] || 'approved';
        return html`
                <div class="skills-lab-card skills-lab-card-skill ${this._capHighlighted('skill', sid) ? 'sl-highlight' : ''}">
                  <div class="skills-lab-card-row" @click=${() => this._selectCap('skill', sid)}>
                    <span class="skills-lab-type-badge skill">skill</span>
                    <div class="skills-lab-card-main">
                      <div class="skills-lab-card-title">${sid}</div>
                      <div class="skills-lab-card-meta">DA config · ${st === 'draft' ? 'draft' : 'approved'}</div>
                    </div>
                    <button type="button" class="skills-lab-skill-edit" title="Edit Skill" aria-label="Edit Skill"
                      @click=${(e) => this._onEditSkill(sid, e)}>
                      <img src="${editIconSrc}" width="18" height="18" alt="" />
                    </button>
                  </div>
                </div>`;
      })}
        `;

    const catalogAgents = html`
          ${agentsCatalogMain}
              <h3 class="skills-lab-section-h">New agent file</h3>
              <p class="skills-lab-form-hint">Creates <code>/.da/agents/&lt;id&gt;.json</code> in the site.</p>
              <form class="skills-lab-form" @submit=${this._onSaveAgent}>
                <input class="skills-lab-input" .value=${this._newAgentId} @input=${(e) => { this._newAgentId = e.target.value; }} placeholder="agent-id" />
                <input class="skills-lab-input" .value=${this._newAgentName} @input=${(e) => { this._newAgentName = e.target.value; }} placeholder="Display name" />
                <sp-button type="submit" variant="secondary" ?disabled=${this._agentSaveBusy}>Save agent file</sp-button>
              </form>
        `;

    const defaultPromptIcon = `${nxBase}/img/icons/aichat.svg`;
    const catalogPrompts = html`
              <p class="skills-lab-form-hint">Prompts from the DA config <code>prompts</code> sheet. <a href="${configHash}" target="_blank" rel="noopener">Edit in config</a></p>
              <h3 class="skills-lab-section-h">Prompts (${filteredPrompts.length})</h3>
              ${filteredPrompts.length === 0
        ? html`<p class="skills-lab-form-hint">No prompts for this filter.</p>`
        : html`
              <div class="skills-lab-prompts-catalog-grid">
                ${filteredPrompts.map((p) => {
          const pst = skillRowStatus(p);
          const iconSrc = p.icon || defaultPromptIcon;
          const catLabel = (p.category && String(p.category).trim()) || 'Prompt';
          const titleKey = String(p.title || '').trim();
          return html`
                <div class="skills-lab-prompts-lib-card ${this._capHighlighted('prompt', titleKey) ? 'sl-highlight' : ''}">
                  <div class="skills-lab-prompt-card-header">
                    <div class="skills-lab-prompt-card-head-main" @click=${() => this._selectCap('prompt', titleKey)}>
                      <div class="skills-lab-prompts-lib-card-top">
                        <img class="skills-lab-prompts-lib-card-icon" src="${iconSrc}" alt="" aria-hidden="true" />
                        <span class="skills-lab-prompts-lib-card-category">${catLabel}</span>
                      </div>
                      <div class="skills-lab-prompts-lib-card-title">${p.title}</div>
                      <div class="skills-lab-card-meta">${pst === 'draft' ? 'draft' : 'approved'}</div>
                      <div class="skills-lab-prompts-lib-card-prompt">${p.prompt}</div>
                    </div>
                    <button type="button" class="skills-lab-skill-edit" title="Edit prompt" aria-label="Edit prompt"
                      @click=${(e) => this._openPromptEditor(p, e)}>
                      <img src="${editIconSrc}" width="18" height="18" alt="" />
                    </button>
                  </div>
                  <div class="skills-lab-prompts-lib-card-actions">
                    <button type="button" class="skills-lab-prompts-add-btn" title="Add to chat input"
                      @click=${() => this._dispatchPromptAddToChat(p.prompt)}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M17.41 4.1 15.9 2.59A1.75 1.75 0 0 0 14.48 2H4.25A2.25 2.25 0 0 0 2 4.25v11.5A2.25 2.25 0 0 0 4.25 18h11.5A2.25 2.25 0 0 0 18 15.75V5.52c0-.53-.21-1.04-.59-1.42ZM7.75 3.5h4.5v3h-4.5v-3Zm5.5 13H6.75V12h6.5v4.5Zm3.25-1.75a.75.75 0 0 1-.75.75h-1V12a1.75 1.75 0 0 0-1.75-1.75h-6.5A1.75 1.75 0 0 0 5.25 12v4.5h-1a.75.75 0 0 1-.75-.75V4.25a.75.75 0 0 1 .75-.75h2v3A1.75 1.75 0 0 0 7.75 8h4.5a1.75 1.75 0 0 0 1.75-1.75v-3h.48a.25.25 0 0 1 .18.07l1.52 1.52a.25.25 0 0 1 .07.18v11.23Z" fill="currentColor"/></svg>
                      Add to chat
                    </button>
                    <button type="button" class="skills-lab-prompts-send-btn" title="Send immediately"
                      @click=${() => this._dispatchPromptSend(p.prompt)}>
                      <svg width="13" height="13" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M18.6485 9.9735C18.6482 9.67899 18.4769 9.41106 18.2059 9.29056L4.05752 2.93282C3.80133 2.8175 3.50129 2.85583 3.28171 3.03122C3.06178 3.20765 2.95889 3.49146 3.01516 3.76733L4.28678 10.008L3.06488 16.2384C3.0162 16.4852 3.09492 16.738 3.27031 16.9134C3.29068 16.9337 3.31278 16.9531 3.33522 16.9714C3.55619 17.1454 3.85519 17.182 4.11069 17.066L18.2086 10.6578C18.4773 10.5356 18.6489 10.268 18.6485 9.9735Z" fill="currentColor"/></svg>
                      Send
                    </button>
                  </div>
                </div>`;
        })}
              </div>`}
            `;

    const catalogMcps = html`
              <h3 class="skills-lab-section-h">Register MCP</h3>
              <form class="skills-lab-form" @submit=${this._onRegisterMcp}>
                <label>Add or update (<code>mcp-servers</code>)</label>
                ${this._editingMcpKey
        ? html`<p class="skills-lab-form-hint">Editing <code>${this._editingMcpKey}</code> ·
                    <button type="button" class="skills-lab-link-btn" @click=${this._clearMcpRegisterForm}>New MCP server</button></p>`
        : nothing}
                <input class="skills-lab-input" .value=${this._registerKey} @input=${(e) => {
        this._registerKey = e.target.value;
        if (this._editingMcpKey && e.target.value.trim() !== this._editingMcpKey) {
          this._editingMcpKey = null;
        }
      }} placeholder="server-id" />
                <input class="skills-lab-input" .value=${this._registerUrl} @input=${(e) => { this._registerUrl = e.target.value; }} placeholder="https://…/sse" />
                <sp-button type="submit" variant="accent" ?disabled=${this._registerBusy}>
                  ${this._editingMcpKey ? 'Update MCP config' : 'Register MCP'}
                </sp-button>
              </form>
              <h3 class="skills-lab-section-h">MCP servers (${BUILTIN_MCP_SERVERS.length + filteredMcpCustom.length})</h3>
              ${BUILTIN_MCP_SERVERS.filter(() => this._catalogFilterPasses('approved')).map((s) => html`
                <div class="skills-lab-card ${this._capHighlighted('mcp', s.id) ? 'sl-highlight' : ''}"
                  @click=${() => this._selectCap('mcp', s.id)}>
                  <span class="skills-lab-type-badge mcp">mcp</span>
                  <div class="skills-lab-card-title">${s.id}</div>
                  <div class="skills-lab-card-meta">${s.transport}</div>
                  <div class="skills-lab-card-desc">${s.description}</div>
                </div>`)}
              ${filteredMcpCustom.map((row) => html`
                <div class="skills-lab-card skills-lab-card-skill ${this._capHighlighted('mcp', row.key) ? 'sl-highlight' : ''}">
                  <div class="skills-lab-card-row" @click=${() => this._selectCap('mcp', row.key)}>
                    <span class="skills-lab-type-badge mcp">mcp</span>
                    <div class="skills-lab-card-main">
                      <div class="skills-lab-card-title">${row.key}</div>
                      <div class="skills-lab-card-meta">${row.url}</div>
                      <div class="skills-lab-card-meta">${skillRowStatus(row) === 'draft' ? 'draft' : 'approved'}</div>
                    </div>
                    <button type="button" class="skills-lab-skill-edit" title="Edit MCP server" aria-label="Edit MCP server"
                      @click=${(e) => this._onEditMcp(row, e)}>
                      <img src="${editIconSrc}" width="18" height="18" alt="" />
                    </button>
                  </div>
                </div>`)}
            `;

    let catalogBody = catalogMcps;
    if (this._catalogTab === 'skills') {
      catalogBody = catalogSkills;
    } else if (this._catalogTab === 'agents') {
      catalogBody = catalogAgents;
    } else if (this._catalogTab === 'prompts') {
      catalogBody = catalogPrompts;
    }

    return html`
      <div class="skills-lab-root">
        ${this._bannerText
        ? html`
          <div class="skills-lab-banner">
            <span>${this._bannerText}</span>
            <button type="button" class="skills-lab-banner-dismiss" @click=${this._dismissBanner} aria-label="Dismiss">×</button>
          </div>`
        : nothing}
        <div class="skills-lab-columns">
          <div class="skills-lab-col skills-lab-col-form">
            <div class="skills-lab-col-scroll skills-lab-col-scroll-stack">
              <div class="skills-lab-order-back">
                <div class="skills-lab-back">
                  <a href="${browseHash}">← Back to browse</a>
                </div>
              </div>
              <div class="skills-lab-order-editor">
                <div class="skills-lab-editor-heading">
                  <h3 class="skills-lab-section-h skills-lab-section-h-inline">Tool Editor</h3>
                  ${this._promptEdit
        ? html`<button type="button" class="skills-lab-link-btn" @click=${this._backToSkillFromPrompt}>Back to skill</button>`
        : nothing}
                  ${!this._promptEdit && this._editingSkillId
        ? html`<button type="button" class="skills-lab-link-btn" @click=${this._clearSkillEditor}>New skill</button>`
        : nothing}
                </div>
                ${this._promptEdit
        ? html`
                <div class="skills-lab-form">
                  <label>Title</label>
                  <input class="skills-lab-input" .value=${this._promptEdit.title}
                    @input=${(e) => {
            this._promptEdit = { ...this._promptEdit, title: e.target.value };
          }}
                    placeholder="Prompt title" />
                  <label>Category</label>
                  <input class="skills-lab-input" .value=${this._promptEdit.category}
                    @input=${(e) => {
            this._promptEdit = { ...this._promptEdit, category: e.target.value };
          }}
                    placeholder="Category label" />
                  <label>Icon URL</label>
                  <input class="skills-lab-input" .value=${this._promptEdit.icon}
                    @input=${(e) => {
            this._promptEdit = { ...this._promptEdit, icon: e.target.value };
          }}
                    placeholder="https://…" />
                  <label>Prompt</label>
                  <textarea class="skills-lab-textarea skills-lab-textarea-tall" .value=${this._promptEdit.prompt}
                    aria-label="Prompt text"
                    @input=${(e) => {
            this._promptEdit = { ...this._promptEdit, prompt: e.target.value };
          }}></textarea>
                  <div class="skills-lab-save-row">
                    <sp-button type="button" variant="secondary" ?disabled=${this._promptSaveBusy}
                      @click=${this._dismissPromptFormFromColumn}>
                      Dismiss
                    </sp-button>
                    <sp-button type="button" variant="secondary" ?disabled=${this._promptSaveBusy}
                      @click=${(e) => this._onSavePromptWithStatus(e, 'draft')}>Save as Draft</sp-button>
                    <sp-button type="button" variant="accent" ?disabled=${this._promptSaveBusy}
                      @click=${(e) => this._onSavePromptWithStatus(e, 'approved')}>Save</sp-button>
                  </div>
                  <p class="skills-lab-form-hint">Draft prompts are hidden from the chat library until approved.</p>
                </div>`
        : html`
                <div class="skills-lab-form">
                  <input class="skills-lab-input" .value=${this._newSkillId}
                    @input=${(e) => { this._newSkillId = e.target.value; }}
                    placeholder="skill-id" ?readonly=${Boolean(this._editingSkillId)} />
                  <div
                    class="skills-lab-skill-editor-wrap ${this._skillEditorFromChatHandoff
        ? 'skills-lab-skill-editor-wrap-handoff'
        : ''}"
                  >
                    <textarea class="skills-lab-textarea skills-lab-textarea-tall" .value=${this._newSkillBody}
                      aria-label="Skill markdown"
                      @input=${(e) => { this._newSkillBody = e.target.value; }}></textarea>
                  </div>
                  <div class="skills-lab-save-row">
                    <sp-button type="button" variant="secondary" ?disabled=${this._skillSaveBusy}
                      @click=${this._dismissSkillFormFromColumn}>
                      Dismiss
                    </sp-button>
                    <sp-button type="button" variant="secondary" ?disabled=${this._skillSaveBusy}
                      @click=${(e) => this._onSaveSkillWithStatus(e, 'draft')}>Save as Draft</sp-button>
                    <sp-button type="button" variant="accent" ?disabled=${this._skillSaveBusy}
                      @click=${(e) => this._onSaveSkillWithStatus(e, 'approved')}>Save</sp-button>
                    ${this._editingSkillId
        ? html`<sp-button type="button" variant="negative" ?disabled=${this._skillSaveBusy}
                        @click=${this._onDeleteSkill}>Delete</sp-button>`
        : nothing}
                  </div>
                  <p class="skills-lab-form-hint">Draft skills are hidden from chat until you use <strong>Save</strong> (approved).</p>
                </div>`}
              </div>
              ${this._formMsg
        ? html`<div class="skills-lab-order-msgs skills-lab-msg ${this._formMsg.includes('fail') || this._formMsg.includes('required') ? 'skills-lab-msg-err' : 'skills-lab-msg-ok'}">${this._formMsg}</div>`
        : nothing}
              ${this._error ? html`<div class="skills-lab-order-msgs skills-lab-msg skills-lab-msg-err">${this._error}</div>` : nothing}
            </div>
          </div>
          <div class="skills-lab-col skills-lab-col-tools skills-lab-tools-always">
            <div class="skills-lab-tools-tabs" role="tablist" aria-label="Tool sources">
              <button type="button" class="skills-lab-cat-tab ${this._toolsTab === 'available' ? 'is-active' : ''}"
                @click=${() => { this._toolsTab = 'available'; }}>Available tools</button>
              <button type="button" class="skills-lab-cat-tab ${this._toolsTab === 'generated' ? 'is-active' : ''}"
                @click=${() => { this._toolsTab = 'generated'; }}>Generated tools</button>
            </div>
            <div class="skills-lab-tools-scroll">
              ${this._toolsTab === 'generated'
        ? html`
                <p class="skills-lab-form-hint skills-lab-tools-hint">Site-generated tool definitions (draft / approved).</p>
                <nx-generated-tools
                  .org=${this.org}
                  .site=${this.site}
                  .contextPagePath=${this._contextPagePathForGeneratedTools()}
                ></nx-generated-tools>
              `
        : html`
                <h3 class="skills-lab-section-h">Available tools (${toolRows.length})</h3>
                <p class="skills-lab-form-hint skills-lab-tools-hint">Built-in, MCP, and generated tool ids. References from your skill draft are listed first.</p>
                ${toolRows.map((t) => {
          const hi = this._toolHighlighted(t.id);
          const cons = this._toolSel === t.id ? this._consumersForTool(t.id) : null;
          return html`
                  <div class="skills-lab-tool-row ${hi ? 'sl-highlight' : ''}" @click=${() => this._selectTool(t.id)}>
                    <span class="skills-lab-type-badge tool">tool</span>
                    <span class="skills-lab-tool-id">${t.id}</span>
                    <span class="skills-lab-tool-wrap">${t.wrap} · ${t.group}</span>
                    ${cons
            ? html`<div class="skills-lab-card-desc">Used by agents: ${cons.agents.join(', ') || '—'} · skills: ${cons.skills.join(', ') || '—'}</div>`
            : nothing}
                  </div>`;
        })}
              `}
            </div>
          </div>
          <div class="skills-lab-col skills-lab-col-catalog">
            <div class="skills-lab-catalog-tabs" role="tablist" aria-label="Catalog">
              ${tabBtn('skills', 'Skills')}
              ${tabBtn('agents', 'Agents')}
              ${tabBtn('prompts', 'Prompts')}
              ${tabBtn('mcp', 'MCPs')}
            </div>
            ${filterBar}
            <div class="skills-lab-catalog-scroll">
              ${catalogBody}
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('da-skills-lab-view', DaSkillsLabView);

/** @param {string} text */
export function setSkillsLabBannerText(text) {
  try {
    if (text) sessionStorage.setItem(BANNER_KEY, text);
    else sessionStorage.removeItem(BANNER_KEY);
  } catch {
    /* ignore */
  }
}
