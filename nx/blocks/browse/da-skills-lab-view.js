// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';
import { DA_ORIGIN } from '../../public/utils/constants.js';
import { daFetch } from '../../utils/daFetch.js';
import { loadSkills, saveSkill } from '../skills-editor/utils/utils.js';
import { loadGeneratedTools } from '../canvas/src/generated-tools/utils.js';
import {
  extractToolRefsFromSkillMarkdown,
  fetchDaConfigSheets,
  fetchMcpToolsFromAgent,
  loadAgentPresetsFromRepo,
  registerMcpServer,
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
  { id: 'aem_shift_left_content_create', label: 'AEM shift-left create', group: 'AEM Shift Left' },
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
    _newSkillId: { state: true },
    _newSkillBody: { state: true },
    _skillSaveBusy: { state: true },
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
    this._newSkillId = '';
    this._newSkillBody = '# New skill\n\n';
    this._skillSaveBusy = false;
    this._newAgentId = '';
    this._newAgentName = '';
    this._agentSaveBusy = false;
    this._formMsg = '';
  }

  createRenderRoot() {
    const r = super.createRenderRoot();
    r.adoptedStyleSheets = [style];
    return r;
  }

  updated(changed) {
    if ((changed.has('org') || changed.has('site')) && this.org && this.site) {
      this._reload();
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

      const [skills, customAgents, gen] = await Promise.all([
        loadSkills(this.org, this.site),
        loadAgentPresetsFromRepo(this.org, this.site),
        loadGeneratedTools(this.org, this.site),
      ]);
      this._skills = skills || {};
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
          wrap: `/.da/generated-tools/${def.id}.json`,
        });
      }
    });
    return rows;
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
    this._formMsg = 'MCP server registered. Refreshing…';
    await this._reload();
    this._formMsg = 'Saved to DA config.';
  }

  async _onSaveSkill(e) {
    e.preventDefault();
    const id = this._newSkillId.trim();
    if (!id) {
      this._formMsg = 'Skill id required';
      return;
    }
    this._skillSaveBusy = true;
    this._formMsg = '';
    const prefix = `/${this.org}/${this.site}`;
    const res = await saveSkill(prefix, id, this._newSkillBody);
    this._skillSaveBusy = false;
    if (res.error) {
      this._formMsg = res.error;
      return;
    }
    this._newSkillId = '';
    await this._reload();
    this._formMsg = 'Skill saved.';
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
        this._formMsg = 'Agent preset saved.';
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

    const skillIds = Object.keys(this._skills || {});
    const toolRows = this._allToolRows();
    const browseHash = `#/${this.org}/${this.site}`;

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
          <div class="skills-lab-col skills-lab-col-narrow">
            <div class="skills-lab-col-scroll">
              <div class="skills-lab-back">
                <a href="${browseHash}">← Back to browse</a>
              </div>
              <h3 class="skills-lab-section-h">Discover / register</h3>
              <form class="skills-lab-form" @submit=${this._onRegisterMcp}>
                <label>Add MCP server (config sheet)</label>
                <input class="skills-lab-input" .value=${this._registerKey} @input=${(e) => { this._registerKey = e.target.value; }} placeholder="server-id" />
                <input class="skills-lab-input" .value=${this._registerUrl} @input=${(e) => { this._registerUrl = e.target.value; }} placeholder="https://…/sse" />
                <sp-button type="submit" variant="accent" ?disabled=${this._registerBusy}>Register MCP</sp-button>
              </form>
              <h3 class="skills-lab-section-h">Create skill</h3>
              <form class="skills-lab-form" @submit=${this._onSaveSkill}>
                <input class="skills-lab-input" .value=${this._newSkillId} @input=${(e) => { this._newSkillId = e.target.value; }} placeholder="skill-id" />
                <textarea class="skills-lab-textarea" .value=${this._newSkillBody} @input=${(e) => { this._newSkillBody = e.target.value; }}></textarea>
                <sp-button type="submit" variant="primary" ?disabled=${this._skillSaveBusy}>Save skill</sp-button>
              </form>
              <h3 class="skills-lab-section-h">Create agent stub</h3>
              <form class="skills-lab-form" @submit=${this._onSaveAgent}>
                <input class="skills-lab-input" .value=${this._newAgentId} @input=${(e) => { this._newAgentId = e.target.value; }} placeholder="agent-id" />
                <input class="skills-lab-input" .value=${this._newAgentName} @input=${(e) => { this._newAgentName = e.target.value; }} placeholder="Display name" />
                <sp-button type="submit" variant="secondary" ?disabled=${this._agentSaveBusy}>Save preset</sp-button>
              </form>
              ${this._formMsg
        ? html`<div class="skills-lab-msg ${this._formMsg.includes('fail') || this._formMsg.includes('required') ? 'skills-lab-msg-err' : 'skills-lab-msg-ok'}">${this._formMsg}</div>`
        : nothing}
              ${this._error ? html`<div class="skills-lab-msg skills-lab-msg-err">${this._error}</div>` : nothing}
            </div>
          </div>
          <div class="skills-lab-col skills-lab-col-mid">
            <div class="skills-lab-col-scroll">
              <h3 class="skills-lab-section-h">Agents (${1 + this._customAgents.length})</h3>
              ${BUILTIN_AGENTS.map(
        (a) => html`
                <div
                  class="skills-lab-card ${this._capHighlighted('agent', a.id) ? 'sl-highlight' : ''}"
                  @click=${() => this._selectCap('agent', a.id)}
                >
                  <span class="skills-lab-type-badge agent">agent</span>
                  <div class="skills-lab-card-title">${a.name}</div>
                  <div class="skills-lab-card-meta">builtin · ${a.id}</div>
                  <div class="skills-lab-card-desc">${a.description}</div>
                  <div class="skills-lab-card-meta">wraps: da-agent + merged tools</div>
                  <div class="skills-lab-pills">${agentToolIds(a, this._mcpToolsPayload).slice(0, 12).map((t) => html`<span class="skills-lab-pill">${t}</span>`)}${agentToolIds(a, this._mcpToolsPayload).length > 12 ? html`<span class="skills-lab-pill">…</span>` : nothing}</div>
                </div>`,
      )}
              ${this._customAgents.map(
        ({ id, preset }) => html`
                <div
                  class="skills-lab-card ${this._capHighlighted('agent', id) ? 'sl-highlight' : ''}"
                  @click=${() => this._selectCap('agent', id)}
                >
                  <span class="skills-lab-type-badge agent">agent</span>
                  <div class="skills-lab-card-title">${preset?.name || id}</div>
                  <div class="skills-lab-card-meta">/.da/agents/${id}.json</div>
                  <div class="skills-lab-card-desc">${preset?.description || ''}</div>
                  <div class="skills-lab-pills">${agentToolIds({ mcpServers: preset?.mcpServers || [] }, this._mcpToolsPayload).slice(0, 10).map((t) => html`<span class="skills-lab-pill">${t}</span>`)}${agentToolIds({ mcpServers: preset?.mcpServers || [] }, this._mcpToolsPayload).length > 10 ? html`<span class="skills-lab-pill">…</span>` : nothing}</div>
                </div>`,
      )}
              <h3 class="skills-lab-section-h">Skills (${skillIds.length})</h3>
              ${skillIds.map(
        (sid) => html`
                <div
                  class="skills-lab-card ${this._capHighlighted('skill', sid) ? 'sl-highlight' : ''}"
                  @click=${() => this._selectCap('skill', sid)}
                >
                  <span class="skills-lab-type-badge skill">skill</span>
                  <div class="skills-lab-card-title">${sid}</div>
                  <div class="skills-lab-card-meta">/.da/skills/${sid}.md</div>
                </div>`,
      )}
              ${(this._agentRows || []).length
        ? html`
                <h3 class="skills-lab-section-h">Config agents (${this._agentRows.length})</h3>
                ${this._agentRows.map(
          (row) => html`
                  <div class="skills-lab-card">
                    <span class="skills-lab-type-badge agent">config</span>
                    <div class="skills-lab-card-title">${row.key}</div>
                    <div class="skills-lab-card-meta">${row.url}</div>
                    <div class="skills-lab-card-desc">DA config <code>agents</code> sheet · activate in chat</div>
                  </div>`,
        )}
              `
        : nothing}
              <h3 class="skills-lab-section-h">MCP servers (${BUILTIN_MCP_SERVERS.length + this._mcpRows.length})</h3>
              ${BUILTIN_MCP_SERVERS.map(
        (s) => html`
                <div
                  class="skills-lab-card ${this._capHighlighted('mcp', s.id) ? 'sl-highlight' : ''}"
                  @click=${() => this._selectCap('mcp', s.id)}
                >
                  <span class="skills-lab-type-badge mcp">mcp</span>
                  <div class="skills-lab-card-title">${s.id}</div>
                  <div class="skills-lab-card-meta">${s.transport}</div>
                  <div class="skills-lab-card-desc">${s.description}</div>
                </div>`,
      )}
              ${this._mcpRows.map(
        (row) => html`
                <div
                  class="skills-lab-card ${this._capHighlighted('mcp', row.key) ? 'sl-highlight' : ''}"
                  @click=${() => this._selectCap('mcp', row.key)}
                >
                  <span class="skills-lab-type-badge mcp">mcp</span>
                  <div class="skills-lab-card-title">${row.key}</div>
                  <div class="skills-lab-card-meta">${row.url}</div>
                  <div class="skills-lab-card-desc">SSE transport · da-agent /mcp-tools</div>
                </div>`,
      )}
            </div>
          </div>
          <div class="skills-lab-col skills-lab-col-wide">
            <div class="skills-lab-col-scroll">
              <h3 class="skills-lab-section-h">Tools (${toolRows.length})</h3>
              ${toolRows.map(
        (t) => {
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
        },
      )}
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
