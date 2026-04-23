import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, HashController } from '../../utils/utils.js';
import '../shared/tabs/tabs.js';
import '../shared/card/card.js';
import {
  fetchDaConfigSheets,
  loadSkillsWithStatuses,
  upsertSkillInConfig,
  deleteSkillFromConfig,
  writeSkillMdFile,
  readSkillMdFile,
  deleteSkillMdFile,
  upsertPromptInConfig,
  deletePromptFromConfig,
  loadGeneratedTools,
  loadAgentPresets,
  fetchMcpToolsFromAgent,
  extractToolRefs,
  consumeSuggestionHandoff,
  clearSuggestionSession,
  DA_SKILLS_EDITOR_SUGGESTION_HANDOFF,
  DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT,
  DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT,
  DA_SKILLS_EDITOR_PROMPT_SEND,
} from './skills-editor-api.js';

const styles = await loadStyle(import.meta.url);

const CATALOG_TABS = [
  { id: 'skills', label: 'Skills' },
  { id: 'agents', label: 'Agents' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'mcps', label: 'MCPs' },
];

const TOOLS_TABS = [
  { id: 'available', label: 'Available tools' },
  { id: 'generated', label: 'Generated tools' },
];

class NxSkillsEditor extends LitElement {
  static properties = {
    _loading: { state: true },
    _catalogTab: { state: true },
    _toolsTab: { state: true },
    _catalogFilter: { state: true },
    _skills: { state: true },
    _skillStatuses: { state: true },
    _prompts: { state: true },
    _agents: { state: true },
    _mcpRows: { state: true },
    _mcpTools: { state: true },
    _generatedTools: { state: true },
    _configuredMcpServers: { state: true },
    _editingSkillId: { state: true },
    _formSkillId: { state: true },
    _formSkillBody: { state: true },
    _formIsEdit: { state: true },
    _formPromptTitle: { state: true },
    _formPromptCategory: { state: true },
    _formPromptBody: { state: true },
    _formPromptIsEdit: { state: true },
    _saveBusy: { state: true },
    _statusMsg: { state: true },
    _statusType: { state: true },
    _handoff: { state: true },
    _mcpKey: { state: true },
    _mcpUrl: { state: true },
  };

  constructor() {
    super();
    this._hash = new HashController(this);
    this._loading = true;
    this._catalogTab = 'skills';
    this._toolsTab = 'available';
    this._catalogFilter = 'all';
    this._skills = {};
    this._skillStatuses = {};
    this._prompts = [];
    this._agents = [];
    this._mcpRows = [];
    this._mcpTools = null;
    this._generatedTools = [];
    this._configuredMcpServers = {};
    this._clearForm();
    this._mcpKey = '';
    this._mcpUrl = '';
  }

  get _org() { return this._hash.value?.org; }

