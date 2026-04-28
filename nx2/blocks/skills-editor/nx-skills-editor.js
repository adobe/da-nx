import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, HashController } from '../../utils/utils.js';
import '../shared/tabs/tabs.js';
import '../shared/card/card.js';
import '../shared/popover/popover.js';
import {
  fetchDaConfigSheets,
  loadSkillsWithStatuses,
  syncOrphanSkillsToConfig,
  upsertSkillInConfig,
  deleteSkillFromConfig,
  writeSkillMdFile,
  readSkillMdFile,
  deleteSkillMdFile,
  upsertPromptInConfig,
  deletePromptFromConfig,
  loadAgentPresets,
  saveAgentPresetFile,
  fetchMcpToolsFromAgent,
  extractToolRefs,
  consumeSuggestionHandoff,
  clearSuggestionSession,
  registerMcpServer,
  setMcpServerEnabled,
  deleteMcpServer,
  setToolOverride,
  deleteToolOverride,
  skillRowStatus,
  skillRowEnabled,
  fetchSiteSourceText,
  DA_SKILLS_EDITOR_SUGGESTION_HANDOFF,
  DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT,
  DA_SKILLS_EDITOR_FORM_DISMISS,
  DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT,
  DA_SKILLS_EDITOR_PROMPT_SEND,
  DA_SKILLS_LAB_SUGGESTION_HANDOFF,
  DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT,
  DA_SKILLS_LAB_FORM_DISMISS,
  DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT,
  DA_SKILLS_LAB_PROMPT_SEND,
} from './skills-editor-api.js';

const styles = await loadStyle(import.meta.url);

const CATALOG_TABS = [
  { id: 'skills', label: 'Skills' },
  { id: 'agents', label: 'Agents' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'mcps', label: 'MCPs' },
  { id: 'memory', label: 'Memory' },
];

/** Per-tab metadata for the "new" button label and the opener method name. */
const TAB_ACTIONS = {
  skills: { btnLabel: '+ New Skill', opener: '_openNewSkillEditor' },
  agents: { btnLabel: '+ New Agent', opener: '_openNewAgentEditor' },
  prompts: { btnLabel: '+ New Prompt', opener: '_openNewEditor' },
  mcps: { btnLabel: '+ Register MCP', opener: '_openNewMcpEditor' },
};

const CATEGORY_OPTIONS = ['Review', 'Workflow', 'Style', 'Content'];
const KNOWN_CATEGORY_CLASSES = new Set(['review', 'workflow', 'style', 'content']);

const STATUS = { APPROVED: 'approved', DRAFT: 'draft' };
const STATUS_TYPE = { OK: 'ok', WARN: 'warn', ERR: 'err' };

/**
 * Canonical shape for all form fields across skill/prompt/MCP modes.
 * Adding a new field? Add it here and in _captureForm / _restoreForm automatically.
 */
const FRESH_FORM_STATE = Object.freeze({
  formSkillId: '',
  formSkillBody: '',
  isFormEdit: false,
  isAgentViewTools: false,
  formPromptTitle: '',
  formPromptBody: '',
  formPromptCategory: '',
  formPromptIcon: '',
  formPromptOriginalTitle: '',
  isFormPromptEdit: false,
  formPromptTools: [],
  mcpKey: '',
  mcpUrl: '',
  mcpDescription: '',
  mcpAuthHeaderName: 'x-api-key',
  mcpAuthHeaderValue: '',
  editingMcpKey: null,
  viewingMcpServerId: null,
  newAgentId: '',
  newAgentName: '',
});

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
    label: 'DA Assistant',
    description: 'Default content authoring assistant with full DA tooling',
    mcpServers: ['da-tools', 'eds-preview'],
  },
];

const BUILTIN_TOOL_DETAILS = {
  'da-tools': [
    { name: 'content_list', description: 'List files and directories at a path' },
    { name: 'content_read', description: 'Read file content and metadata' },
    { name: 'content_create', description: 'Create a new source file' },
    { name: 'content_update', description: 'Update an existing source file' },
    { name: 'content_delete', description: 'Delete a source file' },
    { name: 'content_copy', description: 'Copy content to another location' },
    { name: 'content_move', description: 'Move content to another location' },
    { name: 'content_version_create', description: 'Snapshot the current state of a file' },
    { name: 'content_version_list', description: 'Get version history for a file' },
    { name: 'content_media', description: 'Lookup media references and URLs' },
    { name: 'content_fragment', description: 'Lookup content fragment references' },
    { name: 'content_upload', description: 'Upload an image or media file' },
    { name: 'da_get_skill', description: 'Read a skill by ID' },
    { name: 'da_create_skill', description: 'Create or update a skill' },
    { name: 'da_list_agents', description: 'List available agent presets' },
    { name: 'da_create_agent', description: 'Create or update an agent preset' },
    { name: 'da_embed_fragment', description: 'Embed a web fragment into a page' },
    { name: 'write_project_memory', description: 'Write to long-lived project memory' },
  ],
  'eds-preview': [
    { name: 'content_preview', description: 'Preview a page on EDS preview environment' },
    { name: 'content_publish', description: 'Publish a page to EDS live environment' },
    { name: 'content_unpreview', description: 'Remove a page from EDS preview' },
    { name: 'content_unpublish', description: 'Unpublish a page from EDS live' },
  ],
};

const BUILTIN_TOOL_IDS = Object.values(BUILTIN_TOOL_DETAILS).flat().map((t) => t.name);

class NxSkillsEditor extends LitElement {
  static properties = {
    _isLoading: { state: true },
    _isRefreshing: { state: true },
    _catalogTab: { state: true },
    _catalogFilter: { state: true },
    _skills: { state: true },
    _skillStatuses: { state: true },
    _prompts: { state: true },
    _agents: { state: true },
    _agentRows: { state: true },
    _mcpRows: { state: true },
    _mcpTools: { state: true },
    _configuredMcpServers: { state: true },
    _configuredMcpServerHeaders: { state: true },
    _formSkillId: { state: true },
    _formSkillBody: { state: true },
    _isFormEdit: { state: true },
    _formPromptTitle: { state: true },
    _formPromptCategory: { state: true },
    _formPromptBody: { state: true },
    _isFormPromptEdit: { state: true },
    _isSaveBusy: { state: true },
    _statusMsg: { state: true },
    _statusType: { state: true },
    _hasSuggestion: { state: true },
    _mcpKey: { state: true },
    _mcpUrl: { state: true },
    _mcpDescription: { state: true },
    _mcpAuthHeaderName: { state: true },
    _mcpAuthHeaderValue: { state: true },
    _editingMcpKey: { state: true },
    _viewingMcpServerId: { state: true },
    _mcpEnableBusy: { state: true },
    _activeToolRefs: { state: true },
    _toolOverrides: { state: true },
    _memory: { state: true },
    _isEditorOpen: { state: true },
    _isAgentViewTools: { state: true },
    _isFormDirty: { state: true },
    _promptSearch: { state: true },
    _toolsSearch: { state: true },
    _toolsGroupCollapsed: { state: true },
    _formPromptTools: { state: true },
    _isChatOpen: { state: true },
    _gateOrg: { state: true },
    _gateSite: { state: true },
  };

  // ─── non-reactive instance fields (simple inits, not LitElement state) ────
  _loadedKey = null;

  _statusTimer = null;

  _dirtyForms = {}; // non-reactive: { [tabId]: snapshot }

  _editorTriggerSelector = null; // CSS selector for the element that opened the drawer

  _chatLoaded = false;

  _syncOrphansInFlight = false;

  _agentsLoadInFlight = false;

  _mcpToolsLoadInFlight = false;

  constructor() {
    super();
    this._hash = new HashController(this);
    this._isLoading = true;
    this._isRefreshing = false;
    this._catalogTab = 'skills';
    this._catalogFilter = 'all';
    this._skills = {};
    this._skillStatuses = {};
    this._prompts = [];
    this._agents = [];
    this._agentRows = [];
    this._mcpRows = [];
    this._mcpTools = null;
    this._configuredMcpServers = {};
    this._configuredMcpServerHeaders = {};
    this._clearForm();
    this._gateOrg = '';
    this._gateSite = '';
    this._mcpEnableBusy = {};
    this._activeToolRefs = null;
    this._toolOverrides = {};
    this._memory = null;
    this._isEditorOpen = false;
    this._isAgentViewTools = false;
    this._isFormDirty = false;
    this._promptSearch = '';
    this._toolsSearch = '';
    this._toolsGroupCollapsed = { DA: false, MCP: false };
    this._formPromptTools = [];
    this._isChatOpen = sessionStorage.getItem('nx-skills-editor-chat-open') === '1';
  }

  get _org() { return this._hash.value?.org; }

