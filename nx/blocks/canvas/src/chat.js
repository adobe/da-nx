// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';
// eslint-disable-next-line import/no-named-as-default
import ChatController from './chat-controller.js';
import { initIms } from '../../../utils/daFetch.js';
import { loadSkills, saveSkill, deleteSkill } from '../../skills-editor/utils/utils.js';

const style = await getStyle(import.meta.url);
const imsInitial = await initIms();
const token = imsInitial?.accessToken?.token ?? null;

const DOCUMENT_UPDATED_EVENT = 'da:agent-content-updated';

function getUserIdFromToken(jwtToken) {
  try {
    const payload = JSON.parse(atob(jwtToken.split('.')[1]));
    return payload.userId || payload.sub || payload.email || null;
  } catch {
    return null;
  }
}

function getContextFromHash() {
  const hash = window.location.hash || '';
  const path = hash.replace(/^#\/?/, '').trim();
  const segments = path ? path.split('/').filter(Boolean) : [];
  const [org = '', repo = '', ...rest] = segments;
  return {
    org,
    site: repo,
    path: rest.join('/'),
    view: 'edit',
  };
}

/**
 * Chat panel component with real AI agent connection.
 * Self-contained: reads org/repo/path from the URL hash; IMS token via initIms (nx).
 * @fires da:agent-content-updated - when the agent updates the document
 */
class Chat extends LitElement {
  static properties = {
    header: { type: String },
    onPageContextItems: { type: Array },
    _connected: { state: true },
    _messages: { state: true },
    _toolCards: { state: true },
    _streamingText: { state: true },
    _inputValue: { state: true },
    _isThinking: { state: true },
    _isAwaitingApproval: { state: true },
    _statusText: { state: true },
    _skillsLibraryTab: { state: true },
    _openToolCards: { state: true },
    _mcpServers: { state: true },
    _mcpLoading: { state: true },
    _mcpScannedAt: { state: true },
    _skills: { state: true },
    _skillsLoading: { state: true },
    _selectedSkill: { state: true },
    _newSkillMode: { state: true },
    _newSkillName: { state: true },
    _agents: { state: true },
    _agentsLoading: { state: true },
    _activeAgentId: { state: true },
    _newAgentMode: { state: true },
    _selectedAgent: { state: true },
  };

  constructor() {
    super();
    this.header = 'Assistant';
    this.onPageContextItems = [];
    this._connected = false;
    this._messages = [];
    this._inputValue = '';
    this._isThinking = false;
    this._isAwaitingApproval = false;
    this._statusText = '';
    this._toolCards = new Map();
    this._streamingText = '';
    this._skillsLibraryTab = 'skills';
    this._openToolCards = new Set();
    this._mcpServers = null;
    this._mcpLoading = false;
    this._mcpScannedAt = null;
    this._mcpPollTimer = null;
    this._skills = null;
    this._skillsLoading = false;
    this._selectedSkill = null;
    this._newSkillMode = false;
    this._newSkillName = '';
    this._agents = null;
    this._agentsLoading = false;
    this._activeAgentId = null;
    this._newAgentMode = false;
    this._selectedAgent = null;
    this._chatController = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._ensureController();
    this._chatController?.connect();
  }

  disconnectedCallback() {
    this._chatController?.disconnect();
    this._stopMcpPoll();
    super.disconnectedCallback();
  }

  _ensureController() {
    if (this._chatController) return;

    // Use a unique room per user per project so each person gets their own
    // isolated Durable Object instance with separate conversation history.
    const { org, site } = getContextFromHash();
    const userId = getUserIdFromToken(token);
    const agentRoom = org && site && userId
      ? `${org}--${site}--${userId}`
      : 'default';

    this._chatController = new ChatController({
      name: agentRoom,
      getContext: getContextFromHash,
      getImsToken: async () => (await initIms())?.accessToken?.token ?? null,
      onUpdate: () => {
        this._messages = [...this._chatController.messages];
        this._toolCards = new Map(this._chatController.toolCards);
        this._streamingText = this._chatController.streamingText;
        this._isThinking = this._chatController.isThinking;
        this._isAwaitingApproval = this._chatController.isAwaitingApproval;
        this._scrollMessagesToBottom();
      },
      onStatusChange: (statusText) => {
        this._statusText = statusText || '';
      },
      onConnectionChange: (connected) => {
        this._connected = connected;
      },
      onDocumentUpdated: (payload) => {
        window.dispatchEvent(new CustomEvent(DOCUMENT_UPDATED_EVENT, {
          detail: { ...payload, ts: Date.now() },
        }));
      },
    });
  }

  _scrollMessagesToBottom() {
    this.updateComplete.then(() => {
      const el = this.shadowRoot?.querySelector('.chat-messages');
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  _handleInput(e) {
    this._inputValue = e.target.value;
  }

  _handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._sendMessage();
    }
  }

  _sendMessage() {
    const content = this._inputValue.trim();
    if (!content || this._isThinking || this._isAwaitingApproval || !this._chatController) return;
    this._inputValue = '';
    this._chatController.sendMessage(content, this.onPageContextItems ?? []);
    this.dispatchEvent(new CustomEvent('da-chat-message-sent', { bubbles: true }));
  }

  _stopRequest() {
    this._chatController?.stop();
  }

  _clearChat() {
    this._chatController?.clearHistory();
  }

  _sendToolApproval(toolCallId, approved) {
    if (!toolCallId || !this._chatController) return;
    this._chatController.approveToolCall({ toolCallId, approved });
  }

  _sendPrompt(prompt) {
    if (!prompt || this._isThinking || this._isAwaitingApproval || !this._connected) return;
    this._chatController?.sendMessage(prompt, this.onPageContextItems ?? []);
    this.dispatchEvent(new CustomEvent('da-chat-message-sent', { bubbles: true }));
  }

  _onSkillsNavChange(e) {
    const { value } = e.target;
    if (value) this._skillsLibraryTab = value;
    if (value === 'mcp') {
      if (!this._mcpServers && !this._mcpLoading) this._fetchMcpServers();
      this._startMcpPoll();
    } else {
      this._stopMcpPoll();
    }
    if (value === 'skills' && !this._skills && !this._skillsLoading) {
      this._fetchSkills();
    }
    if (value === 'agents' && !this._agents && !this._agentsLoading) {
      this._fetchAgents();
    }
  }

  // eslint-disable-next-line class-methods-use-this
  _formatTimeAgo(isoString) {
    const delta = Date.now() - new Date(isoString).getTime();
    if (delta < 60000) return 'just now';
    if (delta < 3600000) return `${Math.floor(delta / 60000)}m ago`;
    if (delta < 86400000) return `${Math.floor(delta / 3600000)}h ago`;
    return `${Math.floor(delta / 86400000)}d ago`;
  }

  _startMcpPoll() {
    this._stopMcpPoll();
    this._mcpPollTimer = setInterval(() => {
      if (!this._mcpLoading) this._fetchMcpServers();
    }, 60000);
  }

  _stopMcpPoll() {
    if (this._mcpPollTimer) {
      clearInterval(this._mcpPollTimer);
      this._mcpPollTimer = null;
    }
  }

  async _fetchMcpServers() {
    const { org, site } = getContextFromHash();
    if (!org || !site) return;
    this._mcpLoading = true;
    try {
      const imsToken = (await initIms())?.accessToken?.token;
      const headers = imsToken ? { Authorization: `Bearer ${imsToken}` } : {};
      const DA_ORIGIN = localStorage.getItem('da-admin')
        || 'https://admin.da.live';
      const resp = await fetch(
        `${DA_ORIGIN}/mcp-discovery/${org}/${site}`,
        { headers },
      );
      if (resp.ok) {
        const data = await resp.json();
        this._mcpServers = data;
        this._mcpScannedAt = data.scannedAt || data.readAt || null;
      } else {
        this._mcpServers = { mcpServers: {}, warnings: [], servers: [] };
      }
    } catch {
      this._mcpServers = { mcpServers: {}, warnings: [], servers: [] };
    } finally {
      this._mcpLoading = false;
    }
  }

  _refreshMcpServers() {
    this._mcpServers = null;
    this._fetchMcpServers();
  }

  async _fetchSkills() {
    const { org, site } = getContextFromHash();
    if (!org) return;
    this._skillsLoading = true;
    try {
      const skills = await loadSkills(org, site);
      this._skills = skills;
      const ids = Object.keys(skills);
      if (ids.length > 0 && !this._selectedSkill) {
        [this._selectedSkill] = ids;
      }
    } catch {
      this._skills = {};
    } finally {
      this._skillsLoading = false;
    }
  }

  _refreshSkills() {
    this._skills = null;
    this._selectedSkill = null;
    this._newSkillMode = false;
    this._fetchSkills();
  }

  _onSkillSelect(e) {
    const { value } = e.target;
    if (value === '__new__') {
      this._newSkillMode = true;
      this._selectedSkill = null;
      this._newSkillName = '';
      return;
    }
    this._newSkillMode = false;
    this._selectedSkill = value;
  }

  _onNewSkillNameInput(e) {
    this._newSkillName = e.target.value.replaceAll(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  }

  async _saveCurrentSkill() {
    const { org, site } = getContextFromHash();
    const prefix = site ? `/${org}/${site}` : `/${org}`;
    const textarea = this.shadowRoot?.querySelector('.skill-editor-textarea');
    const content = textarea?.value ?? '';

    if (this._newSkillMode) {
      const id = this._newSkillName.trim();
      if (!id) return;
      const result = await saveSkill(prefix, id, content);
      if (result.error) return;
      this._skills = { ...this._skills, [id]: content };
      this._selectedSkill = id;
      this._newSkillMode = false;
    } else if (this._selectedSkill) {
      const result = await saveSkill(prefix, this._selectedSkill, content);
      if (result.error) return;
      this._skills = { ...this._skills, [this._selectedSkill]: content };
    }
  }

  async _deleteCurrentSkill() {
    if (!this._selectedSkill) return;
    const { org, site } = getContextFromHash();
    const prefix = site ? `/${org}/${site}` : `/${org}`;
    const result = await deleteSkill(prefix, this._selectedSkill);
    if (result.error) return;
    const next = { ...this._skills };
    delete next[this._selectedSkill];
    this._skills = next;
    const ids = Object.keys(next);
    this._selectedSkill = ids.length > 0 ? ids[0] : null;
  }

  _renderSkillsContent() {
    if (this._skillsLoading) {
      return html`<div class="chat-skills-empty"><p class="chat-skills-empty-text">Loading skills...</p></div>`;
    }

    if (!this._skills) {
      return html`
        <div class="chat-skills-empty">
          <p class="chat-skills-empty-text">Select a site to view skills.</p>
        </div>`;
    }

    const ids = Object.keys(this._skills);

    if (ids.length === 0 && !this._newSkillMode) {
      return html`
        <div class="chat-skills-empty">
          <p class="chat-skills-empty-text">No skills found.</p>
          <p class="chat-skills-empty-text">Skills are markdown documents under <code>.da/skills/</code> that teach the assistant reusable workflows.</p>
          <sp-button variant="accent" size="s" @click=${() => { this._newSkillMode = true; }}>Create skill</sp-button>
          <sp-button variant="secondary" size="s" @click=${() => this._refreshSkills()}>Refresh</sp-button>
        </div>`;
    }

    const editorContent = this._newSkillMode
      ? '# New Skill\n\nDescribe this skill here.\n'
      : (this._skills[this._selectedSkill] ?? '');

    return html`
      <div class="skills-panel">
        <div class="skills-toolbar">
          <select class="skills-select" @change=${this._onSkillSelect}>
            ${ids.map((id) => html`
              <option value="${id}" ?selected=${id === this._selectedSkill}>${id}</option>
            `)}
            <option value="__new__" ?selected=${this._newSkillMode}>+ New skill</option>
          </select>
          <sp-button variant="secondary" size="s" @click=${() => this._refreshSkills()}>Refresh</sp-button>
        </div>
        ${this._newSkillMode ? html`
          <div class="skills-new-row">
            <sp-textfield
              class="skills-new-name"
              placeholder="skill-name"
              size="s"
              .value=${this._newSkillName}
              @input=${this._onNewSkillNameInput}
            ></sp-textfield>
          </div>
        ` : nothing}
        <textarea class="skill-editor-textarea" .value=${editorContent}></textarea>
        <div class="skills-actions">
          ${this._newSkillMode ? html`
            <sp-button variant="secondary" size="s" @click=${() => { this._newSkillMode = false; if (ids.length > 0) [this._selectedSkill] = ids; }}>Cancel</sp-button>
          ` : html`
            <sp-button variant="negative" size="s" @click=${this._deleteCurrentSkill}>Delete</sp-button>
          `}
          <sp-button variant="accent" size="s" @click=${this._saveCurrentSkill}>Save</sp-button>
        </div>
      </div>`;
  }

  async _fetchAgents() {
    const { org, site } = getContextFromHash();
    if (!org) return;
    this._agentsLoading = true;
    try {
      const imsToken = (await initIms())?.accessToken?.token;
      const headers = imsToken ? { Authorization: `Bearer ${imsToken}` } : {};
      const DA_ORIGIN = localStorage.getItem('da-admin') || 'https://admin.da.live';
      const path = site ? `/${org}/${site}/.da/agents` : `/${org}/.da/agents`;
      const resp = await fetch(`${DA_ORIGIN}/list${path}`, { headers });
      if (resp.ok) {
        const items = await resp.json();
        const jsonItems = (Array.isArray(items) ? items : []).filter((i) => i.ext === 'json');
        const agents = {};
        await Promise.all(jsonItems.map(async (item) => {
          try {
            const srcResp = await fetch(`${DA_ORIGIN}/source${item.path}`, { headers });
            if (srcResp.ok) {
              const text = await srcResp.text();
              agents[item.name.replace(/\.json$/, '')] = JSON.parse(text);
            }
          } catch { /* skip invalid */ }
        }));
        this._agents = agents;
      } else {
        this._agents = {};
      }
    } catch {
      this._agents = {};
    } finally {
      this._agentsLoading = false;
    }
  }

  _refreshAgents() {
    this._agents = null;
    this._selectedAgent = null;
    this._newAgentMode = false;
    this._fetchAgents();
  }

  _onAgentSelect(e) {
    const { value } = e.target;
    if (value === '__new__') {
      this._newAgentMode = true;
      this._selectedAgent = null;
      return;
    }
    this._newAgentMode = false;
    this._selectedAgent = value;
  }

  _activateAgent(agentId) {
    this._activeAgentId = agentId || null;
    if (this._chatController) {
      this._chatController.agentId = this._activeAgentId;
    }
  }

  async _saveAgent() {
    const { org, site } = getContextFromHash();
    const prefix = site ? `/${org}/${site}` : `/${org}`;
    const form = this.shadowRoot?.querySelector('.agent-editor-form');
    if (!form) return;

    const id = this._newAgentMode
      ? form.querySelector('[name="agent-id"]')?.value?.trim()
      : this._selectedAgent;
    if (!id) return;

    const preset = {
      name: form.querySelector('[name="agent-name"]')?.value || id,
      description: form.querySelector('[name="agent-description"]')?.value || '',
      systemPrompt: form.querySelector('[name="agent-prompt"]')?.value || '',
      skills: (form.querySelector('[name="agent-skills"]')?.value || '').split(',').map((s) => s.trim()).filter(Boolean),
      mcpServers: (form.querySelector('[name="agent-mcpservers"]')?.value || '').split(',').map((s) => s.trim()).filter(Boolean),
    };

    const imsToken = (await initIms())?.accessToken?.token;
    const headers = imsToken ? { Authorization: `Bearer ${imsToken}` } : {};
    const DA_ORIGIN = localStorage.getItem('da-admin') || 'https://admin.da.live';
    const body = new FormData();
    body.append('data', new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }));
    await fetch(`${DA_ORIGIN}/source${prefix}/.da/agents/${id}.json`, { method: 'POST', headers, body });

    this._agents = { ...this._agents, [id]: preset };
    this._selectedAgent = id;
    this._newAgentMode = false;
  }

  async _deleteAgent() {
    if (!this._selectedAgent) return;
    const { org, site } = getContextFromHash();
    const prefix = site ? `/${org}/${site}` : `/${org}`;
    const imsToken = (await initIms())?.accessToken?.token;
    const headers = imsToken ? { Authorization: `Bearer ${imsToken}` } : {};
    const DA_ORIGIN = localStorage.getItem('da-admin') || 'https://admin.da.live';
    await fetch(`${DA_ORIGIN}/source${prefix}/.da/agents/${this._selectedAgent}.json`, { method: 'DELETE', headers });

    if (this._activeAgentId === this._selectedAgent) this._activateAgent(null);
    const next = { ...this._agents };
    delete next[this._selectedAgent];
    this._agents = next;
    const ids = Object.keys(next);
    this._selectedAgent = ids.length > 0 ? ids[0] : null;
  }

  _renderAgentsContent() {
    if (this._agentsLoading) {
      return html`<div class="chat-skills-empty"><p class="chat-skills-empty-text">Loading agents...</p></div>`;
    }

    if (!this._agents) {
      return html`<div class="chat-skills-empty"><p class="chat-skills-empty-text">Select a site to view agents.</p></div>`;
    }

    const ids = Object.keys(this._agents);

    if (ids.length === 0 && !this._newAgentMode) {
      return html`
        <div class="chat-skills-empty">
          <p class="chat-skills-empty-text">No agent presets found.</p>
          <p class="chat-skills-empty-text">Agent presets bundle a system prompt, skills, and MCP servers into a reusable persona.</p>
          <sp-button variant="accent" size="s" @click=${() => { this._newAgentMode = true; }}>Create agent</sp-button>
          <sp-button variant="secondary" size="s" @click=${() => this._refreshAgents()}>Refresh</sp-button>
        </div>`;
    }

    const selected = this._newAgentMode ? null : (this._agents[this._selectedAgent] ?? null);
    const isActive = this._selectedAgent && this._activeAgentId === this._selectedAgent;

    return html`
      <div class="agents-panel">
        <div class="agents-toolbar">
          <select class="agents-select" @change=${this._onAgentSelect}>
            ${ids.map((id) => html`
              <option value="${id}" ?selected=${id === this._selectedAgent}>${this._agents[id]?.name || id}</option>
            `)}
            <option value="__new__" ?selected=${this._newAgentMode}>+ New agent</option>
          </select>
          <sp-button variant="secondary" size="s" @click=${() => this._refreshAgents()}>Refresh</sp-button>
        </div>
        <div class="agent-editor-form">
          ${this._newAgentMode ? html`
            <label class="agent-field-label">ID</label>
            <sp-textfield name="agent-id" placeholder="seo-agent" size="s"></sp-textfield>
          ` : nothing}
          <label class="agent-field-label">Name</label>
          <sp-textfield name="agent-name" size="s" .value=${selected?.name ?? ''}></sp-textfield>
          <label class="agent-field-label">Description</label>
          <sp-textfield name="agent-description" size="s" .value=${selected?.description ?? ''}></sp-textfield>
          <label class="agent-field-label">System Prompt</label>
          <textarea name="agent-prompt" class="agent-prompt-textarea" .value=${selected?.systemPrompt ?? ''}></textarea>
          <label class="agent-field-label">Skills (comma-separated IDs)</label>
          <sp-textfield name="agent-skills" size="s" .value=${(selected?.skills ?? []).join(', ')}></sp-textfield>
          <label class="agent-field-label">MCP Servers (comma-separated IDs)</label>
          <sp-textfield name="agent-mcpservers" size="s" .value=${(selected?.mcpServers ?? []).join(', ')}></sp-textfield>
        </div>
        <div class="agents-actions">
          ${this._newAgentMode ? html`
            <sp-button variant="secondary" size="s" @click=${() => { this._newAgentMode = false; if (ids.length > 0) [this._selectedAgent] = ids; }}>Cancel</sp-button>
          ` : html`
            <sp-button variant="negative" size="s" @click=${this._deleteAgent}>Delete</sp-button>
            <sp-button variant="${isActive ? 'secondary' : 'primary'}" size="s"
              @click=${() => this._activateAgent(isActive ? null : this._selectedAgent)}>
              ${isActive ? 'Deactivate' : 'Activate'}
            </sp-button>
          `}
          <sp-button variant="accent" size="s" @click=${this._saveAgent}>Save</sp-button>
        </div>
      </div>`;
  }

  _renderMcpContent() {
    if (this._mcpLoading) {
      return html`<div class="chat-skills-empty"><p class="chat-skills-empty-text">Loading MCP servers...</p></div>`;
    }

    const servers = this._mcpServers?.servers || [];
    const warnings = this._mcpServers?.warnings || [];
    const hasServers = servers.length > 0;

    if (!hasServers && warnings.length === 0) {
      return html`
        <div class="chat-skills-empty">
          <p class="chat-skills-empty-text">No MCP servers found.</p>
          <p class="chat-skills-empty-text">Add servers under <code>mcp-servers/&lt;id&gt;/mcp.json</code> in your repository.</p>
          <sp-button variant="secondary" size="s" @click=${() => this._refreshMcpServers()}>Refresh</sp-button>
        </div>`;
    }

    const scannedAgo = this._mcpScannedAt ? this._formatTimeAgo(this._mcpScannedAt) : null;
    const staleThreshold = 5 * 60 * 1000;
    const elapsed = this._mcpScannedAt
      ? Date.now() - new Date(this._mcpScannedAt).getTime()
      : 0;
    const isStale = this._mcpScannedAt && elapsed > staleThreshold;

    return html`
      <div class="mcp-server-list">
        <div class="mcp-header">
          <div class="mcp-header-left">
            <span class="mcp-header-title">Discovered Servers</span>
            ${scannedAgo ? html`<span class="mcp-scanned-at ${isStale ? 'stale' : ''}">Scanned ${scannedAgo}</span>` : nothing}
          </div>
          <sp-button variant="secondary" size="s" @click=${() => this._refreshMcpServers()}>Refresh</sp-button>
        </div>
        ${servers.map((s) => html`
          <div class="mcp-server-item ${s.status}">
            <span class="mcp-server-id">${s.id}</span>
            <span class="mcp-server-status ${s.status}">${s.status}</span>
          </div>
        `)}
        ${warnings.length > 0 ? html`
          <div class="mcp-warnings">
            <div class="mcp-warnings-title">Warnings</div>
            ${warnings.map((w) => html`
              <div class="mcp-warning-item">
                <span class="mcp-warning-id">${w.serverId}</span>
                <span class="mcp-warning-msg">${w.message}</span>
              </div>
            `)}
          </div>
        ` : ''}
      </div>`;
  }

  _toggleToolCard(toolCallId) {
    if (!toolCallId) return;
    const next = new Set(this._openToolCards);
    if (next.has(toolCallId)) {
      next.delete(toolCallId);
    } else {
      next.add(toolCallId);
    }
    this._openToolCards = next;
  }

  /**
   * Label for a context item pill: block name if block, else first 20 chars + '...'
   * @param {{ blockName?: string, innerText: string }} item
   * @returns {string}
   */
  // eslint-disable-next-line class-methods-use-this
  _contextPillLabel(item) {
    if (!item) return '';
    if (item.blockName && item.blockName.trim()) return item.blockName.trim();
    const text = (item.innerText || '').trim();
    if (text.length <= 20) return text;
    return `${text.slice(0, 20)}...`;
  }

  _removeContextItem(index) {
    this.dispatchEvent(new CustomEvent('chat-context-remove', {
      bubbles: true,
      composed: true,
      detail: { index },
    }));
  }

  _renderToolCard(toolCallId) {
    const card = this._toolCards?.get(toolCallId);
    if (!card) return '';

    const {
      toolName, input, state, output,
    } = card;
    const isApproval = state === 'approval-requested';
    const isRejected = state === 'rejected';
    const isDone = state === 'done';
    const isError = state === 'error';
    const isOpen = this._openToolCards?.has(toolCallId);

    const icon = isApproval ? '⚠️' : '🔧';

    let statusText = 'running';
    let statusClass = 'running';
    if (isApproval) {
      statusText = 'needs approval';
      statusClass = 'approval';
    } else if (state === 'approved') {
      statusText = 'approved…';
      statusClass = 'running';
    } else if (isRejected) {
      statusText = 'rejected';
      statusClass = 'rejected';
    } else if (isError) {
      statusText = 'error';
      statusClass = 'error';
    } else if (isDone) {
      statusText = 'done';
      statusClass = 'ok';
    }

    // eslint-disable-next-line no-nested-ternary
    const cardStateClass = isApproval ? 'needs-approval' : (isError || isRejected ? 'error' : (isDone ? 'done' : ''));

    const inputText = input && typeof input === 'object' ? JSON.stringify(input, null, 2) : null;
    const outputText = output ? JSON.stringify(output, null, 2) : null;

    return html`
      <div class="tool-card ${cardStateClass} ${isOpen ? 'open' : ''}">
        <div class="tool-summary" @click=${() => this._toggleToolCard(toolCallId)}>
          <span class="tool-icon">${icon}</span>
          <span class="tool-name-label">${toolName}</span>
          <span class="tool-status ${statusClass}">${statusText}</span>
          <span class="tool-chevron">▶</span>
        </div>
        <div class="tool-body">
          ${inputText ? html`
            <div class="tool-section-label">Input</div>
            <pre class="tool-code">${inputText}</pre>
          ` : ''}
          ${outputText ? html`
            <div class="tool-section-label">Output</div>
            <pre class="tool-code output">${outputText}</pre>
          ` : ''}
        </div>
        ${isApproval ? html`
          <div class="approval-footer">
            <button class="btn-approve" @click=${() => this._sendToolApproval(toolCallId, true)}>Approve</button>
            <button class="btn-reject" @click=${() => this._sendToolApproval(toolCallId, false)}>Reject</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderWelcome() {
    const prompts = [
      'Summarize this page',
      'Suggest better headings',
      'Improve clarity and tone',
      'Find accessibility issues',
    ];

    return html`
      <div class="chat-empty-state">
        <div class="chat-empty-title">Start a conversation</div>
        <div class="chat-empty-actions">
          ${prompts.map((prompt) => html`
            <button
              class="chat-welcome-btn"
              ?disabled=${this._isThinking || !this._connected}
              @click=${() => this._sendPrompt(prompt)}
            >
              ${prompt}
            </button>
          `)}
        </div>
      </div>
    `;
  }

  _onSkillsModalOpen() {
    if (this._skillsLibraryTab === 'skills' && !this._skills && !this._skillsLoading) {
      this._fetchSkills();
    }
  }

  _renderSkillsButton() {
    return html`
      <overlay-trigger type="modal" triggered-by="click" @sp-opened=${this._onSkillsModalOpen}>
        <sp-dialog-wrapper slot="click-content" headline="Skills library" dismissable underlay>
          <div class="chat-skills-modal-body">
            <sp-sidenav
              class="chat-skills-sidenav"
              .value="${this._skillsLibraryTab}"
              @change="${this._onSkillsNavChange}"
            >
              <sp-sidenav-item value="skills" label="Skills" ?selected="${this._skillsLibraryTab === 'skills'}"></sp-sidenav-item>
              <sp-sidenav-item value="mcp" label="MCP" ?selected="${this._skillsLibraryTab === 'mcp'}"></sp-sidenav-item>
              <sp-sidenav-item value="agents" label="Agents" ?selected="${this._skillsLibraryTab === 'agents'}"></sp-sidenav-item>
            </sp-sidenav>
            <div class="chat-skills-content">
              ${this._renderActiveTab()}
            </div>
          </div>
        </sp-dialog-wrapper>
        <sp-action-button slot="trigger" label="Skills library" quiet>
          <svg slot="icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8.75 5.375C8.40527 5.375 8.125 5.65527 8.125 6V10C8.125 10.3447 8.40527 10.625 8.75 10.625C9.09473 10.625 9.375 10.3447 9.375 10V6C9.375 5.65527 9.09473 5.375 8.75 5.375Z" fill="currentColor"/><path d="M18.8643 15.5586L16.3311 4.33984C16.1182 3.40039 15.1787 2.80371 14.2383 3.01953L12.7764 3.34961C12.473 3.41773 12.2046 3.5669 11.9824 3.77124C11.8926 2.78149 11.0674 2 10.0547 2H7.44531C6.37304 2 5.5 2.87305 5.5 3.94531V4.02539C5.41772 4.01318 5.33557 4 5.25 4H3.75C2.78516 4 2 4.78516 2 5.75V16.25C2 17.2148 2.78516 18 3.75 18H5.25C5.65173 18 6.0177 17.8584 6.31348 17.6299C6.63306 17.8604 7.02222 18 7.44532 18H10.0547C11.127 18 12 17.1269 12 16.0547V7.85864L13.9873 16.6582C14.0899 17.1152 14.3633 17.5039 14.7588 17.7529C15.042 17.9326 15.3623 18.0244 15.6894 18.0244C15.8193 18.0244 15.9502 18.0098 16.0791 17.9805L17.541 17.6504C17.998 17.5478 18.3867 17.2734 18.6367 16.8779C18.8857 16.4834 18.9668 16.0146 18.8643 15.5586ZM3.74999 5.5H5.24999C5.38769 5.5 5.49999 5.6123 5.49999 5.75V13.5137C5.47667 13.5115 5.45653 13.5 5.43261 13.5H3.49999V5.75C3.49999 5.6123 3.61229 5.5 3.74999 5.5ZM5.49999 16.25C5.49999 16.3877 5.38769 16.5 5.24999 16.5H3.74999C3.61229 16.5 3.49999 16.3877 3.49999 16.25V15H5.43261C5.45654 15 5.47668 14.9885 5.49999 14.9863V16.25ZM10.5 16.0547C10.5 16.2998 10.2998 16.5 10.0547 16.5H7.4453C7.20018 16.5 6.99999 16.2998 6.99999 16.0547V3.94531C6.99999 3.70019 7.20019 3.5 7.4453 3.5H10.0547C10.2998 3.5 10.5 3.7002 10.5 3.94531V16.0547ZM17.3682 16.0772C17.3476 16.1094 17.2998 16.168 17.2129 16.1875L15.748 16.5176C15.6621 16.541 15.5928 16.5049 15.5595 16.4853C15.5273 16.4648 15.4697 16.417 15.4502 16.3291L12.917 5.11035C12.8974 5.02344 12.9287 4.95508 12.9492 4.92285C12.9697 4.88965 13.0176 4.83203 13.1054 4.8125L14.5693 4.48242C14.5879 4.47851 14.6055 4.47656 14.624 4.47656C14.7383 4.47656 14.8418 4.55566 14.8682 4.6709L17.4014 15.8887C17.4209 15.9766 17.3887 16.0439 17.3682 16.0772Z" fill="currentColor"/></svg>
        </sp-action-button>
      </overlay-trigger>
    `;
  }

  _renderActiveTab() {
    switch (this._skillsLibraryTab) {
      case 'skills': return this._renderSkillsContent();
      case 'mcp': return this._renderMcpContent();
      case 'agents': return this._renderAgentsContent();
      default: return nothing;
    }
  }

  render() {
    return html`
      <div class="chat">
        <div class="chat-header">
          <span class="chat-header-title">${this._activeAgentId
    ? html`${this.header} <span class="agent-badge" title="Agent: ${this._activeAgentId}">${this._agents?.[this._activeAgentId]?.name ?? this._activeAgentId}</span>`
    : this.header}</span>
          <div class="chat-header-actions">
            <span class="status-pill ${this._connected ? 'connected' : 'disconnected'}">
              ${this._connected ? 'Connected' : 'Disconnected'}
            </span>
            <button
              class="chat-clear-btn"
              @click=${this._clearChat}
              title="Clear chat"
              aria-label="Clear chat"
            >×</button>
          </div>
        </div>

        <div class="chat-messages" role="log" aria-live="polite">
          ${this._messages.length === 0 && !this._streamingText ? this._renderWelcome() : ''}
          ${this._messages.map((message) => {
    // Skip protocol-only tool messages (tool-result, tool-approval-response).
    if (message.role === 'tool') return '';

    // User message — always a plain string.
    if (message.role === 'user') {
      return html`
              <div class="message-row user">
                <div class="message-bubble">${message.content}</div>
              </div>`;
    }

    // Assistant message: either a plain string (text) or an array (tool calls).
    if (typeof message.content === 'string' && message.content) {
      const isSkillSuggestion = message.content.includes('[SKILL_SUGGESTION]');
      const displayContent = isSkillSuggestion
        ? message.content.replace(/\*?\*?\[SKILL_SUGGESTION\]\*?\*?\s*/g, '')
        : message.content;
      return html`
              <div class="message-row assistant">
                <div class="message-bubble ${isSkillSuggestion ? 'skill-suggestion' : ''}">${isSkillSuggestion ? html`<span class="skill-suggestion-badge">Skill Suggestion</span>` : nothing}${displayContent}</div>
              </div>`;
    }
    if (Array.isArray(message.content)) {
      return html`${message.content
        .filter((p) => p.type === 'tool-call')
        .map((p) => this._renderToolCard(p.toolCallId))}`;
    }
    return '';
  })}
          ${this._streamingText ? html`
            <div class="message-row assistant">
              <div class="message-bubble ${this._streamingText.includes('[SKILL_SUGGESTION]') ? 'skill-suggestion' : ''}">${this._streamingText.includes('[SKILL_SUGGESTION]') ? html`<span class="skill-suggestion-badge">Skill Suggestion</span>` : nothing}${this._streamingText.replace(/\*?\*?\[SKILL_SUGGESTION\]\*?\*?\s*/g, '')}</div>
            </div>` : ''}
        </div>

        <div class="chat-footer">
          ${(this.onPageContextItems?.length ?? 0) > 0 ? html`
          <div class="chat-context-pills">
            ${(this.onPageContextItems || []).map((item, i) => html`
              <span class="chat-context-pill" title="${(item.innerText || '').slice(0, 100)}${(item.innerText?.length ?? 0) > 100 ? '…' : ''}">
                <button type="button" class="chat-context-pill-remove" aria-label="Remove from context" @click=${() => this._removeContextItem(i)}>×</button>
                <span class="chat-context-pill-label">${this._contextPillLabel(item)}</span>
              </span>
            `)}
          </div>
          ` : ''}
          <div class="chat-footer-row">
          ${this._renderSkillsButton()}
          <sp-textfield
            class="chat-input"
            label="Message"
            placeholder="Send a message..."
            .value=${this._inputValue}
            ?disabled=${this._isThinking || this._isAwaitingApproval || !this._connected}
            @input=${this._handleInput}
            @keydown=${this._handleKeyDown}
          ></sp-textfield>
          ${this._isThinking
    ? html`<sp-button variant="secondary" @click=${this._stopRequest}>Stop</sp-button>`
    : html`<sp-button
                variant="accent"
                ?disabled=${!this._inputValue.trim() || !this._connected || this._isAwaitingApproval}
                @click=${this._sendMessage}
              >Send</sp-button>`}
          </div>
        </div>

        <div class="chat-status">${this._statusText}</div>
      </div>
    `;
  }
}

customElements.define('da-chat', Chat);