  get _site() { return this._hash.value?.site; }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._boundOnHandoff = () => this._applyHandoff();
    this._boundOnClearForm = () => this._clearForm();
    window.addEventListener(DA_SKILLS_EDITOR_SUGGESTION_HANDOFF, this._boundOnHandoff);
    window.addEventListener(DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT, this._boundOnClearForm);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(DA_SKILLS_EDITOR_SUGGESTION_HANDOFF, this._boundOnHandoff);
    window.removeEventListener(DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT, this._boundOnClearForm);
  }

  async updated() {
    if (!this._org || !this._site) return;
    const key = `${this._org}/${this._site}`;
    if (key !== this._loadedKey) {
      this._loadedKey = key;
      await this._reload();
    }
  }

  // ─── data loading ─────────────────────────────────────────────────────────

  async _reload() {
    if (!this._org || !this._site) return;
    this._loading = true;

    const [configResult, skillsResult, genTools] = await Promise.all([
      fetchDaConfigSheets(this._org, this._site),
      loadSkillsWithStatuses(this._org, this._site),
      loadGeneratedTools(this._org, this._site),
    ]);

    this._skills = skillsResult.map;
    this._skillStatuses = skillsResult.statuses;
    this._prompts = configResult.json?.prompts?.data || [];
    this._mcpRows = configResult.mcpRows || [];
    this._configuredMcpServers = configResult.configuredMcpServers || {};
    this._generatedTools = genTools;

    this._loading = false;
    this._applyHandoff();

    // Non-blocking: load agents and MCP tools after initial render
    loadAgentPresets(this._org, this._site).then((presets) => { this._agents = presets; });
    if (Object.keys(this._configuredMcpServers).length) {
      fetchMcpToolsFromAgent(this._configuredMcpServers)
        .then((tools) => { this._mcpTools = tools; });
    }
  }

  _applyHandoff() {
    const handoff = consumeSuggestionHandoff();
    if (handoff) {
      this._formSkillId = handoff.id || '';
      this._formSkillBody = handoff.body || '';
      this._formIsEdit = false;
      this._handoff = true;
      this._catalogTab = 'skills';
    }
  }

  // ─── form helpers ─────────────────────────────────────────────────────────

  _clearForm() {
    this._formSkillId = '';
    this._formSkillBody = '';
    this._formIsEdit = false;
    this._formPromptTitle = '';
    this._formPromptCategory = '';
    this._formPromptBody = '';
    this._formPromptIsEdit = false;
    this._saveBusy = false;
    this._statusMsg = '';
    this._statusType = '';
    this._handoff = false;
  }

  _setStatus(msg, type = 'ok') {
    this._statusMsg = msg;
    this._statusType = type;
    if (type === 'ok') setTimeout(() => { this._statusMsg = ''; }, 3000);
  }

  // ─── skill CRUD ───────────────────────────────────────────────────────────

  async _onSaveSkill(status = 'approved') {
    const id = this._formSkillId.trim();
    const body = this._formSkillBody;
    if (!id) {
      this._setStatus('Skill ID is required', 'err');
      return;
    }
    if (!body.trim()) {
      this._setStatus('Skill body is required', 'err');
      return;
    }

    this._saveBusy = true;
    this._statusMsg = '';

    const [configResult, fileResult] = await Promise.all([
      upsertSkillInConfig(this._org, this._site, id, body, { status }),
      writeSkillMdFile(this._org, this._site, id, body),
    ]);

    if (configResult.error || !fileResult.ok) {
      this._setStatus(configResult.error || 'Failed to write file', 'err');
      this._saveBusy = false;
      return;
    }

    this._setStatus(status === 'draft' ? 'Saved as draft' : 'Saved');
    this._saveBusy = false;
    this._handoff = false;
    clearSuggestionSession();
    await this._reload();

    if (this._formIsEdit) {
      this._formSkillBody = body;
    } else {
      this._clearForm();
    }
  }

  async _onDeleteSkill() {
    const id = this._formSkillId.trim();
    if (!id) return;
    this._saveBusy = true;

    await Promise.all([
      deleteSkillFromConfig(this._org, this._site, id),
      deleteSkillMdFile(this._org, this._site, id),
    ]);

    this._saveBusy = false;
    this._clearForm();
    await this._reload();
  }

  async _onEditSkill(skillId) {
    this._catalogTab = 'skills';
    this._formSkillId = skillId;
    this._formSkillBody = this._skills[skillId] || '';
    this._formIsEdit = true;
    this._statusMsg = '';

    const { text } = await readSkillMdFile(this._org, this._site, skillId);
    if (text) this._formSkillBody = text;
  }

  // ─── prompt CRUD ──────────────────────────────────────────────────────────

  async _onSavePrompt(status = 'approved') {
    const title = this._formPromptTitle.trim();
    const prompt = this._formPromptBody.trim();
    if (!title || !prompt) {
      this._setStatus('Title and prompt are required', 'err');
      return;
    }

    this._saveBusy = true;
    const result = await upsertPromptInConfig(
      this._org,
      this._site,
      { title, prompt, category: this._formPromptCategory },
      { status },
    );

    if (result.error) {
      this._setStatus(result.error, 'err');
    } else {
      this._setStatus('Prompt saved');
      this._formPromptTitle = '';
      this._formPromptCategory = '';
      this._formPromptBody = '';
      this._formPromptIsEdit = false;
    }
    this._saveBusy = false;
    await this._reload();
  }

  async _onDeletePrompt() {
    const title = this._formPromptTitle.trim();
    if (!title) return;
    this._saveBusy = true;
    await deletePromptFromConfig(this._org, this._site, title);
    this._saveBusy = false;
    this._formPromptTitle = '';
    this._formPromptCategory = '';
    this._formPromptBody = '';
    this._formPromptIsEdit = false;
    await this._reload();
  }

  _onEditPrompt(row) {
    this._formPromptTitle = row.title || '';
    this._formPromptCategory = row.category || '';
    this._formPromptBody = row.prompt || '';
    this._formPromptIsEdit = true;
    this._statusMsg = '';
    this._catalogTab = 'prompts';
  }

  // ─── MCP register ─────────────────────────────────────────────────────────

  async _onRegisterMcp() {
    const { registerMcpServer } = await import('./skills-editor-api.js');
    this._saveBusy = true;
    const result = await registerMcpServer(this._org, this._site, this._mcpKey, this._mcpUrl);
    if (!result.ok) this._setStatus(result.error || 'Failed', 'err');
    else {
      this._mcpKey = '';
      this._mcpUrl = '';
      this._setStatus('MCP server registered');
    }
    this._saveBusy = false;
    await this._reload();
  }

  // ─── prompt → chat dispatch ───────────────────────────────────────────────

  _dispatchPromptToChat(eventName, prompt) {
    window.dispatchEvent(new CustomEvent(eventName, {
      detail: { prompt: String(prompt || '') },
    }));
  }

  // ─── tool references for current skill body ──────────────────────────────

  get _toolRefs() {
    return extractToolRefs(this._formSkillBody);
  }

  // ─── render: top level ────────────────────────────────────────────────────

  render() {
    if (!this._org || !this._site) {
      return html`<div class="empty">Missing org or site</div>`;
    }
    if (this._loading) {
      return html`<div class="loading" aria-live="polite">Loading capabilities\u2026</div>`;
    }
    return html`<div class="root" role="region" aria-label="Skills Editor">
      ${this._renderFormCol()}
      ${this._renderToolsCol()}
      ${this._renderCatalogCol()}
    </div>`;
  }

  // ─── render: form column ──────────────────────────────────────────────────

  _renderFormCol() {
    const isSkills = this._catalogTab === 'skills' || this._catalogTab === 'agents';
    return html`
      <div class="col col-form" role="region" aria-label="Editor">
        ${isSkills ? this._renderSkillForm() : nothing}
        ${this._catalogTab === 'prompts' ? this._renderPromptForm() : nothing}
        ${this._catalogTab === 'mcps' ? this._renderMcpForm() : nothing}
      </div>
    `;
  }

  _renderSkillForm() {
    return html`
      <form class="form" @submit=${(e) => e.preventDefault()}>
        <h3>${this._formIsEdit ? 'Edit Skill' : 'New Skill'}</h3>
        <input
          type="text"
          placeholder="skill-id"
          aria-label="Skill ID"
          .value=${this._formSkillId}
          ?readonly=${this._formIsEdit}
          @input=${(e) => { this._formSkillId = e.target.value; }}
        >
        <div class="${this._handoff ? 'handoff-wrap' : ''}">
          <textarea
            placeholder="Create or edit a tool"
            aria-label="Skill markdown"
            .value=${this._formSkillBody}
            @input=${(e) => { this._formSkillBody = e.target.value; }}
          ></textarea>
        </div>
        <div class="save-row" role="toolbar" aria-label="Skill actions">
          ${this._formIsEdit || this._handoff ? html`
            <button type="button" data-variant="secondary"
              ?disabled=${this._saveBusy}
              @click=${() => { this._clearForm(); }}
            >Dismiss</button>
          ` : nothing}
          <button type="button" data-variant="secondary"
            ?disabled=${this._saveBusy}
            @click=${() => this._onSaveSkill('draft')}
          >Save as Draft</button>
          <button type="button" data-variant="accent"
            ?disabled=${this._saveBusy}
            @click=${() => this._onSaveSkill('approved')}
          >Save</button>
          ${this._formIsEdit ? html`
            <button type="button" data-variant="negative"
              ?disabled=${this._saveBusy}
              @click=${this._onDeleteSkill}
            >Delete</button>
          ` : nothing}
        </div>
        ${this._statusMsg ? html`
          <output class="msg ${this._statusType === 'err' ? 'msg-err' : 'msg-ok'}">
            ${this._statusMsg}
          </output>
        ` : nothing}
      </form>
    `;
  }

  _renderPromptForm() {
    return html`
      <form class="form" @submit=${(e) => e.preventDefault()}>
        <h3>${this._formPromptIsEdit ? 'Edit Prompt' : 'New Prompt'}</h3>
        <input type="text" placeholder="Title" aria-label="Prompt title"
          .value=${this._formPromptTitle}
          @input=${(e) => { this._formPromptTitle = e.target.value; }}
        >
        <input type="text" placeholder="Category" aria-label="Prompt category"
          .value=${this._formPromptCategory}
          @input=${(e) => { this._formPromptCategory = e.target.value; }}
        >
        <textarea aria-label="Prompt"
          .value=${this._formPromptBody}
          @input=${(e) => { this._formPromptBody = e.target.value; }}
        ></textarea>
        <div class="save-row" role="toolbar" aria-label="Prompt actions">
          <button type="button" data-variant="secondary"
            ?disabled=${this._saveBusy}
            @click=${() => this._onSavePrompt('draft')}
          >Save as Draft</button>
          <button type="button" data-variant="accent"
            ?disabled=${this._saveBusy}
            @click=${() => this._onSavePrompt('approved')}
          >Save</button>
          ${this._formPromptIsEdit ? html`
            <button type="button" data-variant="negative"
              ?disabled=${this._saveBusy}
              @click=${this._onDeletePrompt}
            >Delete</button>
          ` : nothing}
        </div>
        ${this._statusMsg ? html`
          <output class="msg ${this._statusType === 'err' ? 'msg-err' : 'msg-ok'}">
            ${this._statusMsg}
          </output>
        ` : nothing}
      </form>
    `;
  }

  _renderMcpForm() {
    return html`
      <form class="form" @submit=${(e) => e.preventDefault()}>
        <h3>Register MCP Server</h3>
        <input type="text" placeholder="server-key" aria-label="MCP server key"
          .value=${this._mcpKey}
          @input=${(e) => { this._mcpKey = e.target.value; }}
        >
        <input type="text" placeholder="SSE endpoint URL" aria-label="MCP server URL"
          .value=${this._mcpUrl}
          @input=${(e) => { this._mcpUrl = e.target.value; }}
        >
        <div class="save-row" role="toolbar" aria-label="MCP actions">
          <button type="button" data-variant="accent"
            ?disabled=${this._saveBusy || !this._mcpKey.trim() || !this._mcpUrl.trim()}
            @click=${this._onRegisterMcp}
          >Register</button>
        </div>
      </form>
    `;
  }

  // ─── render: tools column ─────────────────────────────────────────────────

  _renderToolsCol() {
    const refs = new Set(this._toolRefs);
    return html`
      <div class="col col-tools" role="region" aria-label="Tools">
        <nx-tabs
          .items=${TOOLS_TABS}
          .active=${this._toolsTab}
          @tab-change=${(e) => { this._toolsTab = e.detail.id; }}
        ></nx-tabs>
        <div class="tools-list">
          ${this._toolsTab === 'available' ? this._renderAvailableTools(refs) : nothing}
          ${this._toolsTab === 'generated' ? this._renderGeneratedTools() : nothing}
        </div>
      </div>
    `;
  }

  _renderAvailableTools(refs) {
    const builtIn = [
      'da_get_source', 'da_put_source', 'da_list_children',
      'da_create_page', 'da_delete_source',
    ];
    const mcpToolIds = [];
    if (this._mcpTools?.servers) {
      this._mcpTools.servers.forEach((s) => {
        (s.tools || []).forEach((t) => {
          mcpToolIds.push(`mcp__${s.id}__${t.name}`);
        });
      });
    }
    const all = [...builtIn, ...mcpToolIds];
    if (!all.length) return html`<div class="empty">No tools available</div>`;

    return all.map((toolId) => {
      const isMcp = toolId.startsWith('mcp__');
      return html`
        <div class="tool-row ${refs.has(toolId) ? 'is-referenced' : ''}" data-tool-id=${toolId}>
          <span class="badge">${isMcp ? 'MCP' : 'DA'}</span>
          <span class="tool-id">${toolId}</span>
        </div>
      `;
    });
  }

  _renderGeneratedTools() {
    if (!this._generatedTools.length) {
      return html`<div class="empty">No generated tools</div>`;
    }
    return this._generatedTools.map((def) => html`
      <div class="tool-row">
        <span class="badge">GEN</span>
        <span class="tool-id">${def.id || def.name || '(unnamed)'}</span>
      </div>
    `);
  }

  // ─── render: catalog column ───────────────────────────────────────────────

  _renderCatalogCol() {
    return html`
      <div class="col col-catalog" role="region" aria-label="Catalog">
        <nx-tabs
          .items=${CATALOG_TABS}
          .active=${this._catalogTab}
          @tab-change=${(e) => { this._catalogTab = e.detail.id; }}
        ></nx-tabs>
        ${this._catalogTab === 'skills' ? this._renderSkillsCatalog() : nothing}
        ${this._catalogTab === 'agents' ? this._renderAgentsCatalog() : nothing}
        ${this._catalogTab === 'prompts' ? this._renderPromptsCatalog() : nothing}
        ${this._catalogTab === 'mcps' ? this._renderMcpsCatalog() : nothing}
      </div>
    `;
  }

  _renderSkillsCatalog() {
    const ids = Object.keys(this._skills);
    const filtered = this._catalogFilter === 'all' ? ids
      : ids.filter((id) => this._skillStatuses[id] === this._catalogFilter);

    return html`
      <div class="catalog-toolbar" role="toolbar" aria-label="Filter skills">
        ${['all', 'approved', 'draft'].map((f) => html`
          <button type="button"
            class="filter-chip ${this._catalogFilter === f ? 'is-active' : ''}"
            aria-pressed=${this._catalogFilter === f ? 'true' : 'false'}
            @click=${() => { this._catalogFilter = f; }}
          >${f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}</button>
        `)}
      </div>
      <div class="catalog-scroll" role="list" aria-label="Skills">
        ${!filtered.length
          ? html`<div class="empty">No skills found</div>`
          : filtered.map((id) => this._renderSkillCard(id))}
      </div>
    `;
  }

  _renderSkillCard(id) {
    const title = this._extractTitle(this._skills[id]) || id;
    const status = this._skillStatuses[id] || 'approved';
    const isEditing = this._formIsEdit && this._formSkillId === id;
    const abbr = status === 'draft' ? '✏' : '✓';
    return html`
      <article role="listitem" data-testid="skill-card" data-skill-id=${id}>
        <nx-card
          heading=${title}
          pill=${abbr}
          ?selected=${isEditing}
          @click=${() => this._onEditSkill(id)}
        >
          <input slot="actions" type="checkbox"
            aria-label="Edit ${id}"
            .checked=${isEditing}
            @click=${(e) => e.stopPropagation()}
            @change=${() => this._onEditSkill(id)}
          >
        </nx-card>
      </article>
    `;
  }

  _renderAgentsCatalog() {
    return html`
      <div class="catalog-scroll" role="list" aria-label="Agents">
        <h3>Agent Presets</h3>
        ${!this._agents.length
          ? html`<div class="empty">No agent presets found</div>`
          : this._agents.map((a) => html`
            <article role="listitem" data-testid="agent-card">
              <nx-card heading=${a.id}></nx-card>
            </article>
          `)}
      </div>
    `;
  }

  _renderPromptsCatalog() {
    return html`
      <div class="catalog-scroll" role="list" aria-label="Prompts">
        ${!this._prompts.length
          ? html`<div class="empty">No prompts found</div>`
          : this._prompts.map((row) => html`
            <article role="listitem" data-testid="prompt-card" data-prompt-title=${row.title || ''}>
              <nx-card heading=${row.title || '(untitled)'} subheading=${row.category || ''}>
                <button slot="actions" type="button"
                  aria-label="Edit ${row.title}"
                  @click=${() => this._onEditPrompt(row)}
                >Edit</button>
                <button slot="actions" type="button"
                  aria-label="Add ${row.title} to chat"
                  @click=${() => this._dispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT, row.prompt)}
                >Add</button>
                <button slot="actions" type="button"
                  aria-label="Send ${row.title}"
                  @click=${() => this._dispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_SEND, row.prompt)}
                >Send</button>
              </nx-card>
            </article>
          `)}
      </div>
    `;
  }

  _renderMcpsCatalog() {
    return html`
      <div class="catalog-scroll" role="list" aria-label="MCP servers">
        <h3>MCP Servers</h3>
        ${!this._mcpRows.length
          ? html`<div class="empty">No MCP servers registered</div>`
          : this._mcpRows.map((row) => html`
            <article role="listitem" data-testid="mcp-card">
              <nx-card heading=${row.key || '(unnamed)'} subheading=${row.url || row.value || ''}></nx-card>
            </article>
          `)}
      </div>
    `;
  }

  // ─── utility ──────────────────────────────────────────────────────────────

  _extractTitle(md) {
    if (!md) return '';
    const match = md.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : '';
  }
}

customElements.define('nx-skills-editor', NxSkillsEditor);