  get _site() { return this._hash.value?.site; }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._boundOnSuggestion = () => this._applySuggestion();
    this._boundOnClearForm = () => this._clearForm();
    this._boundOnPopstate = (e) => this._onPopstate(e);
    window.addEventListener(DA_SKILLS_EDITOR_SUGGESTION_HANDOFF, this._boundOnSuggestion);
    window.addEventListener(DA_SKILLS_LAB_SUGGESTION_HANDOFF, this._boundOnSuggestion);
    window.addEventListener(DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT, this._boundOnClearForm);
    window.addEventListener(DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT, this._boundOnClearForm);
    window.addEventListener('popstate', this._boundOnPopstate);
    // Seed initial history state so back navigation knows which tab was active
    history.replaceState({ ...history.state, skillsEditorTab: this._catalogTab }, '');
    if (this._isChatOpen) {
      import('../chat/chat.js').then(() => { this._chatLoaded = true; });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._statusTimer);
    window.removeEventListener(DA_SKILLS_EDITOR_SUGGESTION_HANDOFF, this._boundOnSuggestion);
    window.removeEventListener(DA_SKILLS_LAB_SUGGESTION_HANDOFF, this._boundOnSuggestion);
    window.removeEventListener(DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT, this._boundOnClearForm);
    window.removeEventListener(DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT, this._boundOnClearForm);
    window.removeEventListener('popstate', this._boundOnPopstate);
  }

  async updated(changed) {
    if (!this._org || !this._site) return;
    const key = `${this._org}/${this._site}`;
    if (key !== this._loadedKey) {
      this._loadedKey = key;
      this._memory = null;
      const restored = this._restoreDataSnapshot();
      if (restored) {
        this._isLoading = false;
        await this._reload({
          silent: true,
          showRefreshIndicator: true,
          includeMdFiles: false,
        });
      } else {
        await this._reload();
      }
      // Restore panel state after data is available (must come after _reload)
      await this._restoreNavState();
    }
    if (changed?.has('_catalogTab') && this._catalogTab === 'memory' && this._memory === null) {
      this._loadMemory();
    }
    if (changed?.has('_catalogTab') && this._catalogTab === 'agents') {
      this._ensureAgentsLoaded();
    }
    if (changed?.has('_catalogTab') && this._catalogTab === 'mcps') {
      this._ensureMcpToolsLoaded();
    }
    // Move focus into the drawer on open; restore it to the trigger on close.
    if (changed?.has('_isEditorOpen')) {
      if (this._isEditorOpen) {
        this.updateComplete.then(() => {
          const firstFocusable = this.shadowRoot.querySelector(
            '.col-editor input:not([disabled]), .col-editor textarea:not([disabled]), .col-editor button:not([disabled])',
          );
          firstFocusable?.focus();
        });
      } else if (this._editorTriggerSelector) {
        const trigger = this.shadowRoot.querySelector(this._editorTriggerSelector);
        trigger?.focus();
        this._editorTriggerSelector = null;
      }
    }
    // Persist navigation state when structural nav properties change.
    // We skip this during the initial load cycle (before _loadedKey is set) to
    // avoid overwriting a saved state with the blank initial state.
    if (changed && this._loadedKey) {
      const itemChanged = (changed.has('_formSkillId') && this._isFormEdit)
        || (changed.has('_formPromptTitle') && this._isFormPromptEdit)
        || changed.has('_editingMcpKey');
      if (changed.has('_isEditorOpen') || changed.has('_catalogTab') || itemChanged) {
        this._saveNavState();
      }
    }
  }

  // ─── nav state persistence ────────────────────────────────────────────────

  _navStorageKey() {
    return `da-skills-editor-nav:${this._org}/${this._site}`;
  }

  _dataSnapshotStorageKey() {
    return `da-skills-editor-data:${this._org}/${this._site}`;
  }

  _saveDataSnapshot() {
    if (!this._org || !this._site) return;
    const snapshot = {
      skills: this._skills,
      skillStatuses: this._skillStatuses,
      prompts: this._prompts,
      agentRows: this._agentRows,
      mcpRows: this._mcpRows,
      configuredMcpServers: this._configuredMcpServers,
      configuredMcpServerHeaders: this._configuredMcpServerHeaders,
      toolOverrides: this._toolOverrides,
      agents: this._agents,
    };
    try {
      sessionStorage.setItem(this._dataSnapshotStorageKey(), JSON.stringify(snapshot));
    } catch { /* best effort */ }
  }

  _restoreDataSnapshot() {
    if (!this._org || !this._site) return false;
    try {
      const raw = sessionStorage.getItem(this._dataSnapshotStorageKey());
      if (!raw) return false;
      const snap = JSON.parse(raw);
      if (!snap || typeof snap !== 'object') return false;
      this._skills = snap.skills || {};
      this._skillStatuses = snap.skillStatuses || {};
      this._prompts = Array.isArray(snap.prompts) ? snap.prompts : [];
      this._agentRows = Array.isArray(snap.agentRows) ? snap.agentRows : [];
      this._mcpRows = Array.isArray(snap.mcpRows) ? snap.mcpRows : [];
      this._configuredMcpServers = snap.configuredMcpServers || {};
      this._configuredMcpServerHeaders = snap.configuredMcpServerHeaders || {};
      this._toolOverrides = snap.toolOverrides || {};
      this._agents = Array.isArray(snap.agents) ? snap.agents : [];
      return true;
    } catch {
      return false;
    }
  }

  _saveNavState() {
    if (!this._org || !this._site) return;
    const tab = this._catalogTab;
    const payload = { tab, editorOpen: this._isEditorOpen };

    if (this._isEditorOpen) {
      if ((tab === 'skills' || tab === 'agents') && this._isFormEdit && this._formSkillId) {
        payload.itemType = 'skill';
        payload.itemId = this._formSkillId;
      } else if (tab === 'prompts' && this._isFormPromptEdit && this._formPromptTitle) {
        payload.itemType = 'prompt';
        payload.itemId = this._formPromptTitle;
      } else if (tab === 'mcps' && this._editingMcpKey) {
        payload.itemType = 'mcp';
        payload.itemId = this._editingMcpKey;
      }
    }

    try {
      sessionStorage.setItem(this._navStorageKey(), JSON.stringify(payload));
    } catch { /* quota / private browsing */ }
  }

  async _restoreNavState() {
    if (!this._org || !this._site) return;
    let payload;
    try {
      const raw = sessionStorage.getItem(this._navStorageKey());
      if (!raw) return;
      payload = JSON.parse(raw);
    } catch { return; }

    const { tab, editorOpen, itemType, itemId } = payload;

    if (tab) this._catalogTab = tab;

    if (!editorOpen) return;

    if (tab === 'memory') {
      this._isEditorOpen = true;
      return;
    }

    if (!itemId) {
      this._isEditorOpen = true;
      return;
    }

    if (itemType === 'skill') {
      await this._onEditSkill(itemId);
    } else if (itemType === 'prompt') {
      const row = (this._prompts || []).find((p) => p.title === itemId);
      if (row) this._openEditor(row);
    } else if (itemType === 'mcp') {
      const row = (this._mcpRows || []).find((r) => r.key === itemId);
      if (row) this._onEditMcp(row);
      else { this._editingMcpKey = itemId; this._isEditorOpen = true; }
    }
  }

  // ─── data loading ─────────────────────────────────────────────────────────

  _scheduleOrphanSkillSync() {
    if (this._syncOrphansInFlight || !this._org || !this._site) return;
    const loadKey = this._loadedKey;
    this._syncOrphansInFlight = true;
    syncOrphanSkillsToConfig(this._org, this._site)
      .then((backfilled) => {
        const changed = backfilled?.configBackfilled?.length || backfilled?.filesWritten?.length;
        if (!changed) return;
        // eslint-disable-next-line no-console
        console.info('[skills-editor] background sync:', backfilled);
        if (`${this._org}/${this._site}` === loadKey) {
          this._reload({
            silent: true,
            showRefreshIndicator: true,
            includeMdFiles: true,
          }).catch(() => {});
        }
      })
      .catch(() => { /* non-fatal */ })
      .finally(() => { this._syncOrphansInFlight = false; });
  }

  async _reload(options = {}) {
    if (!this._org || !this._site) return;
    const {
      silent = false,
      showRefreshIndicator = false,
      includeMdFiles = true,
    } = options;
    if (!silent) this._isLoading = true;
    if (showRefreshIndicator) this._isRefreshing = true;

    try {
      const configResult = await fetchDaConfigSheets(this._org, this._site);
      const [skillsResult] = await Promise.all([
        loadSkillsWithStatuses(this._org, this._site, configResult, { includeMdFiles }),
      ]);

      this._skills = skillsResult.map;
      this._skillStatuses = skillsResult.statuses;
      this._prompts = configResult.json?.prompts?.data || [];
      this._agentRows = configResult.agentRows || [];
      this._mcpRows = configResult.mcpRows || [];
      this._configuredMcpServers = configResult.configuredMcpServers || {};
      this._configuredMcpServerHeaders = configResult.configuredMcpServerHeaders || {};
      this._toolOverrides = configResult.toolOverrides || {};
      this._saveDataSnapshot();

      this._applySuggestion();
      this._scheduleOrphanSkillSync();
    } finally {
      if (!silent) this._isLoading = false;
      if (showRefreshIndicator) this._isRefreshing = false;
    }
  }

  async _ensureAgentsLoaded() {
    if (this._agentsLoadInFlight || this._agents.length) return;
    const loadKey = this._loadedKey;
    this._agentsLoadInFlight = true;
    this._isRefreshing = true;
    try {
      const presets = await loadAgentPresets(this._org, this._site);
      if (`${this._org}/${this._site}` === loadKey) {
        this._agents = presets;
        this._saveDataSnapshot();
      }
    } catch {
      // non-fatal: agent presets unavailable
    } finally {
      this._agentsLoadInFlight = false;
      this._isRefreshing = false;
    }
  }

  async _ensureMcpToolsLoaded() {
    if (
      this._mcpToolsLoadInFlight
      || this._mcpTools
      || !Object.keys(this._configuredMcpServers).length
    ) return;
    const loadKey = this._loadedKey;
    this._mcpToolsLoadInFlight = true;
    this._isRefreshing = true;
    try {
      const tools = await fetchMcpToolsFromAgent(
        this._configuredMcpServers,
        this._configuredMcpServerHeaders,
      );
      if (`${this._org}/${this._site}` === loadKey) this._mcpTools = tools;
    } catch {
      // non-fatal: MCP tool listing unavailable
    } finally {
      this._mcpToolsLoadInFlight = false;
      this._isRefreshing = false;
    }
  }

  _applySuggestion() {
    const suggestion = consumeSuggestionHandoff();
    if (suggestion) {
      this._formSkillId = suggestion.id || '';
      this._formSkillBody = suggestion.body || '';
      this._isFormEdit = false;
      this._hasSuggestion = true;
      this._catalogTab = 'skills';
      this._isEditorOpen = true;
    }
  }

  // ─── form helpers ─────────────────────────────────────────────────────────

  _clearForm() {
    Object.entries(FRESH_FORM_STATE).forEach(([key, val]) => {
      const prop = `_${key}`;
      this[prop] = Array.isArray(val) ? [...val] : val;
    });
    this._isSaveBusy = false;
    this._statusMsg = '';
    this._statusType = '';
    this._hasSuggestion = false;
  }

  _dismissForm() {
    this._clearDirty();
    this._clearForm();
    this._isEditorOpen = false;
    window.dispatchEvent(new CustomEvent(DA_SKILLS_EDITOR_FORM_DISMISS));
    window.dispatchEvent(new CustomEvent(DA_SKILLS_LAB_FORM_DISMISS));
  }

  _closeEditor() {
    // Just collapse the drawer. If the form was dirty, the snapshot lives in
    // _dirtyForms[tab] and will be restored when the user reopens the same item.
    this._isEditorOpen = false;
    if (!this._isFormDirty) this._clearForm();
  }

  async _toggleChat() {
    this._isChatOpen = !this._isChatOpen;
    sessionStorage.setItem('nx-skills-editor-chat-open', this._isChatOpen ? '1' : '0');
    if (this._isChatOpen && !this._chatLoaded) {
      await import('../chat/chat.js');
      this._chatLoaded = true;
    }
  }

  _setStatus(msg, type = STATUS_TYPE.OK) {
    clearTimeout(this._statusTimer);
    this._statusMsg = msg;
    this._statusType = type;
    if (type === 'ok') {
      this._statusTimer = setTimeout(() => { this._statusMsg = ''; }, 3000);
    }
  }

  _msgClass() {
    if (this._statusType === STATUS_TYPE.ERR) return 'msg-err';
    if (this._statusType === STATUS_TYPE.WARN) return 'msg-warn';
    return 'msg-ok';
  }

  // ─── dirty form tracking ─────────────────────────────────────────────────

  /** Snapshot current in-flight form fields, keyed by the active tab. */
  _captureForm() {
    const snap = { tab: this._catalogTab };
    Object.keys(FRESH_FORM_STATE).forEach((key) => {
      const val = this[`_${key}`];
      snap[key] = Array.isArray(val) ? [...val] : val;
    });
    return snap;
  }

  /** Restore form fields from a previously captured snapshot. */
  _restoreForm(snapshot) {
    if (!snapshot) return;
    Object.keys(FRESH_FORM_STATE).forEach((key) => {
      if (key in snapshot) {
        const val = snapshot[key];
        this[`_${key}`] = Array.isArray(val) ? [...val] : val;
      }
    });
    this._isEditorOpen = true;
  }

  /** Called on every form keystroke — marks the form as edited and keeps snapshot current. */
  _markDirty() {
    this._isFormDirty = true;
    this._dirtyForms[this._catalogTab] = this._captureForm();
  }

  /** Called after a successful save or explicit discard — removes stored draft. */
  _clearDirty() {
    this._isFormDirty = false;
    delete this._dirtyForms[this._catalogTab];
  }

  // ─── tab navigation with state preservation ──────────────────────────────

  _onTabChange(newTab) {
    if (newTab === this._catalogTab) return;

    // If the form wasn't touched, don't preserve it (clean switch).
    // If it was dirty, the snapshot is already up-to-date in _dirtyForms.
    if (!this._isFormDirty) delete this._dirtyForms[this._catalogTab];

    this._isFormDirty = false;
    this._statusMsg = '';
    this._catalogTab = newTab;
    this._promptSearch = '';
    this._catalogFilter = 'all'; // filter is tab-local; reset on every switch

    const saved = this._dirtyForms[newTab];
    if (saved) {
      this._restoreForm(saved);
      this._isFormDirty = true;
    } else {
      this._clearForm();
      this._isEditorOpen = newTab === 'memory';
    }

    this._pushTabState(newTab);
  }

  _pushTabState(tab) {
    // Merge with existing page state so we don't blow away the app's own history data.
    history.pushState({ ...history.state, skillsEditorTab: tab }, '');
  }

  _onPopstate(e) {
    const { skillsEditorTab } = e.state || {};
    if (!skillsEditorTab) return;

    // Snapshot current dirty edits before leaving
    if (this._isFormDirty) this._dirtyForms[this._catalogTab] = this._captureForm();

    this._isFormDirty = false;
    this._statusMsg = '';
    this._catalogTab = skillsEditorTab;
    this._promptSearch = '';
    this._catalogFilter = 'all'; // filter is tab-local; reset on back/forward

    const saved = this._dirtyForms[skillsEditorTab];
    if (saved) {
      this._restoreForm(saved);
      this._isFormDirty = true;
    } else {
      this._clearForm();
      this._isEditorOpen = skillsEditorTab === 'memory';
    }
  }

  /** Derive a stable CSS selector for the active trigger element. */
  _captureTriggerSelector() {
    const el = this.shadowRoot.activeElement;
    if (!el) return null;
    if (el.dataset?.skillId) return `[data-skill-id="${el.dataset.skillId}"]`;
    if (el.dataset?.mcpKey) return `[data-mcp-key="${el.dataset.mcpKey}"]`;
    if (el.dataset?.promptTitle) return `[data-prompt-title="${el.dataset.promptTitle}"]`;
    if (el.getAttribute('aria-label')) return `[aria-label="${el.getAttribute('aria-label')}"]`;
    if (el.classList?.contains('new-btn')) return '.new-btn';
    return null;
  }

  // ─── editor open helpers ──────────────────────────────────────────────────

  _openEditor(row) {
    this._editorTriggerSelector = this._captureTriggerSelector();
    // If this exact prompt already has dirty edits in memory, restore them.
    const saved = this._dirtyForms.prompts;
    if (saved?.formPromptTitle === (row.title || '')) {
      this._restoreForm(saved);
      this._isFormDirty = true;
      return;
    }

    this._formPromptTitle = row.title || '';
    this._formPromptBody = row.prompt || '';
    this._formPromptCategory = row.category || '';
    this._formPromptIcon = row.icon || '';
    this._formPromptOriginalTitle = row.title || '';
    this._formPromptTools = extractToolRefs(row.prompt || '');
    this._isFormPromptEdit = true;
    this._statusMsg = '';
    this._isEditorOpen = true;
    this._isFormDirty = false;
    delete this._dirtyForms.prompts;
    this._catalogTab = 'prompts';
  }

  _openNewEditor() {
    this._editorTriggerSelector = this._captureTriggerSelector();
    this._clearForm();
    this._catalogTab = 'prompts';
    this._isEditorOpen = true;
  }

  _openNewSkillEditor() {
    this._editorTriggerSelector = this._captureTriggerSelector();
    this._clearForm();
    if (this._catalogTab !== 'agents') this._catalogTab = 'skills';
    this._isEditorOpen = true;
  }

  _openNewMcpEditor() {
    this._editorTriggerSelector = this._captureTriggerSelector();
    this._clearMcpForm();
    this._editingMcpKey = null;
    this._catalogTab = 'mcps';
    this._isEditorOpen = true;
  }

  _customAgentMcpServers(agent) {
    if (Array.isArray(agent?.mcpServers)) return agent.mcpServers;
    if (Array.isArray(agent?.preset?.mcpServers)) return agent.preset.mcpServers;
    return [];
  }

  _agentToolIds(agent, isBuiltin = false) {
    const ids = new Set(BUILTIN_TOOL_IDS);
    const mcpServers = isBuiltin ? (agent?.mcpServers || []) : this._customAgentMcpServers(agent);
    const servers = this._mcpTools?.servers || [];
    servers.forEach((server) => {
      if (!mcpServers.includes(server.id) || !server.tools) return;
      server.tools.forEach((tool) => ids.add(`mcp__${server.id}__${tool.name}`));
    });
    return [...ids];
  }

  // ─── skill CRUD ───────────────────────────────────────────────────────────

  async _onSaveSkill(status = STATUS.APPROVED) {
    const id = this._formSkillId.trim();
    let body = this._formSkillBody;
    if (!id) {
      this._setStatus('Skill ID is required', STATUS_TYPE.ERR);
      return;
    }
    if (!body.trim()) {
      this._setStatus('Skill body is required', STATUS_TYPE.ERR);
      return;
    }

    // Duplicate ID guard — only applies when creating a new skill, not editing.
    if (!this._isFormEdit && this._skills && id in this._skills) {
      this._setStatus(`A skill with ID "${id}" already exists. Edit it from the list.`, STATUS_TYPE.ERR);
      return;
    }

    // Frontmatter injection — if the body has no YAML front matter, add a
    // minimal one so the agent and other consumers always have a title/description.
    const hasFrontmatter = body.trimStart().startsWith('---');
    if (!hasFrontmatter) {
      const titleFromId = id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const injected = `---\ntitle: ${titleFromId}\ndescription: \nstatus: ${status}\n---\n\n${body.trimStart()}`;
      body = injected;
      this._formSkillBody = body;
      this._setStatus(
        'Frontmatter added — expand title and description to help the agent discover this skill.',
        'warn',
      );
    }

    this._isSaveBusy = true;
    this._statusMsg = '';

    // Write the .md file first — if it fails we don't touch the config sheet.
    const fileResult = await writeSkillMdFile(this._org, this._site, id, body);
    if (!fileResult.ok) {
      this._setStatus('Failed to write skill file', STATUS_TYPE.ERR);
      this._isSaveBusy = false;
      return;
    }

    const configResult = await upsertSkillInConfig(this._org, this._site, id, body, { status });
    if (!configResult.ok) {
      // Rollback: the .md file was written but config failed — delete the orphan
      // for new skills. Edits are safe to leave (file overwrote an existing body).
      if (!this._isFormEdit) {
        deleteSkillMdFile(this._org, this._site, id).catch(() => {});
      }
      this._setStatus(configResult.error || 'Failed to save skill config', STATUS_TYPE.ERR);
      this._isSaveBusy = false;
      return;
    }

    this._setStatus(status === STATUS.DRAFT ? 'Saved as draft' : 'Saved');
    if (hasFrontmatter === false) {
      this._setStatus(
        'Saved — frontmatter was added. Expand title and description to help the agent discover this skill.',
        'warn',
      );
    }
    this._clearDirty();
    this._isSaveBusy = false;
    this._hasSuggestion = false;
    clearSuggestionSession();
    await this._reload();

    if (this._isFormEdit) {
      this._formSkillBody = body;
    } else {
      this._clearForm();
    }
  }

  async _onDeleteSkill() {
    const id = this._formSkillId.trim();
    if (!id) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete skill "${id}"? This cannot be undone.`)) return;
    this._isSaveBusy = true;

    // Read existing content before deleting, so we can rollback if needed.
    const { text: rollbackBody } = await readSkillMdFile(this._org, this._site, id);

    const fileResult = await deleteSkillMdFile(this._org, this._site, id);
    if (!fileResult.ok) {
      this._setStatus('Failed to delete skill file', STATUS_TYPE.ERR);
      this._isSaveBusy = false;
      return;
    }

    const configResult = await deleteSkillFromConfig(this._org, this._site, id);
    this._isSaveBusy = false;

    if (!configResult.ok) {
      // Rollback: re-create the .md file we just deleted
      if (rollbackBody) {
        writeSkillMdFile(this._org, this._site, id, rollbackBody).catch(() => {});
      }
      this._setStatus(configResult.error || 'Failed to delete skill from config', STATUS_TYPE.ERR);
      return;
    }

    this._closeEditor();
    await this._reload();
  }

  async _onDeleteSkillById(id) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete skill "${id}"? This cannot be undone.`)) return;
    this._isSaveBusy = true;

    const { text: rollbackBody } = await readSkillMdFile(this._org, this._site, id);

    const fileResult = await deleteSkillMdFile(this._org, this._site, id);
    if (!fileResult.ok) {
      this._setStatus('Failed to delete skill file', STATUS_TYPE.ERR);
      this._isSaveBusy = false;
      return;
    }

    const configResult = await deleteSkillFromConfig(this._org, this._site, id);
    this._isSaveBusy = false;

    if (!configResult.ok) {
      if (rollbackBody) {
        writeSkillMdFile(this._org, this._site, id, rollbackBody).catch(() => {});
      }
      this._setStatus(configResult.error || 'Failed to delete skill', STATUS_TYPE.ERR);
      return;
    }
    if (this._formSkillId === id) this._closeEditor();
    await this._reload();
  }

  _openSkillMenu(e, id) {
    const article = this.shadowRoot.querySelector(`[data-skill-id="${id}"]`);
    article?.querySelector('nx-popover')?.show({ anchor: e.currentTarget });
  }

  _closeSkillMenu(id) {
    const article = this.shadowRoot.querySelector(`[data-skill-id="${id}"]`);
    article?.querySelector('nx-popover')?.close();
  }

  _openMcpMenu(e, key) {
    const article = this.shadowRoot.querySelector(`[data-mcp-key="${key}"]`);
    article?.querySelector('nx-popover')?.show({ anchor: e.currentTarget });
  }

  _closeMcpMenu(key) {
    const article = this.shadowRoot.querySelector(`[data-mcp-key="${key}"]`);
    article?.querySelector('nx-popover')?.close();
  }

  async _onEditSkill(skillId) {
    this._editorTriggerSelector = this._captureTriggerSelector();
    const tab = this._catalogTab !== 'agents' ? 'skills' : 'agents';
    this._catalogTab = tab;

    // If this skill already has dirty edits, restore them instead of fetching fresh.
    const saved = this._dirtyForms[tab];
    if (saved?.formSkillId === skillId) {
      this._restoreForm(saved);
      this._isFormDirty = true;
      return;
    }

    this._formSkillId = skillId;
    this._formSkillBody = this._skills[skillId] || '';
    this._isFormEdit = true;
    this._statusMsg = '';
    this._activeToolRefs = null;
    this._isEditorOpen = true;
    this._isFormDirty = false;
    delete this._dirtyForms[tab];

    // Capture the context at the time of the request to guard against stale responses.
    const requestedId = skillId;
    const requestedTab = tab;
    const { text } = await readSkillMdFile(this._org, this._site, skillId);
    // Discard the response if the user navigated away before it resolved.
    if (text && !this._isFormDirty
      && this._formSkillId === requestedId
      && this._catalogTab === requestedTab) {
      this._formSkillBody = text;
    }
  }

  _onSelectAgent(agent) {
    this._formPromptTools = this._agentToolIds(agent, agent?.id === BUILTIN_AGENTS[0]?.id);
    this._isAgentViewTools = true;
    this._catalogTab = 'agents';
    this._isEditorOpen = true;
  }

  _openNewAgentEditor() {
    this._editorTriggerSelector = this._captureTriggerSelector();
    this._clearForm();
    this._isAgentViewTools = false;
    this._catalogTab = 'agents';
    this._isEditorOpen = true;
  }

  _onSelectMcp(row) {
    this._ensureMcpToolsLoaded();
    const serverId = String(row?.key || '').trim();
    if (!serverId || !this._mcpTools?.servers) return;
    const server = this._mcpTools.servers.find((s) => s.id === serverId);
    const refs = (server?.tools || []).map((t) => `mcp__${serverId}__${t.name}`);
    this._setActiveToolRefs(refs);
  }

  // ─── prompt CRUD ──────────────────────────────────────────────────────────

  async _onSavePrompt(status = STATUS.APPROVED) {
    const title = this._formPromptTitle.trim();
    const prompt = this._formPromptBody.trim();
    if (!title || !prompt) {
      this._setStatus('Title and prompt are required', STATUS_TYPE.ERR);
      return;
    }

    this._isSaveBusy = true;
    const result = await upsertPromptInConfig(
      this._org,
      this._site,
      {
        title,
        prompt,
        category: this._formPromptCategory,
        icon: this._formPromptIcon,
      },
      {
        status,
        originalTitle: this._formPromptOriginalTitle || undefined,
      },
    );

    if (!result.ok) {
      this._setStatus(result.error || 'Failed to save prompt', STATUS_TYPE.ERR);
    } else {
      this._setStatus('Prompt saved');
      this._clearDirty();
      if (!this._isFormPromptEdit) {
        this._formPromptTitle = '';
        this._formPromptCategory = '';
        this._formPromptBody = '';
        this._formPromptIcon = '';
        this._formPromptOriginalTitle = '';
        this._formPromptTools = [];
      } else {
        this._formPromptOriginalTitle = title;
      }
    }
    this._isSaveBusy = false;
    await this._reload();
  }

  async _onDeletePrompt() {
    const title = this._formPromptTitle.trim();
    if (!title) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete prompt "${title}"? This cannot be undone.`)) return;
    this._isSaveBusy = true;

    const result = await deletePromptFromConfig(this._org, this._site, title);

    this._isSaveBusy = false;

    if (!result.ok) {
      this._setStatus(result.error || 'Failed to delete prompt', STATUS_TYPE.ERR);
      return;
    }

    this._closeEditor();
    await this._reload();
  }

  async _duplicatePrompt(row) {
    const title = `${row.title || 'Untitled'} (copy)`;
    const result = await upsertPromptInConfig(
      this._org,
      this._site,
      { title, prompt: row.prompt || '', category: row.category || '' },
      { status: STATUS.APPROVED },
    );
    if (!result.ok) {
      this._setStatus(result.error || 'Failed to duplicate prompt', STATUS_TYPE.ERR);
    }
    await this._reload();
  }

  async _deletePromptDirect(row) {
    const title = row.title || '';
    if (!title) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete prompt "${title}"? This cannot be undone.`)) return;
    const result = await deletePromptFromConfig(this._org, this._site, title);
    if (!result.ok) {
      this._setStatus(result.error || 'Failed to delete prompt', STATUS_TYPE.ERR);
      return;
    }
    if (this._isFormPromptEdit && this._formPromptTitle === title) this._closeEditor();
    await this._reload();
  }

  _onRunPrompt() {
    const prompt = this._formPromptBody.trim();
    if (!prompt) return;
    this._dispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_SEND, prompt);
    this._dispatchPromptToChat(DA_SKILLS_LAB_PROMPT_SEND, prompt);
    this._setStatus('Sent to chat');
  }

  // ─── MCP register ─────────────────────────────────────────────────────────

  async _onRegisterMcp() {
    this._isSaveBusy = true;
    const isUpdate = Boolean(this._editingMcpKey);
    const result = await registerMcpServer(
      this._org,
      this._site,
      this._mcpKey,
      this._mcpUrl,
      this._mcpDescription,
      this._mcpAuthHeaderName,
      this._mcpAuthHeaderValue,
    );
    if (!result.ok) this._setStatus(result.error || 'Failed', STATUS_TYPE.ERR);
    else {
      this._mcpKey = '';
      this._mcpUrl = '';
      this._mcpDescription = '';
      this._mcpAuthHeaderName = 'x-api-key';
      this._mcpAuthHeaderValue = '';
      this._editingMcpKey = null;
      this._clearDirty();
      this._setStatus(isUpdate ? 'MCP server updated' : 'MCP server registered');
    }
    this._isSaveBusy = false;
    await this._reload();
  }

  async _onDeleteMcpDirect(row) {
    const key = String(row?.key || '').trim();
    if (!key) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Remove MCP server "${key}"? This cannot be undone.`)) return;
    this._isSaveBusy = true;
    const result = await deleteMcpServer(this._org, this._site, key);
    this._isSaveBusy = false;
    if (!result.ok) {
      this._setStatus(result.error || 'Failed to remove MCP server', STATUS_TYPE.ERR);
      return;
    }
    if (this._editingMcpKey === key) this._closeEditor();
    await this._reload();
  }

  _clearMcpForm() {
    this._mcpKey = '';
    this._mcpUrl = '';
    this._mcpDescription = '';
    this._mcpAuthHeaderName = 'x-api-key';
    this._mcpAuthHeaderValue = '';
    this._editingMcpKey = null;
    this._viewingMcpServerId = null;
  }

  _onEditMcp(row) {
    this._editorTriggerSelector = this._captureTriggerSelector();
    // If this MCP already has dirty edits, restore them.
    const saved = this._dirtyForms.mcps;
    if (saved?.editingMcpKey === row.key) {
      this._catalogTab = 'mcps';
      this._restoreForm(saved);
      this._isFormDirty = true;
      return;
    }

    this._editingMcpKey = row.key;
    this._viewingMcpServerId = row.key;
    this._mcpKey = row.key;
    this._mcpUrl = row.url || row.value || '';
    this._mcpDescription = row.description || '';
    this._mcpAuthHeaderName = row.authHeaderName || 'x-api-key';
    this._mcpAuthHeaderValue = row.authHeaderValue || '';
    this._catalogTab = 'mcps';
    this._isEditorOpen = true;
    this._isFormDirty = false;
    delete this._dirtyForms.mcps;
  }

  async _onToggleMcpEnabled(row) {
    if (!row?.key || skillRowStatus(row) !== STATUS.APPROVED) return;
    const key = String(row.key);
    const token = `mcp:${key}`;
    const nextEnabled = !skillRowEnabled(row);
    this._mcpEnableBusy = { ...this._mcpEnableBusy, [token]: true };
    const res = await setMcpServerEnabled(this._org, this._site, key, nextEnabled);
    this._mcpEnableBusy = { ...this._mcpEnableBusy, [token]: false };
    if (!res.ok) {
      this._setStatus(res.error || 'Could not update MCP state', STATUS_TYPE.ERR);
      return;
    }
    await this._reload();
  }

  _onViewMcpTools(serverId) {
    this._ensureMcpToolsLoaded();
    this._editorTriggerSelector = this._captureTriggerSelector();
    this._clearMcpForm();
    this._viewingMcpServerId = serverId;
    this._toolsSearch = '';
    this._catalogTab = 'mcps';
    this._isEditorOpen = true;
  }

  _isEventFromNestedInteractiveControl(e) {
    const currentTarget = e?.currentTarget;
    const target = e?.target;
    if (!(currentTarget instanceof Element) || !(target instanceof Element)) return false;
    const INTERACTIVE_SELECTOR = [
      'button',
      '[role="button"]',
      '[role="menuitem"]',
      'input',
      'select',
      'textarea',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    const nestedInteractive = target.closest(INTERACTIVE_SELECTOR);
    return Boolean(nestedInteractive && nestedInteractive !== currentTarget);
  }

  _onCardClick(e, onActivate) {
    if (this._isEventFromNestedInteractiveControl(e)) return;
    onActivate();
  }

  _onCardKeydown(e, onActivate) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (this._isEventFromNestedInteractiveControl(e)) return;
    e.preventDefault();
    onActivate();
  }

  _onMcpCardClick(e, onActivate) {
    this._onCardClick(e, onActivate);
  }

  _onMcpCardKeydown(e, onActivate) {
    this._onCardKeydown(e, onActivate);
  }

  async _onToggleToolEnabled(serverId, toolName, enabled, onRollback) {
    const key = `${serverId}/${toolName}`;
    const previous = this._toolOverrides[key];
    this._toolOverrides = { ...this._toolOverrides, [key]: enabled };
    try {
      if (enabled) {
        await deleteToolOverride(this._org, this._site, serverId, toolName);
        this._setStatus(`Tool enabled: ${toolName}`);
      } else {
        await setToolOverride(this._org, this._site, serverId, toolName, false);
        this._setStatus(`Tool disabled — ${toolName} won't be available until re-enabled.`, STATUS_TYPE.WARN);
      }
    } catch {
      // Persist failed — roll back the optimistic update so the UI stays truthful.
      const rolled = { ...this._toolOverrides };
      if (previous === undefined) delete rolled[key];
      else rolled[key] = previous;
      this._toolOverrides = rolled;
      onRollback?.();
      this._setStatus(`Failed to ${enabled ? 'enable' : 'disable'} ${toolName}`, STATUS_TYPE.ERR);
    }
  }

  /**
   * Parse a display tool ID (e.g. "mcp__browser__search" or "da_get_source")
   * into the {serverId, toolName} pair used by the tool-overrides sheet.
   */
  _parseToolId(toolId) {
    if (toolId.startsWith('mcp__')) {
      const [, serverId, ...rest] = toolId.split('__');
      return { serverId, toolName: rest.join('__') };
    }
    return { serverId: 'da', toolName: toolId };
  }

  // ─── prompt → chat dispatch ───────────────────────────────────────────────

  _dispatchPromptToChat(eventName, prompt) {
    window.dispatchEvent(new CustomEvent(eventName, {
      detail: { prompt: String(prompt || '') },
    }));
  }

  async _onSaveAgent() {
    const id = this._newAgentId.trim().replace(/\.json$/i, '');
    const name = this._newAgentName.trim() || id;
    if (!id) {
      this._setStatus('Agent id required', STATUS_TYPE.ERR);
      return;
    }
    this._isSaveBusy = true;
    const preset = {
      name,
      description: '',
      systemPrompt: '',
      skills: [],
      mcpServers: [],
    };
    const result = await saveAgentPresetFile(this._org, this._site, id, preset);
    this._isSaveBusy = false;
    if (!result.ok) {
      this._setStatus(result.error || 'Failed to save agent file', STATUS_TYPE.ERR);
      return;
    }
    this._newAgentId = '';
    this._newAgentName = '';
    this._clearDirty();
    this._setStatus('Agent file saved');
    await this._reload();
  }

  // ─── tool references ──────────────────────────────────────────────────────

  get _toolRefs() {
    if (this._activeToolRefs !== null) return this._activeToolRefs;
    return extractToolRefs(this._formSkillBody);
  }

  _setActiveToolRefs(refs) {
    this._activeToolRefs = refs;
  }

  async _loadMemory() {
    const got = await fetchSiteSourceText(this._org, this._site, '.da/agent/memory.md');
    // null signals a fetch error; '' signals a successful fetch of an empty/non-existent file
    this._memory = got.error ? null : (got.text || '');
  }

  _onGateSubmit(e) {
    e.preventDefault();
    const org = this._gateOrg.trim();
    const site = this._gateSite.trim();
    if (!org || !site) return;
    window.location.hash = `#/${org}/${site}`;
  }

  // ─── render: top level ────────────────────────────────────────────────────

  render() {
    if (!this._org || !this._site) {
      return html`
        <div class="gate">
          <div class="gate-card">
            <h2 class="gate-heading">Skills Editor</h2>
            <p class="gate-desc">Enter your organization and site (same as in browse or canvas). You will manage skills, agents, prompts, and MCP servers for that repository.</p>
            <form class="form gate-form" @submit=${this._onGateSubmit}>
              <label class="gate-label">
                <span>Organization</span>
                <input
                  type="text"
                  placeholder="e.g. adobecom"
                  autocomplete="organization"
                  .value=${this._gateOrg}
                  @input=${(e) => { this._gateOrg = e.target.value; }}
                />
              </label>
              <label class="gate-label">
                <span>Site</span>
                <input
                  type="text"
                  placeholder="e.g. bacom"
                  .value=${this._gateSite}
                  @input=${(e) => { this._gateSite = e.target.value; }}
                />
              </label>
              <div class="editor-actions gate-actions">
                <button
                  type="submit"
                  data-variant="accent"
                  ?disabled=${!this._gateOrg.trim() || !this._gateSite.trim()}
                >Continue</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }
    if (this._isLoading) {
      return html`<div class="loading" aria-live="polite">Loading capabilities\u2026</div>`;
    }
    const rootCls = [
      'root',
      this._isEditorOpen ? 'is-drawer-open' : '',
      this._isChatOpen ? 'is-chat-open' : '',
    ].filter(Boolean).join(' ');

    return html`<div class="${rootCls}" role="region" aria-label="Skills Editor">
      ${this._isRefreshing ? html`
        <div class="refresh-indicator" role="status" aria-live="polite">
          <span class="refresh-indicator-label">Auto-refreshing capabilities…</span>
          <span class="refresh-indicator-track"><span class="refresh-indicator-bar"></span></span>
        </div>
      ` : nothing}
      ${this._renderChatDrawer()}
      ${this._renderListCol()}
      ${this._renderEditorPanel()}
    </div>`;
  }

  // ─── render: list column ──────────────────────────────────────────────────

  _renderListCol() {
    const tab = this._catalogTab;
    const showSearch = ['skills', 'prompts', 'mcps'].includes(tab);

    return html`
      <div class="col col-list" role="region" aria-label="Catalog">
        <div class="list-header">
          <nx-tabs
            .items=${CATALOG_TABS}
            .active=${tab}
            @tab-change=${(e) => this._onTabChange(e.detail.id)}
          ></nx-tabs>
          <div class="list-actions-row">
            ${TAB_ACTIONS[tab] ? html`
              <button type="button" class="new-btn"
                @click=${() => this[TAB_ACTIONS[tab].opener]()}
              >${TAB_ACTIONS[tab].btnLabel}</button>
            ` : nothing}
            <button type="button"
              class="chat-toggle-btn ${this._isChatOpen ? 'is-active' : ''}"
              aria-label="${this._isChatOpen ? 'Close chat' : 'Open chat'}"
              aria-pressed="${this._isChatOpen}"
              @click=${() => this._toggleChat()}
            >${this._isChatOpen ? 'Close Chat' : 'Chat'}</button>
          </div>
        </div>
        ${showSearch ? html`
          <div class="list-search">
            <input
              type="search"
              placeholder="Search\u2026"
              aria-label="Search list"
              .value=${this._promptSearch}
              @input=${(e) => { this._promptSearch = e.target.value; }}
            >
          </div>
        ` : nothing}
        <div class="catalog-scroll">
          ${tab === 'skills' ? this._renderSkillsCatalog() : nothing}
          ${tab === 'agents' ? this._renderAgentsCatalog() : nothing}
          ${tab === 'prompts' ? this._renderPromptsCatalog() : nothing}
          ${tab === 'mcps' ? this._renderMcpsCatalog() : nothing}
          ${tab === 'memory' ? html`<div class="empty">Memory is shown in the panel \u2192</div>` : nothing}
        </div>
      </div>
    `;
  }

  /** Derive the editor drawer title from the current tab and form state. */
  _editorTitle(tab) {
    if (tab === 'agents' && this._isAgentViewTools) return 'Associated Tools';
    if (tab === 'agents') return this._isFormEdit ? 'Edit Agent' : 'New Agent';
    if (tab === 'skills') return this._isFormEdit ? 'Edit Skill' : 'New Skill';
    if (tab === 'prompts') return this._isFormPromptEdit ? 'Edit Prompt' : 'New Prompt';
    if (tab === 'mcps') {
      if (this._viewingMcpServerId && !this._editingMcpKey) return this._viewingMcpServerId;
      if (this._editingMcpKey) return `Edit: ${this._editingMcpKey}`;
      return 'Register MCP Server';
    }
    if (tab === 'memory') return 'Project Memory';
    return '';
  }

  // ─── render: editor panel ─────────────────────────────────────────────────

  _renderEditorPanel() {
    const tab = this._catalogTab;
    const isSkill = tab === 'skills';
    const isPrompt = tab === 'prompts';
    const isMcp = tab === 'mcps';
    const isAgent = tab === 'agents';
    const isMemory = tab === 'memory';

    const title = this._editorTitle(tab);

    return html`
      <div class="col-editor" aria-hidden=${this._isEditorOpen ? 'false' : 'true'}
        ?inert=${!this._isEditorOpen}>
        <div class="col-editor-inner">
          ${this._isEditorOpen ? html`
            <div class="editor-header">
              <h3 class="editor-title">${title}</h3>
              <button type="button" class="btn-icon close-btn" aria-label="Close"
                @click=${() => this._closeEditor()}
              >\u2715</button>
            </div>
            ${this._isFormDirty ? html`
              <div class="dirty-notice" role="status">Unsaved edits &middot; save to persist</div>
            ` : nothing}
            <div class="editor-body ${isMemory ? 'editor-body-memory' : ''}">
              ${isSkill ? this._renderSkillForm() : nothing}
              ${isAgent && this._isAgentViewTools ? this._renderAssociatedToolsSelector() : nothing}
              ${isAgent && !this._isAgentViewTools ? this._renderAgentForm() : nothing}
              ${isPrompt ? this._renderPromptForm() : nothing}
              ${isMcp && (this._editingMcpKey || !this._viewingMcpServerId)
                ? this._renderMcpForm() : nothing}
              ${isMcp && this._viewingMcpServerId && !this._editingMcpKey
                ? this._renderMcpServerInfo() : nothing}
              ${isMcp && (this._viewingMcpServerId || this._editingMcpKey)
                ? this._renderMcpToolsList() : nothing}
              ${isMemory ? html`
                <p class="form-hint">.da/agent/memory.md</p>
                ${this._renderMemoryContent()}
              ` : nothing}
            </div>
            ${(isSkill || (isAgent && !this._isAgentViewTools) || isPrompt
              || (isMcp && (!this._viewingMcpServerId || this._editingMcpKey))) ? html`
              <div class="editor-footer">
                ${this._renderEditorFooter(isSkill, isPrompt, isMcp, isAgent)}
              </div>
            ` : nothing}
          ` : nothing}
        </div>
      </div>
    `;
  }

  // ─── render: chat drawer ──────────────────────────────────────────────────

  _renderChatDrawer() {
    return html`
      <div class="chat-drawer" aria-hidden=${this._isChatOpen ? 'false' : 'true'}
        ?inert=${!this._isChatOpen}>
        ${this._isChatOpen ? html`
          <div class="chat-drawer-header">
            <span class="chat-drawer-title">Chat</span>
            <button type="button" class="btn-icon close-btn" aria-label="Close chat"
              @click=${() => this._toggleChat()}
            >\u2715</button>
          </div>
          <div class="chat-drawer-body"
            @nx-panel-close=${(e) => { e.stopPropagation(); this._toggleChat(); }}>
            <nx-chat></nx-chat>
          </div>
        ` : nothing}
      </div>
    `;
  }

  // ─── render: skill form ───────────────────────────────────────────────────

  _renderSkillForm() {
    return html`
      <form class="form" @submit=${(e) => e.preventDefault()}>
        <input
          type="text"
          placeholder="skill-id"
          aria-label="Skill ID"
          .value=${this._formSkillId}
          ?readonly=${this._isFormEdit}
          @input=${(e) => { this._formSkillId = e.target.value; this._markDirty(); }}
        >
        <div class="textarea-wrap ${this._hasSuggestion ? 'is-suggestion' : ''}">
          <textarea
            placeholder="Write or revise skill markdown"
            aria-label="Skill markdown"
            .value=${this._formSkillBody}
            @input=${(e) => { this._formSkillBody = e.target.value; this._markDirty(); }}
          ></textarea>
        </div>
      </form>
    `;
  }

  _renderAgentForm() {
    return html`
      <form class="form" @submit=${(e) => e.preventDefault()}>
        <p class="form-hint">Creates <code>/.da/agents/&lt;id&gt;.json</code></p>
        <input
          type="text"
          placeholder="agent-id"
          aria-label="Agent ID"
          .value=${this._newAgentId}
          @input=${(e) => { this._newAgentId = e.target.value; this._markDirty(); }}
        >
        <input
          type="text"
          placeholder="Display name"
          aria-label="Agent display name"
          .value=${this._newAgentName}
          @input=${(e) => { this._newAgentName = e.target.value; this._markDirty(); }}
        >
      </form>
    `;
  }

  // ─── render: prompt form ──────────────────────────────────────────────────

  _renderPromptForm() {
    return html`
      <form class="form" @submit=${(e) => e.preventDefault()}>
        <input type="text" placeholder="Title" aria-label="Prompt title"
          .value=${this._formPromptTitle}
          @input=${(e) => { this._formPromptTitle = e.target.value; this._markDirty(); }}
        >
        <input type="text" placeholder="Category (e.g. Review, Workflow\u2026)" aria-label="Prompt category"
          list="category-list"
          .value=${this._formPromptCategory}
          @input=${(e) => { this._formPromptCategory = e.target.value; this._markDirty(); }}
        >
        <input type="url" placeholder="Icon URL" aria-label="Prompt icon URL"
          .value=${this._formPromptIcon}
          @input=${(e) => { this._formPromptIcon = e.target.value; this._markDirty(); }}
        >
        <datalist id="category-list">
          ${CATEGORY_OPTIONS.map((c) => html`<option value=${c}></option>`)}
        </datalist>
        <div class="textarea-wrap">
          <textarea
            placeholder="Write your prompt\u2026"
            aria-label="Prompt body"
            .value=${this._formPromptBody}
            @input=${(e) => { this._formPromptBody = e.target.value; this._markDirty(); }}
          ></textarea>
        </div>
      </form>
    `;
  }

  // ─── render: associated tools selector ───────────────────────────────────

  _renderAssociatedToolsSelector() {
    const builtIn = BUILTIN_TOOL_IDS;
    const mcpToolIds = [];
    if (this._mcpTools?.servers) {
      this._mcpTools.servers.forEach((server) => {
        (server.tools || []).forEach((tool) => {
          mcpToolIds.push(`mcp__${server.id}__${tool.name}`);
        });
      });
    }

    const toolFilter = (this._toolsSearch || '').trim().toLowerCase();
    const filterById = (id) => id.toLowerCase().includes(toolFilter);
    const daTools = toolFilter ? builtIn.filter(filterById) : builtIn;
    const mcpTools = toolFilter ? mcpToolIds.filter(filterById) : mcpToolIds;
    const selected = new Set(this._formPromptTools || []);
    const collapsed = this._toolsGroupCollapsed || {};

    const renderGroup = (ns, tools) => {
      if (!tools.length && !toolFilter) return nothing;
      const isOpen = !collapsed[ns];
      return html`
        <details class="tools-group" ?open=${isOpen}
          @toggle=${(e) => {
            this._toolsGroupCollapsed = { ...this._toolsGroupCollapsed, [ns]: !e.target.open };
          }}
        >
          <summary class="tools-group-summary">
            <span class="tools-group-label">${ns}</span>
            <span class="tools-count">${tools.length}</span>
          </summary>
          <ul class="tools-group-list" aria-label="${ns} tools">
            ${!tools.length ? html`<li class="tool-item-empty">No tools match filter</li>` : nothing}
            ${tools.map((toolId) => {
              const isActive = selected.has(toolId);
              return html`
                <li class="tool-item ${isActive ? 'is-active' : ''}">
                  <span class="tool-dot ${isActive ? 'is-dot-active' : 'is-dot-inactive'}" aria-hidden="true"></span>
                  <label class="tool-label-wrap" title=${toolId}>
                    <input type="checkbox" class="tool-checkbox"
                      .checked=${isActive}
                      @change=${(e) => {
                        const prevTools = this._formPromptTools ? [...this._formPromptTools] : [];
                        const next = new Set(prevTools);
                        if (e.target.checked) next.add(toolId);
                        else next.delete(toolId);
                        this._formPromptTools = [...next];
                        const { serverId, toolName } = this._parseToolId(toolId);
                        this._onToggleToolEnabled(serverId, toolName, e.target.checked, () => {
                          this._formPromptTools = prevTools;
                        });
                      }}
                    >
                    <span class="tool-label">${toolId}</span>
                  </label>
                </li>
              `;
            })}
          </ul>
        </details>
      `;
    };

    return html`
      <div class="tools-selector">
        <h4 class="tools-selector-heading">Associated Tools</h4>
        <input
          type="search"
          class="tools-search-input"
          placeholder="Filter tools\u2026"
          aria-label="Filter tools"
          .value=${this._toolsSearch}
          @input=${(e) => { this._toolsSearch = e.target.value; }}
        >
        ${renderGroup('DA', daTools)}
        ${mcpTools.length || toolFilter ? renderGroup('MCP', mcpTools) : nothing}
      </div>
    `;
  }

  // ─── render: MCP form ─────────────────────────────────────────────────────

  _renderMcpForm() {
    const hasSecret = Boolean(String(this._mcpAuthHeaderValue || '').trim());
    return html`
      <form class="form" @submit=${(e) => e.preventDefault()}>
        <input type="text" placeholder="server-id (not API key)" aria-label="MCP server id"
          .value=${this._mcpKey}
          ?readonly=${Boolean(this._editingMcpKey)}
          @input=${(e) => { this._mcpKey = e.target.value; this._markDirty(); }}
        >
        <p class="form-hint">Identifier only. Do not paste secrets or API keys here.</p>
        <input type="text" placeholder="SSE endpoint URL" aria-label="MCP server URL"
          .value=${this._mcpUrl}
          @input=${(e) => { this._mcpUrl = e.target.value; this._markDirty(); }}
        >
        <textarea
          class="textarea-sm"
          placeholder="Description \u2014 what this server does (optional)"
          aria-label="MCP server description"
          .value=${this._mcpDescription}
          @input=${(e) => { this._mcpDescription = e.target.value; this._markDirty(); }}
        ></textarea>
        <div class="mcp-auth-section ${hasSecret ? 'is-sensitive' : ''}">
          <p class="form-hint">Authentication header (optional, for private MCP servers)</p>
          <input
            type="text"
            placeholder="Header name (e.g. Authorization, x-api-key)"
            aria-label="MCP auth header name"
            .value=${this._mcpAuthHeaderName}
            @input=${(e) => { this._mcpAuthHeaderName = e.target.value; this._markDirty(); }}
          >
          <input
            type="password"
            autocomplete="new-password"
            placeholder="Header value"
            aria-label="MCP auth header value"
            .value=${this._mcpAuthHeaderValue}
            @input=${(e) => { this._mcpAuthHeaderValue = e.target.value; this._markDirty(); }}
          >
          ${hasSecret ? html`
            <p class="mcp-auth-warning" role="note">
              ⚠ Saving this key makes it available to all authors with configuration permission.
            </p>
          ` : nothing}
        </div>
      </form>
    `;
  }

  // ─── render: MCP server info (read-only, built-in) ────────────────────────

  _renderMcpServerInfo() {
    const serverId = this._viewingMcpServerId;
    const builtin = BUILTIN_MCP_SERVERS.find((s) => s.id === serverId);
    if (!builtin) return nothing;
    return html`
      <div class="mcp-server-info">
        <p class="mcp-server-desc">${builtin.description}</p>
        <span class="badge">built-in</span>
      </div>
    `;
  }

  // ─── render: MCP tools list ──────────────────────────────────────────────

  _mcpServerToolData(serverId) {
    const builtinList = BUILTIN_TOOL_DETAILS[serverId];
    if (builtinList) return { tools: builtinList, error: null, source: 'builtin' };

    if (!this._mcpTools) return { tools: [], error: null, source: 'pending' };

    const server = (this._mcpTools.servers || []).find((s) => s.id === serverId);
    if (!server) {
      const isConfigured = Boolean(this._configuredMcpServers?.[serverId]);
      if (!isConfigured) return { tools: [], error: 'Server is disabled or has no URL', source: 'unconfigured' };
      return { tools: [], error: null, source: 'pending' };
    }

    if (server.error) return { tools: [], error: server.error, source: 'error' };
    const tools = (server.tools || []).map((t) => ({
      name: t.name,
      description: t.description || '',
    }));
    return { tools, error: null, source: 'live' };
  }

  _renderMcpToolsList() {
    const serverId = this._viewingMcpServerId || this._editingMcpKey;
    if (!serverId) return nothing;

    const { tools, error, source } = this._mcpServerToolData(serverId);

    const overrides = this._toolOverrides || {};
    const filterQ = (this._toolsSearch || '').trim().toLowerCase();
    const filtered = filterQ
      ? tools.filter((t) => t.name.toLowerCase().includes(filterQ)
        || t.description.toLowerCase().includes(filterQ))
      : tools;

    const emptyMsg = () => {
      if (source === 'pending') return 'Connecting to agent to discover tools\u2026';
      if (source === 'unconfigured') return 'Enable this server to discover its tools';
      if (source === 'error') {
        const urlMatch = error?.match(/https?:\/\/\S+/);
        const hint = urlMatch?.[0];
        const base = error?.split('\n')[0] ?? error;
        return html`
          Could not list tools: ${base}
          ${hint ? html`
            <br>
            <span class="mcp-error-hint">Did you mean:
              <a class="mcp-error-url" href="#"
                @click=${(e) => {
                  e.preventDefault();
                  this._mcpUrl = hint;
                  this._setStatus(`URL updated to ${hint} — save to apply`, STATUS_TYPE.WARN);
                }}
              >${hint}</a>?
            </span>
          ` : nothing}
        `;
      }
      return 'Server reported 0 tools';
    };

    return html`
      <div class="mcp-tools-section">
        <h4 class="tools-selector-heading">Tools (${tools.length})</h4>
        ${tools.length > 6 ? html`
          <input type="search" class="tools-search-input"
            placeholder="Filter tools\u2026" aria-label="Filter tools"
            .value=${this._toolsSearch}
            @input=${(e) => { this._toolsSearch = e.target.value; }}
          >
        ` : nothing}
        ${!tools.length
          ? html`<div class="empty ${source === 'error' ? 'empty-err' : ''}">${emptyMsg()}</div>`
          : html`
            <ul class="tools-group-list" aria-label="Tools for ${serverId}">
              ${filtered.map((t) => {
                const key = `${serverId}/${t.name}`;
                const isEnabled = overrides[key] !== false;
                return html`
                  <li class="tool-item ${isEnabled ? 'is-active' : ''}">
                    <label class="tool-label-wrap" title=${t.name}>
                      <input type="checkbox" class="tool-checkbox"
                        .checked=${isEnabled}
                        @change=${(e) => this._onToggleToolEnabled(serverId, t.name, e.target.checked)}
                      >
                      <div class="tool-text">
                        <span class="tool-label">${t.name}</span>
                        ${t.description ? html`
                          <span class="tool-desc">${t.description}</span>
                        ` : nothing}
                      </div>
                    </label>
                  </li>
                `;
              })}
              ${filtered.length === 0 && tools.length
                ? html`<li class="tool-item-empty">No tools match filter</li>` : nothing}
            </ul>
          `}
      </div>
    `;
  }

  // ─── render: editor footer (sticky actions) ───────────────────────────────

  _renderEditorFooter(isSkill, isPrompt, isMcp, isAgent) {
    const statusTpl = this._statusMsg ? html`
      <output class="msg ${this._msgClass()}">
        ${this._statusMsg}
      </output>
    ` : nothing;

    if (isSkill) {
      return html`
        <div class="editor-actions" role="toolbar" aria-label="Skill actions">
          ${this._isFormEdit || this._hasSuggestion ? html`
            <button type="button" data-variant="secondary"
              ?disabled=${this._isSaveBusy}
              @click=${() => { this._dismissForm(); }}
            >Dismiss</button>
          ` : nothing}
          <button type="button" data-variant="secondary"
            ?disabled=${this._isSaveBusy}
            @click=${() => this._onSaveSkill(STATUS.DRAFT)}
          >Save Draft</button>
          <button type="button" data-variant="accent"
            ?disabled=${this._isSaveBusy}
            @click=${() => this._onSaveSkill(STATUS.APPROVED)}
          >Save</button>
          ${this._isFormEdit ? html`
            <button type="button" data-variant="negative"
              ?disabled=${this._isSaveBusy}
              @click=${this._onDeleteSkill}
            >Delete</button>
          ` : nothing}
        </div>
        ${statusTpl}
      `;
    }

    if (isAgent) {
      return html`
        <div class="editor-actions" role="toolbar" aria-label="Agent actions">
          <button type="button" data-variant="accent"
            ?disabled=${this._isSaveBusy || !this._newAgentId.trim()}
            @click=${this._onSaveAgent}
          >Save Agent File</button>
        </div>
        ${statusTpl}
      `;
    }

    if (isPrompt) {
      return html`
        <div class="editor-actions" role="toolbar" aria-label="Prompt actions">
          <button type="button" data-variant="secondary"
            ?disabled=${this._isSaveBusy}
            @click=${() => this._onSavePrompt(STATUS.DRAFT)}
          >Save Draft</button>
          <button type="button" data-variant="accent"
            ?disabled=${this._isSaveBusy}
            @click=${() => this._onSavePrompt(STATUS.APPROVED)}
          >Save</button>
          <button type="button" data-variant="secondary"
            ?disabled=${this._isSaveBusy || !this._formPromptBody.trim()}
            @click=${() => {
              this._dispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT, this._formPromptBody);
              this._dispatchPromptToChat(DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT, this._formPromptBody);
              this._setStatus('Added to chat input');
            }}
          >Add to Chat</button>
          <button type="button" data-variant="secondary"
            ?disabled=${this._isSaveBusy || !this._formPromptBody.trim()}
            @click=${() => this._onRunPrompt()}
          >Run / Test</button>
          ${this._isFormPromptEdit ? html`
            <button type="button" data-variant="negative"
              ?disabled=${this._isSaveBusy}
              @click=${this._onDeletePrompt}
            >Delete</button>
          ` : nothing}
        </div>
        ${statusTpl}
      `;
    }

    if (isMcp) {
      return html`
        <div class="editor-actions" role="toolbar" aria-label="MCP actions">
          <button type="button" data-variant="accent"
            ?disabled=${this._isSaveBusy || !this._mcpKey.trim() || !this._mcpUrl.trim()}
            @click=${this._onRegisterMcp}
          >${this._editingMcpKey ? 'Update' : 'Register'}</button>        </div>
        ${statusTpl}
      `;
    }

    return nothing;
  }

  // ─── render: skills catalog ───────────────────────────────────────────────

  _renderSkillsCatalog() {
    const ids = Object.keys(this._skills);
    const searchQuery = this._promptSearch.trim().toLowerCase();

    let filtered = this._catalogFilter === 'all' ? ids
      : ids.filter((id) => this._skillStatuses[id] === this._catalogFilter);

    if (searchQuery) {
      filtered = filtered.filter((id) => {
        const title = this._extractTitle(this._skills[id]).toLowerCase();
        return id.toLowerCase().includes(searchQuery) || title.includes(searchQuery);
      });
    }

    return html`
      <div class="catalog-toolbar" role="toolbar" aria-label="Filter skills">
        ${[STATUS.APPROVED, STATUS.DRAFT].map((status) => html`
          <button type="button"
            class="filter-chip ${this._catalogFilter === status ? 'is-active' : ''}"
            aria-pressed=${this._catalogFilter === status ? 'true' : 'false'}
            @click=${() => { this._catalogFilter = status; }}
          >${status.charAt(0).toUpperCase() + status.slice(1)}</button>
        `)}
        <button type="button"
          class="filter-chip ${this._catalogFilter === 'all' ? 'is-active' : ''}"
          aria-pressed=${this._catalogFilter === 'all' ? 'true' : 'false'}
          @click=${() => { this._catalogFilter = 'all'; }}
        >All</button>
      </div>
      ${!filtered.length
        ? html`<div class="empty">No skills found</div>`
        : filtered.map((id) => this._renderSkillCard(id))}
    `;
  }

  _renderSkillCard(id) {
    const title = this._extractTitle(this._skills[id]);
    const status = this._skillStatuses[id] || STATUS.APPROVED;
    const isEditing = this._isFormEdit && this._formSkillId === id;
    const isDraft = status === STATUS.DRAFT;
    return html`
      <article
        role="button"
        tabindex="0"
        aria-label="Edit skill ${id}"
        data-testid="skill-card"
        data-skill-id=${id}
        @click=${(e) => this._onCardClick(e, () => this._onEditSkill(id))}
        @keydown=${(e) => this._onCardKeydown(e, () => this._onEditSkill(id))}
      >
        <nx-card
          interactive
          heading=${id}
          subheading=${title || nothing}
          ?selected=${isEditing}
        >
          <span slot="pill"
            class="status-dot ${isDraft ? 'status-dot-draft' : 'status-dot-approved'}"
            aria-label=${isDraft ? 'Draft' : 'Approved'}
          ></span>
          <button slot="actions" type="button" class="btn-icon more-btn"
            aria-label="More actions for ${id}"
            @click=${(e) => { e.stopPropagation(); this._openSkillMenu(e, id); }}
          >\u22ee</button>
        </nx-card>
        <nx-popover placement="auto">
          <div class="card-menu" role="menu">
            <button role="menuitem" type="button"
              @click=${() => { this._closeSkillMenu(id); this._onEditSkill(id); }}
            >Edit</button>
            <button role="menuitem" type="button" class="card-menu-delete"
              @click=${() => { this._closeSkillMenu(id); this._onDeleteSkillById(id); }}
            >Delete</button>
          </div>
        </nx-popover>
      </article>
    `;
  }

  // ─── render: agents catalog ───────────────────────────────────────────────

  _renderAgentCard(agent, isBuiltin = false) {
    const title = agent.label || agent.name || agent.preset?.name || agent.id;
    const description = agent.description || agent.preset?.description || '';
    const tools = this._agentToolIds(agent, isBuiltin);
    return html`
      <article class="agent-card" role="button" tabindex="0"
        aria-label="Open agent ${title}"
        data-testid=${isBuiltin ? 'agent-builtin-card' : 'agent-card'}
        @click=${(e) => this._onCardClick(e, () => this._onSelectAgent(agent))}
        @keydown=${(e) => this._onCardKeydown(e, () => this._onSelectAgent(agent))}
      >
        <header class="agent-card-header">
          <span class="status-dot status-dot-approved" aria-label="Active"></span>
          <span class="agent-card-title">${title}</span>
          <span class="badge">${isBuiltin ? 'built-in' : 'custom'}</span>
        </header>
        ${description ? html`<p class="agent-card-desc">${description}</p>` : nothing}
        ${tools.length ? html`
          <footer class="agent-card-footer">
            <ul class="agent-tools-list" aria-label="Tools used by ${title}">
              ${tools.slice(0, 12).map((tool) => html`<li class="agent-tool-chip">${tool}</li>`)}
            </ul>
          </footer>
        ` : nothing}
      </article>
    `;
  }

  _renderAgentsCatalog() {
    return html`
      <h3 class="section-h">Built-in (${BUILTIN_AGENTS.length})</h3>
      ${BUILTIN_AGENTS.map((agent) => this._renderAgentCard(agent, true))}
      ${this._agents.length ? html`
        <h3 class="section-h">Custom (${this._agents.length})</h3>
        ${this._agents.map((agent) => this._renderAgentCard(agent, false))}
      ` : nothing}
      ${this._agentRows.length ? html`
        <h3 class="section-h">Config Agents (${this._agentRows.length})</h3>
        ${this._agentRows.map((row) => html`
          <article class="agent-card" role="listitem" data-testid="agent-config-card">
            <header class="agent-card-header">
              <span class="status-dot status-dot-approved" aria-label="Configured"></span>
              <span class="agent-card-title">${row.key}</span>
              <span class="badge">config</span>
            </header>
            <p class="agent-card-desc">${row.url}</p>
          </article>
        `)}
      ` : nothing}
    `;
  }

  // ─── render: prompts catalog ──────────────────────────────────────────────

  _renderPromptsCatalog() {
    const searchQuery = this._promptSearch.trim().toLowerCase();
    const prompts = searchQuery
      ? this._prompts.filter((r) => (r.title || '').toLowerCase().includes(searchQuery)
        || (r.category || '').toLowerCase().includes(searchQuery))
      : this._prompts;

    if (!prompts.length) {
      return html`<div class="empty">No prompts found</div>`;
    }

    return html`
      <div role="list" aria-label="Prompts">
        ${prompts.map((row) => {
          const title = row.title || '';
          const isSelected = this._isEditorOpen && this._isFormPromptEdit
            && this._formPromptTitle === title;
          const cat = (row.category || '').toLowerCase().trim();
          const catClass = KNOWN_CATEGORY_CLASSES.has(cat) ? cat : 'default';
          return html`
            <article role="listitem" data-testid="prompt-card" data-prompt-title=${title}>
              <div class="prompt-row ${isSelected ? 'is-selected' : ''}" role="button"
                tabindex="0"
                aria-label="Edit prompt ${title || '(untitled)'}"
                @click=${(e) => this._onCardClick(e, () => this._openEditor(row))}
                @keydown=${(e) => this._onCardKeydown(e, () => this._openEditor(row))}
              >
                <div class="prompt-row-body">
                  <span class="prompt-row-title">${title || '(untitled)'}</span>
                  ${row.category ? html`
                    <span class="category-badge cat-${catClass}">${row.category}</span>
                  ` : nothing}
                </div>
                <div class="prompt-row-actions">
                  <button type="button" class="btn-icon row-action-btn" title="Edit"
                    aria-label="Edit ${title}"
                    @click=${(e) => { e.stopPropagation(); this._openEditor(row); }}
                  >\u270e</button>
                  <button type="button" class="btn-icon row-action-btn" title="Duplicate"
                    aria-label="Duplicate ${title}"
                    @click=${(e) => { e.stopPropagation(); this._duplicatePrompt(row); }}
                  >\u29c9</button>
                  <button type="button" class="btn-icon row-action-btn" title="Add to chat"
                    aria-label="Add to chat: ${title}"
                    @click=${(e) => {
                      e.stopPropagation();
                      this._dispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT, row.prompt);
                      this._dispatchPromptToChat(DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT, row.prompt);
                    }}
                  >+</button>
                  <button type="button" class="btn-icon row-action-btn" title="Send to chat"
                    aria-label="Send to chat: ${title}"
                    @click=${(e) => {
                      e.stopPropagation();
                      this._dispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_SEND, row.prompt);
                      this._dispatchPromptToChat(DA_SKILLS_LAB_PROMPT_SEND, row.prompt);
                    }}
                  >\u25b6</button>
                  <button type="button" class="btn-icon row-action-btn row-action-btn-delete" title="Delete"
                    aria-label="Delete ${title}"
                    @click=${(e) => { e.stopPropagation(); this._deletePromptDirect(row); }}
                  >\u{1F5D1}</button>
                </div>
              </div>
            </article>
          `;
        })}
      </div>
    `;
  }

  // ─── render: MCPs catalog ─────────────────────────────────────────────────

  _renderMcpsCatalog() {
    const searchQuery = this._promptSearch.trim().toLowerCase();
    const filterPasses = (status) => this._catalogFilter === 'all' || status === this._catalogFilter;
    let filteredCustom = this._mcpRows.filter((row) => filterPasses(skillRowStatus(row)));
    if (searchQuery) {
      filteredCustom = filteredCustom.filter((row) => {
        const key = (row.key || '').toLowerCase();
        const url = (row.url || row.value || '').toLowerCase();
        return key.includes(searchQuery) || url.includes(searchQuery);
      });
    }
    const showBuiltins = filterPasses(STATUS.APPROVED);

    return html`
      ${showBuiltins ? html`
        <h3 class="section-h">Built-in (${BUILTIN_MCP_SERVERS.length})</h3>
        ${BUILTIN_MCP_SERVERS.map((s) => {
          const isViewing = this._viewingMcpServerId === s.id && !this._editingMcpKey;
          return html`
            <article
              role="button"
              tabindex="0"
              aria-label="View tools for ${s.id}"
              data-testid="mcp-builtin-card"
              @click=${(e) => this._onMcpCardClick(e, () => this._onViewMcpTools(s.id))}
              @keydown=${(e) => this._onMcpCardKeydown(e, () => this._onViewMcpTools(s.id))}
            >
              <nx-card heading=${s.id} subheading=${s.description}
                interactive
                ?selected=${isViewing}>
                <span slot="pill" class="status-dot status-dot-approved"
                  aria-label="Enabled"></span>
                <span slot="actions" class="badge">built-in</span>
              </nx-card>
            </article>
          `;
        })}
      ` : nothing}
      <h3 class="section-h">Custom (${filteredCustom.length})</h3>
      ${!filteredCustom.length
        ? html`<div class="empty">No custom MCP servers registered</div>`
        : filteredCustom.map((row) => {
          const isApproved = skillRowStatus(row) === STATUS.APPROVED;
          const isEnabled = isApproved && skillRowEnabled(row);
          const key = row.key || '';
          const token = `mcp:${key}`;
          const isBusy = this._mcpEnableBusy[token];
          const isSelected = this._isEditorOpen
            && (this._editingMcpKey === key || this._viewingMcpServerId === key);
          return html`
            <article
              role="button"
              tabindex="0"
              aria-label="Edit MCP server ${key || '(unnamed)'}"
              data-testid="mcp-card"
              data-mcp-key=${key}
              @click=${(e) => this._onMcpCardClick(e, () => this._onEditMcp(row))}
              @keydown=${(e) => this._onMcpCardKeydown(e, () => this._onEditMcp(row))}
            >
              <nx-card heading=${key || '(unnamed)'}
                interactive
                subheading=${row.description || row.url || row.value || ''}
                ?selected=${isSelected}>
                <span slot="pill"
                  class="status-dot ${isEnabled ? 'status-dot-approved' : 'status-dot-draft'}"
                  aria-label=${isEnabled ? 'Enabled' : 'Disabled'}
                ></span>
                <button slot="actions" type="button" class="btn-icon more-btn"
                  aria-label="More actions for ${key}"
                  @click=${(e) => { e.stopPropagation(); this._openMcpMenu(e, key); }}
                >\u22ee</button>
              </nx-card>
              <nx-popover placement="auto">
                <div class="card-menu" role="menu"
                  @click=${(e) => e.stopPropagation()}>
                  ${isApproved ? html`
                    <button role="menuitem" type="button"
                      ?disabled=${isBusy}
                      @click=${() => { this._closeMcpMenu(key); this._onToggleMcpEnabled(row); }}
                    >${isEnabled ? 'Disable' : 'Enable'}</button>
                  ` : nothing}
                  <button role="menuitem" type="button"
                    @click=${() => { this._closeMcpMenu(key); this._onEditMcp(row); }}
                  >Edit</button>
                  <button role="menuitem" type="button" class="card-menu-delete"
                    @click=${() => { this._closeMcpMenu(key); this._onDeleteMcpDirect(row); }}
                  >Delete</button>
                </div>
              </nx-popover>
            </article>
          `;
        })}
    `;
  }

  // ─── render: memory catalog ───────────────────────────────────────────────

  _renderMemoryCatalog() {
    return html`
      <h3 class="section-h">Project Memory</h3>
      <p class="form-hint">.da/agent/memory.md</p>
      ${this._renderMemoryContent()}
    `;
  }

  _renderMemoryContent() {
    if (this._memory === null) {
      return html`<div class="empty" aria-live="polite">Loading\u2026</div>`;
    }
    if (this._memory === '') {
      return html`<div class="empty">No project memory yet. The DA agent writes here as it learns about your site.</div>`;
    }
    return html`<pre class="memory-content">${this._memory}</pre>`;
  }

  // ─── utility ──────────────────────────────────────────────────────────────

  _extractTitle(md) {
    if (!md) return '';
    const match = md.match(/^#\s+(.+)/m);
    return match ? match[1].trim() : '';
  }
}

customElements.define('nx-skills-editor', NxSkillsEditor);
