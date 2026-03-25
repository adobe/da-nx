// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';
// eslint-disable-next-line import/no-named-as-default
import ChatController from './chat-controller.js';
import { renderMessageContent } from './chat-renderers.js';
import { initIms, daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { loadSkills, saveSkill, deleteSkill } from '../../skills-editor/utils/utils.js';
import { DA_BULK_AEM_OPEN, DA_BULK_AEM_SETTLED } from './bulk-aem-modal.js';

const style = await getStyle(import.meta.url);
const imsInitial = await initIms();
const token = imsInitial?.accessToken?.token ?? null;

const DOCUMENT_UPDATED_EVENT = 'da:agent-content-updated';
const REPO_FILES_CHANGED_EVENT = 'da:chat-repo-files-changed';

const BUILTIN_MCP_SERVERS = [
  {
    id: 'da-tools',
    description: 'Core DA authoring tools — read, write, list, copy, and manage content',
    transport: 'built-in',
    status: 'ok',
    statusDetail: 'Always available',
    category: 'built-in',
  },
  {
    id: 'eds-preview',
    description: 'Preview and publish content to Edge Delivery Services',
    transport: 'built-in',
    status: 'ok',
    statusDetail: 'Always available',
    category: 'built-in',
  },
];

const BUILTIN_AGENTS = [
  {
    id: 'da-assistant',
    name: 'DA Assistant',
    description: 'Default content authoring assistant with full DA tooling',
    systemPrompt: '',
    skills: [],
    mcpServers: ['da-tools', 'eds-preview'],
    category: 'built-in',
  },
];

const BUILTIN_TOOLS = [
  { id: 'da_list_sources', label: 'List sources', description: 'List files and folders in a DA repo path', group: 'DA Tools' },
  { id: 'da_get_source', label: 'Get source', description: 'Read a source file\'s content', group: 'DA Tools' },
  { id: 'da_create_source', label: 'Create source', description: 'Create a new source file with HTML content', group: 'DA Tools' },
  { id: 'da_update_source', label: 'Update source', description: 'Update an existing source file', group: 'DA Tools' },
  { id: 'da_delete_source', label: 'Delete source', description: 'Delete a source file', group: 'DA Tools' },
  { id: 'da_copy_content', label: 'Copy content', description: 'Copy a file to another path', group: 'DA Tools' },
  { id: 'da_move_content', label: 'Move content', description: 'Move a file (removes source)', group: 'DA Tools' },
  { id: 'da_create_version', label: 'Create version', description: 'Snapshot/version a document', group: 'DA Tools' },
  { id: 'da_get_versions', label: 'Get versions', description: 'List version history for a file', group: 'DA Tools' },
  { id: 'da_lookup_media', label: 'Lookup media', description: 'Resolve media references', group: 'DA Tools' },
  { id: 'da_lookup_fragment', label: 'Lookup fragment', description: 'Resolve fragment references', group: 'DA Tools' },
  { id: 'da_upload_media', label: 'Upload media', description: 'Upload media from base64', group: 'DA Tools' },
  { id: 'da_get_skill', label: 'Get skill', description: 'Load a skill by ID', group: 'Skills & Agents' },
  { id: 'da_create_skill', label: 'Create skill', description: 'Create or update a skill', group: 'Skills & Agents' },
  { id: 'da_list_agents', label: 'List agents', description: 'List agent presets', group: 'Skills & Agents' },
  { id: 'da_create_agent', label: 'Create agent', description: 'Create or update an agent preset', group: 'Skills & Agents' },
];

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

function getDaOrigin() {
  const stored = localStorage.getItem('da-admin');
  if (stored === 'local' || stored === '/local') return 'http://localhost:8787';
  if (stored === 'stage') return 'https://stage-admin.da.live';
  if (stored === 'prod') return 'https://admin.da.live';
  if (stored?.startsWith('http://') || stored?.startsWith('https://')) return stored;
  if (stored?.startsWith('/')) return `${window.location.origin}${stored}`;
  if (new URLSearchParams(window.location.search).get('nx') === 'local') return 'http://localhost:8787';
  return DA_ORIGIN;
}

function getAgentOrigin() {
  const params = new URLSearchParams(window.location.search);
  const isLocal = params.get('ref') === 'local' || params.get('nx') === 'local';
  return isLocal ? 'http://localhost:5173' : 'https://da-agent.adobeaem.workers.dev';
}

/** @param {unknown[]} pages @param {string} org @param {string} site */
/** Maps agent tool name → bulk modal mode. */
const BULK_AEM_TOOL_MODES = {
  da_bulk_preview: 'preview',
  da_bulk_publish: 'publish',
  da_bulk_delete: 'delete',
};

function normalizeBulkPreviewPaths(pages, org, site) {
  const o = String(org ?? '').trim();
  const s = String(site ?? '').trim();
  return (Array.isArray(pages) ? pages : [])
    .map((p) => String(p).replace(/^\/+/, '').trim())
    .filter(Boolean)
    .map((t) => {
      const parts = t.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[0] === o && parts[1] === s) return t;
      if (o && s) return `${o}/${s}/${t}`;
      return t;
    });
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
    /**
     * When set (e.g. `browse`), sent as `pageContext.view` to the agent. Canvas defaults to `edit`
     * via hash context; the browse block should set `context-view="browse"`.
     */
    contextView: { type: String, attribute: 'context-view' },
    _connected: { state: true },
    _messages: { state: true },
    _toolCards: { state: true },
    _streamingText: { state: true },
    _inputValue: { state: true },
    _isThinking: { state: true },
    _isAwaitingApproval: { state: true },
    _isAwaitingClientTool: { state: true },
    _statusText: { state: true },
    _skillsLibraryTab: { state: true },
    _openToolCards: { state: true },
    _configuredMcpRows: { state: true },
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
    _daConfig: { state: true },
    _mcpTools: { state: true },
    _slashMenuOpen: { state: true },
    _slashFilter: { state: true },
    _slashSelectedIndex: { state: true },
  };

  constructor() {
    super();
    this.header = 'Assistant';
    this.onPageContextItems = [];
    this.contextView = '';
    this._connected = false;
    this._messages = [];
    this._inputValue = '';
    this._isThinking = false;
    this._isAwaitingApproval = false;
    this._isAwaitingClientTool = false;
    this._statusText = '';
    this._toolCards = new Map();
    this._streamingText = '';
    this._skillsLibraryTab = 'skills';
    this._openToolCards = new Set();
    this._mcpToggles = JSON.parse(localStorage.getItem('da-mcp-toggles') || '{}');
    this._configuredMcpServers = {};
    this._configuredMcpRows = [];
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
    this._daConfig = null;
    this._mcpTools = null;
    this._pendingSkillIds = [];
    this._slashMenuOpen = false;
    this._slashFilter = '';
    this._slashSelectedIndex = 0;
    this._chatController = null;
    /** @type {{ toolCallId: string, toolName: string } | null} */
    this._bulkPreviewSession = null;
  }

  _boundBulkAemSettled = (e) => {
    if (!this._bulkPreviewSession || !this._chatController) return;
    const { toolCallId, toolName } = this._bulkPreviewSession;
    const d = e.detail ?? {};
    if (d.kind !== 'completed' && d.kind !== 'cancelled') return;
    this._bulkPreviewSession = null;
    const output = {
      cancelled: !!d.cancelled || d.kind === 'cancelled',
      okCount: d.okCount,
      failCount: d.failCount,
      results: d.results,
      message: d.message,
      kind: d.kind,
    };
    this._chatController.submitClientToolResult({ toolCallId, toolName, output });
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    window.addEventListener(DA_BULK_AEM_SETTLED, this._boundBulkAemSettled);
    this._ensureController();
    this._chatController?.connect();
    this._fetchDaConfig().then(() => {
      if (Object.keys(this._configuredMcpServers || {}).length > 0 && !this._mcpTools) {
        this._fetchMcpTools();
      }
    });
    if (!this._skills && !this._skillsLoading) this._fetchSkills();
  }

  disconnectedCallback() {
    window.removeEventListener(DA_BULK_AEM_SETTLED, this._boundBulkAemSettled);
    this._chatController?.disconnect();
    super.disconnectedCallback();
  }

  /** @returns {{ org: string, site: string, path: string, view: string }} */
  _pageContextForAgent() {
    const ctx = getContextFromHash();
    const v = (this.contextView && String(this.contextView).trim()) || '';
    if (v) return { ...ctx, view: v };
    return ctx;
  }

  _ensureController() {
    if (this._chatController) return;

    // Use a unique room per user per project so each person gets their own
    // isolated Durable Object instance with separate conversation history.
    const { org, site } = this._pageContextForAgent();
    const userId = getUserIdFromToken(token);
    const agentRoom = org && site && userId
      ? `${org}--${site}--${userId}`
      : 'default';

    this._chatController = new ChatController({
      name: agentRoom,
      getContext: () => this._pageContextForAgent(),
      getImsToken: async () => (await initIms())?.accessToken?.token ?? null,
      onUpdate: () => {
        this._messages = [...this._chatController.messages];
        this._toolCards = new Map(this._chatController.toolCards);
        this._streamingText = this._chatController.streamingText;
        this._isThinking = this._chatController.isThinking;
        this._isAwaitingApproval = this._chatController.isAwaitingApproval;
        this._isAwaitingClientTool = this._chatController.isAwaitingClientTool;
        this._scrollMessagesToBottom();
      },
      onClientToolRequest: ({ toolCallId, toolName, input }) => {
        const mode = BULK_AEM_TOOL_MODES[toolName];
        if (!mode) return;
        const ctx = this._pageContextForAgent();
        const pages = Array.isArray(input?.pages) ? input.pages : [];
        const files = normalizeBulkPreviewPaths(pages, ctx.org, ctx.site);
        this._bulkPreviewSession = { toolCallId, toolName };
        window.dispatchEvent(new CustomEvent(DA_BULK_AEM_OPEN, {
          detail: { files, mode },
        }));
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
      onRepoFilesChanged: (detail) => {
        window.dispatchEvent(new CustomEvent(REPO_FILES_CHANGED_EVENT, {
          detail: { ...detail, ts: Date.now() },
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
    if (this._inputValue.startsWith('/')) {
      this._slashFilter = this._inputValue.slice(1).toLowerCase();
      this._slashMenuOpen = true;
      this._slashSelectedIndex = 0;
    } else {
      this._slashMenuOpen = false;
      this._slashFilter = '';
    }
  }

  _handleKeyDown(e) {
    if (this._slashMenuOpen) {
      const items = this._getFilteredSlashItems();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._slashSelectedIndex = Math.min(this._slashSelectedIndex + 1, items.length - 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._slashSelectedIndex = Math.max(this._slashSelectedIndex - 1, 0);
        return;
      }
      if (e.key === 'Enter' && items.length > 0) {
        e.preventDefault();
        this._selectSlashItem(items[this._slashSelectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        this._slashMenuOpen = false;
        return;
      }
      if (e.key === 'Tab' && items.length > 0) {
        e.preventDefault();
        this._selectSlashItem(items[this._slashSelectedIndex]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._sendMessage();
    }
  }

  _sendMessage() {
    const content = this._inputValue.trim();
    if (!content || this._isThinking || this._isAwaitingApproval || this._isAwaitingClientTool
      || !this._chatController) return;
    const contextSnapshot = [...(this.onPageContextItems ?? [])];
    this._inputValue = '';
    if (this._pendingSkillIds?.length > 0) {
      this._chatController.requestedSkills = [...this._pendingSkillIds];
      this._pendingSkillIds = [];
    } else {
      this._chatController.requestedSkills = [];
    }
    this._chatController.mcpServers = this._configuredMcpServers || {};
    this._chatController.sendMessage(content, contextSnapshot);
    this.dispatchEvent(new CustomEvent('da-chat-message-sent', { bubbles: true }));
  }

  _stopRequest() {
    this._bulkPreviewSession = null;
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
    if (!prompt || this._isThinking || this._isAwaitingApproval || this._isAwaitingClientTool
      || !this._connected) return;
    const contextSnapshot = [...(this.onPageContextItems ?? [])];
    this._chatController?.sendMessage(prompt, contextSnapshot);
    this.dispatchEvent(new CustomEvent('da-chat-message-sent', { bubbles: true }));
  }

  _getFilteredSlashItems() {
    const allItems = [...BUILTIN_TOOLS];

    // Skills
    if (this._skills && typeof this._skills === 'object') {
      Object.keys(this._skills).forEach((id) => {
        allItems.push({
          id: `skill__${id}`,
          label: id,
          description: `Skill: ${id}`,
          group: 'Skills',
        });
      });
    }

    // MCP tools from connected servers
    const mcpToolServers = this._mcpTools?.servers || [];
    mcpToolServers.forEach((s) => {
      if (s.tools && s.tools.length > 0) {
        s.tools.forEach((t) => {
          allItems.push({
            id: `mcp__${s.id}__${t.name}`,
            label: t.name,
            description: t.description || '',
            group: `MCP: ${s.id}`,
          });
        });
      } else if (s.error) {
        allItems.push({
          id: `mcp__${s.id}`,
          label: s.id,
          description: `${s.description || s.id} (${s.error})`,
          group: 'MCP Servers (offline)',
        });
      }
    });

    if (!this._slashFilter) return allItems;
    return allItems.filter(
      (t) => t.id.toLowerCase().includes(this._slashFilter)
        || t.label.toLowerCase().includes(this._slashFilter)
        || t.description.toLowerCase().includes(this._slashFilter)
        || t.group.toLowerCase().includes(this._slashFilter),
    );
  }

  _selectSlashItem(item) {
    if (!item) return;
    let prefix;
    if (item.id.startsWith('skill__')) {
      const skillId = item.id.replace('skill__', '');
      this._pendingSkillIds = [...(this._pendingSkillIds || []), skillId];
      prefix = `Using the "${item.label}" skill, `;
    } else if (item.id.startsWith('mcp__')) {
      prefix = `Use the ${item.label} tool from ${item.group} to `;
    } else {
      prefix = `Use the ${item.id} tool to `;
    }
    this._inputValue = prefix;
    this._slashMenuOpen = false;
    this._slashFilter = '';
    this.updateComplete.then(() => {
      const input = this.shadowRoot?.querySelector('.chat-input');
      if (input) {
        input.focus();
        const native = input.shadowRoot?.querySelector('input');
        if (native) native.setSelectionRange(prefix.length, prefix.length);
      }
    });
  }

  async _fetchDaConfig() {
    if (this._daConfig) return this._daConfig;
    const { org, site } = getContextFromHash();
    if (!org) return {};
    try {
      const path = site ? `${org}/${site}` : org;
      const resp = await daFetch(`${DA_ORIGIN}/config/${path}/`);
      if (!resp.ok) return {};
      const json = await resp.json();
      const entries = json?.data?.data || [];
      const cfg = entries.reduce((acc, row) => {
        if (row.key) acc[row.key] = row.value;
        return acc;
      }, {});
      this._daConfig = cfg;

      // Extract mcp-servers sheet: each row has { key, url }
      const mcpRows = json?.['mcp-servers']?.data || [];
      const servers = {};
      const rows = [];
      mcpRows.forEach((row) => {
        if (row.key && row.url) {
          servers[row.key] = row.url;
          rows.push(row);
        }
      });
      this._configuredMcpServers = servers;
      this._configuredMcpRows = rows;

      return cfg;
    } catch {
      return {};
    }
  }

  _getConfigValue(key, fallback) {
    return this._daConfig?.[key] || fallback;
  }

  _onSkillsNavChange(e) {
    const { value } = e.target;
    if (value) this._skillsLibraryTab = value;
    if (value === 'mcp') {
      if (!this._mcpTools && Object.keys(this._configuredMcpServers || {}).length > 0) {
        this._fetchMcpTools();
      }
    }
    if (value === 'skills' && !this._skills && !this._skillsLoading) {
      this._fetchSkills();
    }
    if (value === 'agents' && !this._agents && !this._agentsLoading) {
      this._fetchAgents();
    }
  }

  _refreshMcpTools() {
    this._mcpTools = null;
    this._fetchMcpTools();
  }

  async _fetchMcpTools() {
    const servers = this._configuredMcpServers || {};
    if (Object.keys(servers).length === 0) return;
    try {
      const resp = await fetch(`${getAgentOrigin()}/mcp-tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers }),
      });
      if (resp.ok) {
        this._mcpTools = await resp.json();
      }
    } catch {
      this._mcpTools = null;
    }
  }

  _isMcpServerEnabled(serverId) {
    return this._mcpToggles[serverId]?.enabled !== false;
  }

  _toggleMcpServer(serverId) {
    const current = this._mcpToggles[serverId] || {};
    current.enabled = current.enabled === false;
    this._mcpToggles = { ...this._mcpToggles, [serverId]: current };
    localStorage.setItem('da-mcp-toggles', JSON.stringify(this._mcpToggles));
    this.requestUpdate();
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
          <sp-button variant="accent" size="s" title="Create a new skill" aria-label="Create a new skill" @click=${() => { this._newSkillMode = true; }}>Create skill</sp-button>
          <sp-button variant="secondary" size="s" title="Refresh skills list" aria-label="Refresh skills list" @click=${() => this._refreshSkills()}>Refresh</sp-button>
        </div>`;
    }

    const editorContent = this._newSkillMode
      ? '# New Skill\n\nDescribe this skill here.\n'
      : (this._skills[this._selectedSkill] ?? '');

    const { org, site } = getContextFromHash();
    const skillsLabUrl = `https://da.live/apps/skills?nx=exp-workspace#/${org}/${site}`;

    return html`
      <div class="skills-panel">
        <div class="skills-toolbar">
          <select class="skills-select" @change=${this._onSkillSelect} aria-label="Select a skill to edit">
            ${ids.map((id) => html`
              <option value="${id}" ?selected=${id === this._selectedSkill}>${id}</option>
            `)}
            <option value="__new__" ?selected=${this._newSkillMode}>+ New skill</option>
          </select>
          <sp-action-button size="s" quiet title="Refresh skills list" aria-label="Refresh skills list" @click=${() => this._refreshSkills()}>
            <svg slot="icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M17.65 6.35a8 8 0 0 0-14.3 1.4M2.35 13.65a8 8 0 0 0 14.3-1.4M1 4v4h4M19 16v-4h-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </sp-action-button>
        </div>
        ${this._newSkillMode ? html`
          <div class="skills-new-row">
            <sp-textfield
              class="skills-new-name"
              placeholder="skill-name"
              size="s"
              label="New skill ID"
              .value=${this._newSkillName}
              @input=${this._onNewSkillNameInput}
            ></sp-textfield>
          </div>
        ` : nothing}
        <textarea class="skill-editor-textarea" .value=${editorContent} aria-label="Skill content editor"></textarea>
        <div class="skills-actions">
          ${this._newSkillMode ? html`
            <sp-button variant="secondary" size="s" title="Cancel new skill" aria-label="Cancel new skill" @click=${() => { this._newSkillMode = false; if (ids.length > 0) [this._selectedSkill] = ids; }}>Cancel</sp-button>
          ` : html`
            <button type="button" class="skill-tb-btn skill-tb-delete" title="Delete this skill" aria-label="Delete this skill" @click=${this._deleteCurrentSkill}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8.25 15.02a.75.75 0 0 1-.75-.72l-.25-6.5a.75.75 0 0 1 1.5-.06l.25 6.5a.75.75 0 0 1-.72.78Zm3.5 0a.75.75 0 0 1-.72-.78l.25-6.5a.75.75 0 0 1 1.5.06l-.25 6.5a.75.75 0 0 1-.78.72ZM17 4h-3.5v-.75A2.25 2.25 0 0 0 11.25 1h-2.5A2.25 2.25 0 0 0 6.5 3.25V4H3a.75.75 0 0 0 0 1.5h.52l.42 10.34A2.25 2.25 0 0 0 6.19 18h7.62a2.25 2.25 0 0 0 2.25-2.16L16.48 5.5H17a.75.75 0 0 0 0-1.5ZM8 3.25A.75.75 0 0 1 8.75 2.5h2.5a.75.75 0 0 1 .75.75V4H8V3.25Zm6.56 12.53a.75.75 0 0 1-.75.72H6.19a.75.75 0 0 1-.75-.72L5.02 5.5h9.96l-.42 10.28Z" fill="currentColor"/></svg>
            </button>
          `}
          <button type="button" class="skill-tb-btn skill-tb-save" title="Save skill" aria-label="Save skill" @click=${this._saveCurrentSkill}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M17.41 4.1 15.9 2.59A1.75 1.75 0 0 0 14.48 2H4.25A2.25 2.25 0 0 0 2 4.25v11.5A2.25 2.25 0 0 0 4.25 18h11.5A2.25 2.25 0 0 0 18 15.75V5.52c0-.53-.21-1.04-.59-1.42ZM7.75 3.5h4.5v3h-4.5v-3Zm5.5 13H6.75V12h6.5v4.5Zm3.25-1.75a.75.75 0 0 1-.75.75h-1V12a1.75 1.75 0 0 0-1.75-1.75h-6.5A1.75 1.75 0 0 0 5.25 12v4.5h-1a.75.75 0 0 1-.75-.75V4.25a.75.75 0 0 1 .75-.75h2v3A1.75 1.75 0 0 0 7.75 8h4.5a1.75 1.75 0 0 0 1.75-1.75v-3h.48a.25.25 0 0 1 .18.07l1.52 1.52a.25.25 0 0 1 .07.18v11.23Z" fill="currentColor"/></svg>
          </button>
        </div>
        <a class="skills-lab-link" href="${skillsLabUrl}" target="_blank" rel="noopener noreferrer" title="Open the full Skills Lab editor">
          Go to Skills Lab
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M11 3a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 .75.75v5.5a.75.75 0 0 1-1.5 0V5.06l-7.22 7.22a.75.75 0 1 1-1.06-1.06L15.44 4h-3.69A.75.75 0 0 1 11 3ZM4.25 5A.75.75 0 0 0 3.5 5.75v10A.75.75 0 0 0 4.25 16.5h10a.75.75 0 0 0 .75-.75V11a.75.75 0 0 1 1.5 0v4.75A2.25 2.25 0 0 1 14.25 18h-10A2.25 2.25 0 0 1 2 15.75v-10A2.25 2.25 0 0 1 4.25 3.5H9a.75.75 0 0 1 0 1.5H4.25Z" fill="currentColor"/></svg>
        </a>
      </div>`;
  }

  async _fetchAgents() {
    const { org, site } = getContextFromHash();
    if (!org) return;
    this._agentsLoading = true;
    try {
      await this._fetchDaConfig();
      const agentsDir = this._getConfigValue('agents-path', '.da/agents');
      const imsToken = (await initIms())?.accessToken?.token;
      const headers = imsToken ? { Authorization: `Bearer ${imsToken}` } : {};
      const adminOrigin = getDaOrigin();
      const path = site ? `/${org}/${site}/${agentsDir}` : `/${org}/${agentsDir}`;
      const resp = await fetch(`${adminOrigin}/list${path}`, { headers });
      if (resp.ok) {
        const items = await resp.json();
        const jsonItems = (Array.isArray(items) ? items : []).filter((i) => i.ext === 'json');
        const agents = {};
        await Promise.all(jsonItems.map(async (item) => {
          try {
            const srcResp = await fetch(`${adminOrigin}/source${item.path}`, { headers });
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
    const builtinIds = BUILTIN_AGENTS.map((a) => a.id);
    if (builtinIds.includes(agentId)) {
      this._activeAgentId = agentId;
      if (this._chatController) this._chatController.agentId = null;
    } else {
      this._activeAgentId = agentId || null;
      if (this._chatController) this._chatController.agentId = this._activeAgentId;
    }
  }

  async _saveAgent() {
    const { org, site } = getContextFromHash();
    const prefix = site ? `/${org}/${site}` : `/${org}`;
    const agentsDir = this._getConfigValue('agents-path', '.da/agents');
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
    const adminOrigin = getDaOrigin();
    const body = new FormData();
    body.append('data', new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' }));
    await fetch(`${adminOrigin}/source${prefix}/${agentsDir}/${id}.json`, { method: 'POST', headers, body });

    this._agents = { ...this._agents, [id]: preset };
    this._selectedAgent = id;
    this._newAgentMode = false;
  }

  async _deleteAgent() {
    if (!this._selectedAgent) return;
    const { org, site } = getContextFromHash();
    const prefix = site ? `/${org}/${site}` : `/${org}`;
    const agentsDir = this._getConfigValue('agents-path', '.da/agents');
    const imsToken = (await initIms())?.accessToken?.token;
    const headers = imsToken ? { Authorization: `Bearer ${imsToken}` } : {};
    const adminOrigin = getDaOrigin();
    await fetch(`${adminOrigin}/source${prefix}/${agentsDir}/${this._selectedAgent}.json`, { method: 'DELETE', headers });

    if (this._activeAgentId === this._selectedAgent) this._activateAgent(null);
    const next = { ...this._agents };
    delete next[this._selectedAgent];
    this._agents = next;
    const ids = Object.keys(next);
    this._selectedAgent = ids.length > 0 ? ids[0] : null;
  }

  _renderBuiltinAgentCard(agent) {
    const isActive = this._activeAgentId === agent.id;
    return html`
      <div class="builtin-agent-card ${isActive ? 'active' : ''}">
        <div class="builtin-agent-header">
          <div class="builtin-agent-info">
            <span class="builtin-agent-name">${agent.name}</span>
            <span class="builtin-agent-desc">${agent.description}</span>
          </div>
          <div class="builtin-agent-actions">
            <span class="mcp-server-status ok">built-in</span>
            <sp-button variant="${isActive ? 'secondary' : 'primary'}" size="s"
              title="${isActive ? 'Deactivate' : 'Activate'} ${agent.name}"
              aria-label="${isActive ? 'Deactivate' : 'Activate'} ${agent.name}"
              @click=${() => this._activateAgent(isActive ? null : agent.id)}>
              ${isActive ? 'Active' : 'Activate'}
            </sp-button>
          </div>
        </div>
        ${agent.mcpServers?.length ? html`
          <div class="builtin-agent-tools">
            <span class="builtin-agent-tools-label">Tools:</span>
            ${agent.mcpServers.map((s) => html`<span class="builtin-agent-tool-pill">${s}</span>`)}
          </div>
        ` : ''}
      </div>`;
  }

  _renderAgentsContent() {
    if (this._agentsLoading) {
      return html`<div class="chat-skills-empty"><p class="chat-skills-empty-text">Loading agents...</p></div>`;
    }

    if (!this._agents) {
      return html`<div class="chat-skills-empty"><p class="chat-skills-empty-text">Select a site to view agents.</p></div>`;
    }

    const ids = Object.keys(this._agents);
    const selected = this._newAgentMode ? null : (this._agents[this._selectedAgent] ?? null);
    const isActive = this._selectedAgent && this._activeAgentId === this._selectedAgent;

    return html`
      <div class="agents-panel">
        <div class="mcp-category">
          <span class="mcp-category-pill built-in">Built-in</span>
          ${BUILTIN_AGENTS.map((a) => this._renderBuiltinAgentCard(a))}
        </div>

        <div class="mcp-category">
          <span class="mcp-category-pill custom">Custom <span class="mcp-category-count">${ids.length}</span></span>

          ${ids.length === 0 && !this._newAgentMode ? html`
            <div class="mcp-category-empty">
              No custom agent presets found. Agent presets bundle a system prompt, skills, and MCP servers into a reusable persona.
              <div style="margin-top: 8px; display: flex; gap: 8px;">
                <sp-button variant="accent" size="s" title="Create a new agent preset" aria-label="Create a new agent preset" @click=${() => { this._newAgentMode = true; }}>Create agent</sp-button>
                <sp-button variant="secondary" size="s" title="Refresh agents list" aria-label="Refresh agents list" @click=${() => this._refreshAgents()}>Refresh</sp-button>
              </div>
            </div>
          ` : html`
            <div class="agents-toolbar">
              <select class="agents-select" @change=${this._onAgentSelect} aria-label="Select an agent preset">
                ${ids.map((id) => html`
                  <option value="${id}" ?selected=${id === this._selectedAgent}>${this._agents[id]?.name || id}</option>
                `)}
                <option value="__new__" ?selected=${this._newAgentMode}>+ New agent</option>
              </select>
              <sp-action-button size="s" quiet title="Refresh agents" aria-label="Refresh agents" @click=${() => this._refreshAgents()}>
                <svg slot="icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M17.65 6.35a8 8 0 0 0-14.3 1.4M2.35 13.65a8 8 0 0 0 14.3-1.4M1 4v4h4M19 16v-4h-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </sp-action-button>
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
                <sp-button variant="secondary" size="s" title="Cancel new agent" aria-label="Cancel new agent" @click=${() => { this._newAgentMode = false; if (ids.length > 0) [this._selectedAgent] = ids; }}>Cancel</sp-button>
              ` : html`
                <button type="button" class="skill-tb-btn skill-tb-delete" title="Delete this agent" aria-label="Delete this agent" @click=${this._deleteAgent}>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8.25 15.02a.75.75 0 0 1-.75-.72l-.25-6.5a.75.75 0 0 1 1.5-.06l.25 6.5a.75.75 0 0 1-.72.78Zm3.5 0a.75.75 0 0 1-.72-.78l.25-6.5a.75.75 0 0 1 1.5.06l-.25 6.5a.75.75 0 0 1-.78.72ZM17 4h-3.5v-.75A2.25 2.25 0 0 0 11.25 1h-2.5A2.25 2.25 0 0 0 6.5 3.25V4H3a.75.75 0 0 0 0 1.5h.52l.42 10.34A2.25 2.25 0 0 0 6.19 18h7.62a2.25 2.25 0 0 0 2.25-2.16L16.48 5.5H17a.75.75 0 0 0 0-1.5ZM8 3.25A.75.75 0 0 1 8.75 2.5h2.5a.75.75 0 0 1 .75.75V4H8V3.25Zm6.56 12.53a.75.75 0 0 1-.75.72H6.19a.75.75 0 0 1-.75-.72L5.02 5.5h9.96l-.42 10.28Z" fill="currentColor"/></svg>
                </button>
                <sp-button variant="${isActive ? 'secondary' : 'primary'}" size="s"
                  title="${isActive ? 'Deactivate agent' : 'Activate agent'}"
                  aria-label="${isActive ? 'Deactivate agent' : 'Activate agent'}"
                  @click=${() => this._activateAgent(isActive ? null : this._selectedAgent)}>
                  ${isActive ? 'Deactivate' : 'Activate'}
                </sp-button>
              `}
              <button type="button" class="skill-tb-btn skill-tb-save" title="Save agent" aria-label="Save agent" @click=${this._saveAgent}>
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M17.41 4.1 15.9 2.59A1.75 1.75 0 0 0 14.48 2H4.25A2.25 2.25 0 0 0 2 4.25v11.5A2.25 2.25 0 0 0 4.25 18h11.5A2.25 2.25 0 0 0 18 15.75V5.52c0-.53-.21-1.04-.59-1.42ZM7.75 3.5h4.5v3h-4.5v-3Zm5.5 13H6.75V12h6.5v4.5Zm3.25-1.75a.75.75 0 0 1-.75.75h-1V12a1.75 1.75 0 0 0-1.75-1.75h-6.5A1.75 1.75 0 0 0 5.25 12v4.5h-1a.75.75 0 0 1-.75-.75V4.25a.75.75 0 0 1 .75-.75h2v3A1.75 1.75 0 0 0 7.75 8h4.5a1.75 1.75 0 0 0 1.75-1.75v-3h.48a.25.25 0 0 1 .18.07l1.52 1.52a.25.25 0 0 1 .07.18v11.23Z" fill="currentColor"/></svg>
              </button>
            </div>
          `}
        </div>

        <div class="agents-how-to">
          <div class="agents-how-to-title">How to add custom agents</div>
          <p class="agents-how-to-text">
            Agent presets are JSON files stored at <code>${this._getConfigValue('agents-path', '.da/agents')}/&lt;id&gt;.json</code> in your repo.
            Each preset can define a name, description, system prompt, skill IDs, and MCP server IDs.
          </p>
        </div>
      </div>`;
  }

  _renderMcpServerCard(s, toggleable = true) {
    const enabled = this._isMcpServerEnabled(s.id);
    const disabledClass = !enabled ? 'disabled' : '';
    return html`
      <div class="mcp-server-item ${s.status} ${disabledClass}">
        <div class="mcp-server-header">
          <span class="mcp-server-id">${s.id}</span>
          <div class="mcp-server-actions">
            <span class="mcp-server-status ${s.status}">${s.status}</span>
            ${toggleable ? html`
              <label class="mcp-toggle" title="${enabled ? 'Disable' : 'Enable'} ${s.id}">
                <input type="checkbox" .checked=${enabled} @change=${() => this._toggleMcpServer(s.id)} aria-label="${enabled ? 'Disable' : 'Enable'} ${s.id}" />
                <span class="mcp-toggle-slider"></span>
              </label>
            ` : ''}
          </div>
        </div>
        ${s.description ? html`<div class="mcp-server-desc">${s.description}</div>` : ''}
        ${s.transport ? html`<div class="mcp-server-meta"><span class="mcp-server-transport">${s.transport}</span>${s.endpoint ? html` <code class="mcp-server-endpoint">${s.endpoint}</code>` : ''}</div>` : ''}
        ${s.statusDetail ? html`<div class="mcp-server-detail">${s.statusDetail}</div>` : ''}
      </div>`;
  }

  _renderMcpContent() {
    const configuredRows = this._configuredMcpRows || [];
    const configuredAsCards = configuredRows.map((row) => ({
      id: row.key,
      status: 'configured',
      transport: 'sse',
      endpoint: row.url,
    }));

    return html`
      <div class="mcp-server-list">
        <div class="mcp-header">
          <div class="mcp-header-left">
            <span class="mcp-header-title">MCP Servers</span>
          </div>
          ${configuredRows.length > 0 ? html`
          <sp-action-button size="s" quiet title="Refresh MCP tools" aria-label="Refresh MCP tools" @click=${() => this._refreshMcpTools()}>
            <svg slot="icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M17.65 6.35a8 8 0 0 0-14.3 1.4M2.35 13.65a8 8 0 0 0 14.3-1.4M1 4v4h4M19 16v-4h-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </sp-action-button>` : ''}
        </div>

        <div class="mcp-category">
          <span class="mcp-category-pill built-in">Built-in</span>
          ${BUILTIN_MCP_SERVERS.map((s) => this._renderMcpServerCard(s, false))}
        </div>

        <div class="mcp-category">
          <span class="mcp-category-pill configured">Configured <span class="mcp-category-count">${configuredRows.length}</span></span>
          ${configuredRows.length > 0
    ? configuredAsCards.map((s) => this._renderMcpServerCard(s))
    : html`<div class="mcp-category-empty">No MCP servers configured. Add an <code>mcp-servers</code> sheet to your DA config with <code>key</code> and <code>url</code> columns.</div>`}
        </div>
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
   * Label for a context item pill: blocks show "Name (inner text)", prose shows truncated text.
   * @param {{ blockName?: string, innerText: string }} item
   * @returns {string}
   */
  // eslint-disable-next-line class-methods-use-this
  _contextPillLabel(item) {
    if (!item) return '';
    const text = (item.innerText || '').trim();
    const name = item.blockName?.trim();
    if (name) {
      const innerMax = 40;
      const inner = text.length <= innerMax ? text : `${text.slice(0, innerMax)}…`;
      return inner ? `${name} (${inner})` : name;
    }
    if (text.length <= 20) return text;
    return `${text.slice(0, 20)}...`;
  }

  /** Pills for context baked into a sent user message (read-only). */
  _renderAttachedContextPills(items) {
    if (!items?.length) return nothing;
    return html`
      <div class="message-attached-context" aria-label="Page context included with this message">
        <span class="message-attached-context-hint">Context</span>
        <div class="chat-context-pills chat-context-pills-sent">
          ${items.map(
      (item) => html`
            <span
              class="chat-context-pill chat-context-pill-sent"
              title="${(item.innerText || '').slice(0, 100)}${(item.innerText?.length ?? 0) > 100 ? '…' : ''}"
            >
              <span class="chat-context-pill-label">${this._contextPillLabel(item)}</span>
            </span>
          `,
    )}
        </div>
      </div>
    `;
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
        <sp-dialog-wrapper slot="click-content" headline="Skills Quick Editing" dismissable underlay>
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
        <sp-action-button slot="trigger" title="Skills Quick Editing" aria-label="Open Skills Quick Editing" quiet>
          <svg slot="icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill-rule="evenodd" d="M14.5 10a4.5 4.5 0 0 0 4.28-5.88c-.1-.33-.51-.4-.75-.15L15.34 6.66a.45.45 0 0 1-.49.11 3.01 3.01 0 0 1-1.62-1.62.45.45 0 0 1 .11-.49l2.7-2.69c.24-.24.17-.65-.15-.75A4.5 4.5 0 0 0 10.02 5.8c.05.87-.13 1.8-.8 2.37l-7.23 6.02a2.72 2.72 0 1 0 3.84 3.84l6.02-7.23c.56-.67 1.5-.86 2.37-.8.1 0 .19 0 .28.01ZM4.5 16.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z" clip-rule="evenodd" fill="currentColor"/></svg>
        </sp-action-button>
      </overlay-trigger>
    `;
  }

  _renderSlashMenu() {
    if (!this._slashMenuOpen) return nothing;
    const items = this._getFilteredSlashItems();
    if (items.length === 0) {
      return html`
        <div class="slash-menu" role="listbox" aria-label="Available tools">
          <div class="slash-menu-empty">No matching tools</div>
        </div>`;
    }
    let currentGroup = '';
    return html`
      <div class="slash-menu" role="listbox" aria-label="Available tools">
        ${items.map((item, i) => {
      const showGroup = item.group !== currentGroup;
      if (showGroup) currentGroup = item.group;
      return html`
            ${showGroup ? html`<div class="slash-menu-group">${item.group}</div>` : ''}
            <div class="slash-menu-item ${i === this._slashSelectedIndex ? 'selected' : ''}"
              role="option"
              aria-selected="${i === this._slashSelectedIndex}"
              @mouseenter=${() => { this._slashSelectedIndex = i; }}
              @click=${() => this._selectSlashItem(item)}>
              <span class="slash-menu-item-id">/${item.label}</span>
              <span class="slash-menu-item-desc">${item.description}</span>
            </div>`;
    })}
      </div>`;
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
        ? html`${this.header} <span class="agent-badge" title="Agent: ${this._activeAgentId}">${this._agents?.[this._activeAgentId]?.name ?? BUILTIN_AGENTS.find((a) => a.id === this._activeAgentId)?.name ?? this._activeAgentId}</span>`
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

          // User message — plain string; optional selectionContext from add-to-chat.
          if (message.role === 'user') {
            const text = typeof message.content === 'string' ? message.content : String(message.content ?? '');
            const attached = message.selectionContext;
            return html`
              <div class="message-row user">
                <div class="message-user-column">
                  ${this._renderAttachedContextPills(attached)}
                  <div class="message-bubble">${text}</div>
                </div>
              </div>`;
          }

          // Assistant message: either a plain string (text) or an array (tool calls).
          if (typeof message.content === 'string' && message.content) {
            const isSkillSuggestion = message.content.includes('[SKILL_SUGGESTION]');
            const displayContent = isSkillSuggestion
              ? message.content.replace(/\*?\*?\[SKILL_SUGGESTION\]\*?\*?\s*/g, '')
              : message.content;
            const rendered = renderMessageContent(displayContent);
            return html`
              <div class="message-row assistant">
                <div class="message-bubble ${isSkillSuggestion ? 'skill-suggestion' : ''}">${isSkillSuggestion ? html`<span class="skill-suggestion-badge">Skill Suggestion</span>` : nothing}${rendered}</div>
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
              <div class="message-bubble ${this._streamingText.includes('[SKILL_SUGGESTION]') ? 'skill-suggestion' : ''}">${this._streamingText.includes('[SKILL_SUGGESTION]') ? html`<span class="skill-suggestion-badge">Skill Suggestion</span>` : nothing}${renderMessageContent(this._streamingText.replace(/\*?\*?\[SKILL_SUGGESTION\]\*?\*?\s*/g, ''))}</div>
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
          ${this._renderSlashMenu()}
          <div class="chat-footer-row ${this._isThinking ? 'thinking' : ''}">
          ${this._renderSkillsButton()}
          <sp-textfield
            class="chat-input"
            label="Message"
            placeholder="Send a message... (type / for tools)"
            .value=${this._inputValue}
            ?disabled=${this._isThinking || this._isAwaitingApproval || this._isAwaitingClientTool
      || !this._connected}
            @input=${this._handleInput}
            @keydown=${this._handleKeyDown}
          ></sp-textfield>
          ${this._isThinking
        ? html`<button type="button" class="chat-btn-stop" title="Stop generating" aria-label="Stop generating" @click=${this._stopRequest}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="2" fill="currentColor"/></svg>
            </button>`
        : html`<button type="button" class="chat-btn-send" title="Send message" aria-label="Send message"
                ?disabled=${!this._inputValue.trim() || !this._connected || this._isAwaitingApproval
          || this._isAwaitingClientTool}
                @click=${this._sendMessage}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M3.11 1.05a1 1 0 0 1 1.04-.13l14 7a1 1 0 0 1 0 1.79l-14 7A1 1 0 0 1 2.72 15.6L5.37 10 2.72 4.4a1 1 0 0 1 .39-1.35ZM6.63 10.75l-2.12 4.47L16.38 10 4.51 4.78l2.12 4.47h4.62a.75.75 0 0 1 0 1.5H6.63Z" fill="currentColor"/></svg>
            </button>`}
          </div>
        </div>

        <div class="chat-status">${this._statusText}</div>
      </div>
    `;
  }
}

customElements.define('da-chat', Chat);
