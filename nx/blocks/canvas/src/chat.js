// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html, nothing } from 'da-lit';
// eslint-disable-next-line import/no-unresolved
import { getNx } from 'https://da.live/scripts/utils.js';
// eslint-disable-next-line import/no-named-as-default
import ChatController from './chat-controller.js';
import { addAutoApprovedTool } from './tool-auto-approve.js';
import {
  getFriendlyToolDetails, getToolCardHeaderParts, getToolDisplayTitle, isUpdateTool,
} from './tool-card-summaries.js';
import { renderMessageContent } from './chat-renderers.js';
import { initIms, daFetch } from '../../../utils/daFetch.js';
import { DA_ORIGIN } from '../../../public/utils/constants.js';
import { loadSkills, saveSkill, deleteSkill } from '../../skills-editor/utils/utils.js';
import { DA_BULK_AEM_OPEN, DA_BULK_AEM_SETTLED } from './bulk-aem-modal.js';

const style = await getStyle(import.meta.url);
const nxBase = getNx();
const TOOL_CARD_ARROW_ICON_SRC = `${nxBase}/img/icons/arrowcurved.svg`;
const TOOL_CARD_REVERT_ICON_SRC = `${nxBase}/img/icons/revert.svg`;
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
    _configuredAgentRows: { state: true },
    _skills: { state: true },
    _skillsLoading: { state: true },
    _selectedSkill: { state: true },
    _newSkillMode: { state: true },
    _newSkillName: { state: true },
    _activeAgentId: { state: true },
    _daConfig: { state: true },
    _mcpTools: { state: true },
    _slashMenuOpen: { state: true },
    _slashFilter: { state: true },
    _slashSelectedIndex: { state: true },
    _revertConfirmOpen: { state: true },
    _pendingAttachments: { state: true },
    /** @type {string | null} */
    _revertPendingToolCallId: { state: true },
    /** Snapshot HTML for the open doc in edit view (space → inline editor). */
    getRevertSnapshotAemHtml: { type: Function, attribute: false },
    /** Apply reverted EDS HTML to collab (space → inline editor). */
    revertCollabDoc: { type: Function, attribute: false },
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
    this._configuredAgentRows = [];
    this._skills = null;
    this._skillsLoading = false;
    this._selectedSkill = null;
    this._newSkillMode = false;
    this._newSkillName = '';
    this._activeAgentId = null;
    this._daConfig = null;
    this._mcpTools = null;
    this._pendingSkillIds = [];
    this._slashMenuOpen = false;
    this._slashFilter = '';
    this._slashSelectedIndex = 0;
    this._revertConfirmOpen = false;
    this._pendingAttachments = [];
    this._revertPendingToolCallId = null;
    this.getRevertSnapshotAemHtml = null;
    this.revertCollabDoc = null;
    this._chatController = null;
    this._fileInput = null;
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
    this._clearPendingAttachments();
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
      getRevertSnapshotAemHtml: (toolInput) => {
        if (this._pageContextForAgent().view !== 'edit') return null;
        const fn = this.getRevertSnapshotAemHtml;
        return typeof fn === 'function' ? fn(toolInput) : null;
      },
      onRevertCollabAemHtml: (detail) => {
        const fn = this.revertCollabDoc;
        if (typeof fn === 'function') fn(detail);
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

  // eslint-disable-next-line class-methods-use-this
  async _fileToAttachment(file) {
    const id = (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`);
    const mediaType = file.type || 'application/octet-stream';
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
    return {
      id,
      fileName: file.name || 'attachment',
      mediaType,
      sizeBytes: Number.isFinite(file.size) ? Number(file.size) : undefined,
      dataBase64: base64,
      previewUrl: mediaType.startsWith('image/') ? URL.createObjectURL(file) : '',
    };
  }

  async _onAttachmentFilesSelected(fileList) {
    const files = Array.from(fileList || []).filter((f) => f && f.type?.startsWith('image/'));
    if (files.length === 0) return;
    const next = [...this._pendingAttachments];
    // Keep request payload bounded in the UI; can be lifted later.
    const maxFiles = 5;
    const available = Math.max(0, maxFiles - next.length);
    const picked = files.slice(0, available);
    // eslint-disable-next-line no-restricted-syntax
    for (const file of picked) {
      // eslint-disable-next-line no-await-in-loop
      const attachment = await this._fileToAttachment(file);
      if (attachment.dataBase64) next.push(attachment);
    }
    this._pendingAttachments = next;
  }

  _openAttachmentPicker() {
    if (!this._fileInput) {
      this._fileInput = document.createElement('input');
      this._fileInput.type = 'file';
      this._fileInput.accept = 'image/*';
      this._fileInput.multiple = true;
      this._fileInput.style.display = 'none';
      this._fileInput.addEventListener('change', async (e) => {
        await this._onAttachmentFilesSelected(e.target?.files);
        this._fileInput.value = '';
      });
      this.renderRoot.appendChild(this._fileInput);
    }
    this._fileInput.click();
  }

  _removePendingAttachment(id) {
    const removed = this._pendingAttachments.find((a) => a.id === id);
    if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
    this._pendingAttachments = this._pendingAttachments.filter((a) => a.id !== id);
  }

  _clearPendingAttachments() {
    this._pendingAttachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    this._pendingAttachments = [];
  }

  async _handlePaste(e) {
    const dt = e.clipboardData;
    if (!dt?.items?.length) return;
    const files = [];
    for (const item of dt.items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length === 0) return;
    e.preventDefault();
    await this._onAttachmentFilesSelected(files);
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
    if ((!content && this._pendingAttachments.length === 0)
      || this._isThinking || this._isAwaitingApproval || this._isAwaitingClientTool
      || !this._chatController) return;
    const contextSnapshot = [...(this.onPageContextItems ?? [])];
    const pendingRaw = [...this._pendingAttachments];
    const pending = pendingRaw.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mediaType: a.mediaType,
      sizeBytes: a.sizeBytes,
      dataBase64: a.dataBase64,
    }));
    this._inputValue = '';
    pendingRaw.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    this._pendingAttachments = [];
    if (this._pendingSkillIds?.length > 0) {
      this._chatController.requestedSkills = [...this._pendingSkillIds];
      this._pendingSkillIds = [];
    } else {
      this._chatController.requestedSkills = [];
    }
    this._chatController.mcpServers = this._configuredMcpServers || {};
    this._chatController.sendMessage(content, contextSnapshot, pending);
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

  _sendToolApprovalAndRemember(toolCallId) {
    if (!toolCallId || !this._chatController) return;
    const card = this._toolCards?.get(toolCallId);
    if (card?.toolName) addAutoApprovedTool(card.toolName);
    this._chatController.approveToolCall({ toolCallId, approved: true });
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
      const resp = await daFetch(`${DA_ORIGIN}/config/${path}`);
      if (!resp.ok) return {};
      const json = await resp.json();
      const entries = json?.data?.data || [];
      const cfg = entries.reduce((acc, row) => {
        if (row.key) acc[row.key] = row.value;
        return acc;
      }, {});
      this._daConfig = cfg;

      // Extract mcp-servers sheet: each row has { key, url } or { key, value }
      const mcpRows = json?.['mcp-servers']?.data || [];
      const servers = {};
      const rows = [];
      mcpRows.forEach((row) => {
        const url = row.url || row.value;
        if (row.key && url) {
          servers[row.key] = url;
          rows.push({ ...row, url });
        }
      });
      this._configuredMcpServers = servers;
      this._configuredMcpRows = rows;

      // Extract agents sheet: each row has { key, url } or { key, value }
      const agentRows = json?.agents?.data || [];
      this._configuredAgentRows = agentRows
        .filter((r) => r.key && (r.url || r.value))
        .map((r) => ({ ...r, url: r.url || r.value }));

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
          </select>
          <button type="button" class="skill-tb-btn skill-tb-add" title="Create new skill" aria-label="Create new skill"
            @click=${() => { this._newSkillMode = true; this._newSkillName = ''; }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 3.75a.75.75 0 0 1 .75.75v4.75h4.75a.75.75 0 0 1 0 1.5h-4.75v4.75a.75.75 0 0 1-1.5 0v-4.75H4.5a.75.75 0 0 1 0-1.5h4.75V4.5a.75.75 0 0 1 .75-.75Z" fill="currentColor"/></svg>
          </button>
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

  _renderBuiltinAgentCard(agent) {
    return html`
      <div class="builtin-agent-card">
        <div class="builtin-agent-header">
          <div class="builtin-agent-info">
            <span class="builtin-agent-name">${agent.name}</span>
            <span class="builtin-agent-desc">${agent.description}</span>
          </div>
          <div class="builtin-agent-actions">
            <span class="mcp-server-status ok">always active</span>
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
    const configuredRows = this._configuredAgentRows || [];

    return html`
      <div class="agents-panel">
        <div class="mcp-category">
          <span class="mcp-category-pill built-in">Built-in</span>
          ${BUILTIN_AGENTS.map((a) => this._renderBuiltinAgentCard(a))}
        </div>

        <div class="mcp-category">
          <span class="mcp-category-pill configured">Configured <span class="mcp-category-count">${configuredRows.length}</span></span>
          ${configuredRows.length > 0
    ? configuredRows.map((row) => {
      const isActive = this._activeAgentId === row.key;
      return html`
                <div class="agent-config-item ${isActive ? 'active' : ''}">
                  <div class="agent-config-header">
                    <div class="agent-config-info">
                      <span class="agent-config-id">${row.key}</span>
                      <code class="agent-config-url">${row.url}</code>
                    </div>
                    <sp-button
                      variant="${isActive ? 'secondary' : 'primary'}" size="s"
                      title="${isActive ? 'Deactivate' : 'Activate'} ${row.key}"
                      aria-label="${isActive ? 'Deactivate' : 'Activate'} ${row.key}"
                      @click=${() => this._activateAgent(isActive ? null : row.key)}>
                      ${isActive ? 'Active' : 'Activate'}
                    </sp-button>
                  </div>
                </div>`;
    })
    : html`<div class="mcp-category-empty">No agents configured. Add an <code>agents</code> sheet to your DA config with <code>key</code> and <code>url</code> columns.</div>`}
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

  _renderAttachmentPills(items, removable = false) {
    if (!items?.length) return nothing;
    return html`
      <div class="message-attached-context" aria-label="Attachments included with this message">
        <span class="message-attached-context-hint">Attachments</span>
        <div class="chat-context-pills chat-context-pills-sent">
          ${items.map((item) => {
      const title = `${item.fileName || 'attachment'} (${item.mediaType || 'application/octet-stream'})`;
      return html`
              <span class="chat-context-pill chat-context-pill-sent attachment-pill" title="${title}">
                ${removable
      ? html`<button
                      type="button"
                      class="chat-context-pill-remove attachment-pill-remove"
                      aria-label="Remove attachment"
                      @click=${() => this._removePendingAttachment(item.id)}
                    >×</button>`
      : nothing}
                <span class="chat-context-pill-label">${item.fileName || 'attachment'}</span>
              </span>
            `;
    })}
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

  /** Omit client-only snapshot from expanded JSON (avoids huge HTML in UI). */
  _inputForToolCardDisplay(input) {
    if (!input || typeof input !== 'object') return input;
    const rest = { ...input };
    // eslint-disable-next-line no-underscore-dangle
    if ('_daRevertSnapshot' in rest) delete rest._daRevertSnapshot;
    return rest;
  }

  _onRevertToolCall(e, toolCallId) {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (!this._chatController || !toolCallId) return;
    this._revertPendingToolCallId = toolCallId;
    this._revertConfirmOpen = true;
    this.requestUpdate();
  }

  _onRevertDialogClosed() {
    this._revertPendingToolCallId = null;
    this._revertConfirmOpen = false;
    this.requestUpdate();
  }

  _closeRevertDialog() {
    this._revertPendingToolCallId = null;
    this._revertConfirmOpen = false;
    this.requestUpdate();
  }

  _confirmRevertDialog() {
    const id = this._revertPendingToolCallId;
    this._revertPendingToolCallId = null;
    this._revertConfirmOpen = false;
    this.requestUpdate();
    if (id && this._chatController) this._chatController.revertUpdateToolCall(id);
  }

  _renderRevertConfirmDialog() {
    return html`
      <div class="chat-revert-dialog-host">
        <overlay-trigger
          type="modal"
          triggered-by="click"
          .open="${this._revertConfirmOpen ? 'click' : undefined}"
          @sp-closed=${this._onRevertDialogClosed}
        >
          <sp-dialog-wrapper
            slot="click-content"
            headline="Revert update?"
            dismissable
            underlay
          >
            <div class="chat-revert-dialog-body">
              <p class="chat-revert-dialog-text">
                Revert this update? Chat will go back to before this tool call and the page will be
                restored to the saved version.
              </p>
              <div class="chat-revert-dialog-actions">
                <sp-button variant="secondary" @click=${this._closeRevertDialog}>Cancel</sp-button>
                <sp-button variant="negative" @click=${this._confirmRevertDialog}>Revert</sp-button>
              </div>
            </div>
          </sp-dialog-wrapper>
          <button
            type="button"
            slot="trigger"
            class="chat-revert-dialog-trigger-hidden"
            tabindex="-1"
            aria-hidden="true"
          ></button>
        </overlay-trigger>
      </div>
    `;
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

    const friendly = getFriendlyToolDetails(toolName, input, output, {
      updateApprovalOnly: isApproval && isUpdateTool(toolName),
    });
    const headerParts = getToolCardHeaderParts(toolName, input);
    const titleLabel = headerParts?.primary
      || getToolDisplayTitle(toolName)
      || toolName;

    const inputText = !friendly && input && typeof input === 'object'
      ? JSON.stringify(this._inputForToolCardDisplay(input), null, 2) : null;
    const outputText = !friendly && output ? JSON.stringify(output, null, 2) : null;

    const renderDetailRows = (rows, sectionLabel) => {
      if (!rows?.length) return nothing;
      return html`
        <div class="tool-section-label">${sectionLabel}</div>
        <dl class="tool-friendly-details">
          ${rows.map((row) => html`
            <dt class="tool-detail-label">${row.label}</dt>
            <dd class="tool-detail-value tool-detail-value-multiline">${row.value}</dd>
          `)}
        </dl>
      `;
    };

    const inputSectionLabel = isApproval && isUpdateTool(toolName) ? 'Review' : 'Action';
    // Client snapshot field from chat-controller (underscore prefix = not for model).
    // eslint-disable-next-line no-underscore-dangle
    const revertSnap = input && typeof input === 'object' ? input._daRevertSnapshot : null;
    const canRevert = isUpdateTool(toolName)
      && typeof revertSnap?.html === 'string'
      && revertSnap.html.length > 0;

    return html`
      <div class="tool-card ${cardStateClass} ${isOpen ? 'open' : ''}">
        <div class="tool-summary" @click=${() => this._toggleToolCard(toolCallId)}>
          <img
            class="tool-card-arrow-icon"
            src="${TOOL_CARD_ARROW_ICON_SRC}"
            width="20"
            height="20"
            alt=""
          />
          ${canRevert ? html`
            <button
              type="button"
              class="tool-card-revert-btn"
              title="Revert chat and page to before this update"
              aria-label="Revert chat and page to before this update"
              @click=${(e) => this._onRevertToolCall(e, toolCallId)}
            >
              <img src="${TOOL_CARD_REVERT_ICON_SRC}" width="18" height="18" alt="" />
            </button>
          ` : ''}
          <span class="tool-name-label" title="${headerParts?.titleAttr ?? ''}">${titleLabel}</span>
          <span class="tool-status ${statusClass}">${statusText}</span>
          <span class="tool-chevron">▶</span>
        </div>
        <div class="tool-body">
          ${friendly
    ? html`
            ${renderDetailRows(friendly.inputRows, inputSectionLabel)}
            ${renderDetailRows(friendly.outputRows, 'Result')}
          `
    : ''}
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
            <button type="button" class="btn-approve" @click=${() => this._sendToolApproval(toolCallId, true)}>Approve</button>
            <button type="button" class="btn-approve-always" title="Approve now and skip this prompt for this tool in the future on this browser"
              @click=${() => this._sendToolApprovalAndRemember(toolCallId)}>
              Approve &amp; always allow
            </button>
            <button type="button" class="btn-reject" @click=${() => this._sendToolApproval(toolCallId, false)}>Reject</button>
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
        <button
          type="button"
          slot="trigger"
          class="chat-toolbar-icon-btn"
          title="Skills Quick Editing"
          aria-label="Open Skills Quick Editing"
          ?disabled=${this._isThinking || this._isAwaitingApproval || this._isAwaitingClientTool || !this._connected}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M8.74706 5.32911L6.92675 1.8252C6.75683 1.49415 6.41894 1.28711 6.04687 1.28418H6.03906C5.66992 1.28418 5.33301 1.48633 5.15918 1.80957L3.26953 5.31055C3.09375 5.6377 3 6.00684 3 6.37891V16.75C3 17.9902 4.00977 19 5.25 19H6.75C7.99023 19 9 17.9902 9 16.75V6.36622C9 6.00587 8.9121 5.64747 8.74706 5.32911ZM7.49999 7.50001V14.5H4.49999V7.50001H7.49999ZM6.03026 3.35353L7.40477 6.00001H4.60252L6.03026 3.35353ZM6.74999 17.5H5.24999C4.8369 17.5 4.49999 17.1631 4.49999 16.75V16H7.49999V16.75C7.49999 17.1631 7.16308 17.5 6.74999 17.5Z" fill="currentColor"/>
            <path d="M14.75 1H13.25C12.0098 1 11 2.00977 11 3.25V9.979C11 9.98388 10.9971 9.98803 10.9971 9.99316C10.9971 9.99853 11 10.0027 11 10.008V13.73C11 13.7348 10.9971 13.7383 10.9971 13.7431C10.9971 13.7485 11 13.7527 11 13.758V16.75C11 17.9902 12.0098 19 13.25 19H14.75C15.9902 19 17 17.9902 17 16.75V3.25C17 2.00977 15.9902 1 14.75 1ZM15.5 16.75C15.5 17.1631 15.1631 17.5 14.75 17.5H13.25C12.8369 17.5 12.5 17.1631 12.5 16.75V14.499L13.7441 14.5039H13.7471C14.1602 14.5039 14.4951 14.1699 14.4971 13.7568C14.499 13.3428 14.1641 13.0058 13.75 13.0039L12.5 12.999V10.749L13.7441 10.7539H13.7471C14.1602 10.7539 14.4951 10.4199 14.4971 10.0068C14.499 9.59277 14.1641 9.25585 13.75 9.2539L12.5 9.24902V7.00341L13.7471 7.00878H13.75C14.1631 7.00878 14.498 6.6748 14.5 6.26171C14.502 5.84765 14.168 5.51073 13.7529 5.50878L12.5 5.50341V3.24999C12.5 2.8369 12.8369 2.49999 13.25 2.49999H14.75C15.1631 2.49999 15.5 2.8369 15.5 3.24999V16.75Z" fill="currentColor"/>
          </svg>
        </button>
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
            const attachmentMeta = Array.isArray(message.attachmentsMeta)
              ? message.attachmentsMeta : [];
            return html`
              <div class="message-row user">
                <div class="message-user-column">
                  ${this._renderAttachedContextPills(attached)}
                  ${this._renderAttachmentPills(attachmentMeta)}
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
          ${this._pendingAttachments.length > 0
    ? this._renderAttachmentPills(this._pendingAttachments, true)
    : ''}
          ${this._renderSlashMenu()}
          <div class="chat-footer-row ${this._isThinking ? 'thinking' : ''}">
          <div class="chat-toolbar-icon-group">
            ${this._renderSkillsButton()}
            <button
              type="button"
              class="chat-toolbar-icon-btn"
              title="Attach image"
              aria-label="Attach image"
              ?disabled=${this._isThinking || this._isAwaitingApproval || this._isAwaitingClientTool || !this._connected}
              @click=${this._openAttachmentPicker}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M6.5 10.75V6.5a3.5 3.5 0 1 1 7 0v6.75a5 5 0 0 1-10 0V5.75a.75.75 0 0 1 1.5 0v7.5a3.5 3.5 0 0 0 7 0V6.5a2 2 0 1 0-4 0v4.25a.75.75 0 0 0 1.5 0V7a.75.75 0 0 1 1.5 0v3.75a2.25 2.25 0 0 1-4.5 0Z" fill="currentColor"/></svg>
            </button>
          </div>
          <sp-textfield
            class="chat-input"
            label="Message"
            placeholder="Send a message... (type / for tools)"
            .value=${this._inputValue}
            ?disabled=${this._isThinking || this._isAwaitingApproval || this._isAwaitingClientTool
      || !this._connected}
            @input=${this._handleInput}
            @keydown=${this._handleKeyDown}
            @paste=${this._handlePaste}
          ></sp-textfield>
          ${this._isThinking
        ? html`<button type="button" class="chat-btn-stop" title="Stop generating" aria-label="Stop generating" @click=${this._stopRequest}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><rect x="1" y="1" width="12" height="12" rx="2" fill="currentColor"/></svg>
            </button>`
        : html`<button type="button" class="chat-btn-send" title="Send message" aria-label="Send message"
                ?disabled=${(!this._inputValue.trim() && this._pendingAttachments.length === 0) || !this._connected || this._isAwaitingApproval
          || this._isAwaitingClientTool}
                @click=${this._sendMessage}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M18.6485 9.9735C18.6482 9.67899 18.4769 9.41106 18.2059 9.29056L4.05752 2.93282C3.80133 2.8175 3.50129 2.85583 3.28171 3.03122C3.06178 3.20765 2.95889 3.49146 3.01516 3.76733L4.28678 10.008L3.06488 16.2384C3.0162 16.4852 3.09492 16.738 3.27031 16.9134C3.29068 16.9337 3.31278 16.9531 3.33522 16.9714C3.55619 17.1454 3.85519 17.182 4.11069 17.066L18.2086 10.6578C18.4773 10.5356 18.6489 10.268 18.6485 9.9735ZM14.406 9.22716L5.66439 9.25379L4.77705 4.90084L14.406 9.22716ZM4.81711 15.0973L5.6694 10.7529L14.4323 10.7264L4.81711 15.0973Z" fill="currentColor"/></svg>
            </button>`}
          </div>
        </div>

        <div class="chat-status">${this._statusText}</div>
        ${this._renderRevertConfirmDialog()}
      </div>
    `;
  }
}

customElements.define('da-chat', Chat);
