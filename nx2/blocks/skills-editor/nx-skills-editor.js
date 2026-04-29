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
  DA_SKILLS_EDITOR_PROMPT_SEND,
  DA_SKILLS_LAB_SUGGESTION_HANDOFF,
  DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT,
  DA_SKILLS_LAB_FORM_DISMISS,
  DA_SKILLS_LAB_PROMPT_SEND,
} from './skills-editor-api.js';
import {
  BUILTIN_AGENTS,
  BUILTIN_TOOL_IDS,
  FRESH_FORM_STATE,
  STATUS,
  STATUS_TYPE,
} from './constants.js';
import {
  renderChatDrawer,
  renderListCol,
  renderEditorPanel,
} from './renderers.js';
import { ensureSkillFrontmatter } from '../../utils/skill-frontmatter.js';

const [styles, catalogStyles, editorStyles, toolsStyles] = await Promise.all([
  loadStyle(import.meta.url),
  loadStyle(new URL('./catalog.css', import.meta.url).href),
  loadStyle(new URL('./editor-panel.css', import.meta.url).href),
  loadStyle(new URL('./tools.css', import.meta.url).href),
]);

class NxSkillsEditor extends LitElement {
  static properties = {
    _isLoading: { state: true },
    _refreshingCount: { state: true },
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
    _formPromptIcon: { state: true },
    _formPromptOriginalTitle: { state: true },
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
    _newAgentId: { state: true },
    _newAgentName: { state: true },
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

  /** Count of in-flight operations that want the refresh indicator shown. */
  _refreshingCount = 0;

  // ─── stable event-handler references (class fields so connect/disconnect are symmetric) ────
  _onSuggestionHandler = () => this._applySuggestion();

  _onClearFormHandler = () => this._clearForm();

  _onPopstateHandler = (e) => this._onPopstate(e);

  constructor() {
    super();
    this._hash = new HashController(this);
    this._isLoading = true;
    this._refreshingCount = 0;
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
    this.shadowRoot.adoptedStyleSheets = [styles, catalogStyles, editorStyles, toolsStyles];
    window.addEventListener(DA_SKILLS_EDITOR_SUGGESTION_HANDOFF, this._onSuggestionHandler);
    window.addEventListener(DA_SKILLS_LAB_SUGGESTION_HANDOFF, this._onSuggestionHandler);
    window.addEventListener(DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT, this._onClearFormHandler);
    window.addEventListener(DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT, this._onClearFormHandler);
    window.addEventListener('popstate', this._onPopstateHandler);
    // Seed initial history state so back navigation knows which tab was active
    history.replaceState({ ...history.state, skillsEditorTab: this._catalogTab }, '');
    if (this._isChatOpen) {
      import('../chat/chat.js').then(() => { this._chatLoaded = true; });
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._statusTimer);
    window.removeEventListener(DA_SKILLS_EDITOR_SUGGESTION_HANDOFF, this._onSuggestionHandler);
    window.removeEventListener(DA_SKILLS_LAB_SUGGESTION_HANDOFF, this._onSuggestionHandler);
    window.removeEventListener(DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT, this._onClearFormHandler);
    window.removeEventListener(DA_SKILLS_LAB_CLEAR_FORM_FROM_CHAT, this._onClearFormHandler);
    window.removeEventListener('popstate', this._onPopstateHandler);
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
    if (showRefreshIndicator) this._refreshingCount += 1;

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
      if (showRefreshIndicator) this._refreshingCount = Math.max(0, this._refreshingCount - 1);
    }
  }

  async _ensureAgentsLoaded() {
    if (this._agentsLoadInFlight || this._agents.length) return;
    const loadKey = this._loadedKey;
    this._agentsLoadInFlight = true;
    this._refreshingCount += 1;
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
      this._refreshingCount = Math.max(0, this._refreshingCount - 1);
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
    this._refreshingCount += 1;
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
      this._refreshingCount = Math.max(0, this._refreshingCount - 1);
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

    // Frontmatter — inject if missing, then validate against Anthropic's requirements.
    const { markdown: withFm, injected, warnings } = ensureSkillFrontmatter(body, id, status);
    body = withFm;
    if (injected) {
      this._formSkillBody = body;
      this._setStatus(
        'Frontmatter added — fill in description to help the agent discover this skill.',
        STATUS_TYPE.WARN,
      );
    } else if (warnings.length) {
      this._setStatus(warnings[0], STATUS_TYPE.WARN);
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

  /**
   * Build a plain ViewModel object for renderers.
   * All private state and event handlers are exposed under public names so
   * renderers never access `host._xxx` directly, satisfying no-underscore-dangle.
   */
  _buildViewModel() {
    return {
      // ── state ──────────────────────────────────────────────────────────────
      catalogTab: this._catalogTab,
      catalogFilter: this._catalogFilter,
      isChatOpen: this._isChatOpen,
      isEditorOpen: this._isEditorOpen,
      isFormDirty: this._isFormDirty,
      isFormEdit: this._isFormEdit,
      isFormPromptEdit: this._isFormPromptEdit,
      isAgentViewTools: this._isAgentViewTools,
      isSaveBusy: this._isSaveBusy,
      hasSuggestion: this._hasSuggestion,
      statusMsg: this._statusMsg,
      statusType: this._statusType,
      promptSearch: this._promptSearch,
      skills: this._skills,
      skillStatuses: this._skillStatuses,
      prompts: this._prompts,
      agents: this._agents,
      agentRows: this._agentRows,
      mcpRows: this._mcpRows,
      mcpTools: this._mcpTools,
      mcpEnableBusy: this._mcpEnableBusy,
      configuredMcpServers: this._configuredMcpServers,
      viewingMcpServerId: this._viewingMcpServerId,
      editingMcpKey: this._editingMcpKey,
      toolOverrides: this._toolOverrides,
      toolsSearch: this._toolsSearch,
      toolsGroupCollapsed: this._toolsGroupCollapsed,
      formSkillId: this._formSkillId,
      formSkillBody: this._formSkillBody,
      newAgentId: this._newAgentId,
      newAgentName: this._newAgentName,
      formPromptTitle: this._formPromptTitle,
      formPromptCategory: this._formPromptCategory,
      formPromptIcon: this._formPromptIcon,
      formPromptBody: this._formPromptBody,
      formPromptTools: this._formPromptTools,
      mcpKey: this._mcpKey,
      mcpUrl: this._mcpUrl,
      mcpDescription: this._mcpDescription,
      mcpAuthHeaderName: this._mcpAuthHeaderName,
      mcpAuthHeaderValue: this._mcpAuthHeaderValue,
      memory: this._memory,
      // ── form setters ───────────────────────────────────────────────────────
      setPromptSearch: (v) => { this._promptSearch = v; },
      setFormSkillId: (v) => { this._formSkillId = v; this._markDirty(); },
      setFormSkillBody: (v) => { this._formSkillBody = v; this._markDirty(); },
      setNewAgentId: (v) => { this._newAgentId = v; this._markDirty(); },
      setNewAgentName: (v) => { this._newAgentName = v; this._markDirty(); },
      setFormPromptTitle: (v) => { this._formPromptTitle = v; this._markDirty(); },
      setFormPromptCategory: (v) => { this._formPromptCategory = v; this._markDirty(); },
      setFormPromptIcon: (v) => { this._formPromptIcon = v; this._markDirty(); },
      setFormPromptBody: (v) => { this._formPromptBody = v; this._markDirty(); },
      setFormPromptTools: (v) => { this._formPromptTools = v; },
      setMcpKey: (v) => { this._mcpKey = v; this._markDirty(); },
      setMcpUrl: (v) => { this._mcpUrl = v; this._markDirty(); },
      setMcpDescription: (v) => { this._mcpDescription = v; this._markDirty(); },
      setMcpAuthHeaderName: (v) => { this._mcpAuthHeaderName = v; this._markDirty(); },
      setMcpAuthHeaderValue: (v) => { this._mcpAuthHeaderValue = v; this._markDirty(); },
      setToolsSearch: (v) => { this._toolsSearch = v; },
      setToolsGroupCollapsed: (key, isCollapsed) => {
        this._toolsGroupCollapsed = { ...this._toolsGroupCollapsed, [key]: isCollapsed };
      },
      setCatalogFilter: (v) => { this._catalogFilter = v; },
      // ── actions / event handlers ───────────────────────────────────────────
      onTabChange: (id) => this._onTabChange(id),
      onToggleChat: () => this._toggleChat(),
      onCloseEditor: () => this._closeEditor(),
      onDismissForm: () => this._dismissForm(),
      onMarkDirty: () => this._markDirty(),
      onCardClick: (e, fn) => this._onCardClick(e, fn),
      onCardKeydown: (e, fn) => this._onCardKeydown(e, fn),
      onMcpCardClick: (e, fn) => this._onMcpCardClick(e, fn),
      onMcpCardKeydown: (e, fn) => this._onMcpCardKeydown(e, fn),
      onEditSkill: (id) => this._onEditSkill(id),
      onDeleteSkillById: (id) => this._onDeleteSkillById(id),
      onOpenSkillMenu: (e, id) => this._openSkillMenu(e, id),
      onCloseSkillMenu: (id) => this._closeSkillMenu(id),
      onSaveSkill: (status) => this._onSaveSkill(status),
      onDeleteSkill: this._onDeleteSkill.bind(this),
      onSelectAgent: (agent) => this._onSelectAgent(agent),
      onSaveAgent: this._onSaveAgent.bind(this),
      onOpenEditor: (row) => this._openEditor(row),
      onSavePrompt: (status) => this._onSavePrompt(status),
      onDeletePrompt: this._onDeletePrompt.bind(this),
      onDispatchPromptToChat: (event, body) => this._dispatchPromptToChat(event, body),
      onRunPrompt: () => this._onRunPrompt(),
      onDuplicatePrompt: (row) => this._duplicatePrompt(row),
      onDeletePromptDirect: (row) => this._deletePromptDirect(row),
      onViewMcpTools: (id) => this._onViewMcpTools(id),
      onEditMcp: (row) => this._onEditMcp(row),
      onRegisterMcp: this._onRegisterMcp.bind(this),
      onToggleMcpEnabled: (row) => this._onToggleMcpEnabled(row),
      onDeleteMcpDirect: (row) => this._onDeleteMcpDirect(row),
      onOpenMcpMenu: (e, key) => this._openMcpMenu(e, key),
      onCloseMcpMenu: (key) => this._closeMcpMenu(key),
      onToggleToolEnabled: (serverId, name, enabled, rollback) => (
        this._onToggleToolEnabled(serverId, name, enabled, rollback)
      ),
      onSetStatus: (msg, type) => this._setStatus(msg, type),
      // ── queries ────────────────────────────────────────────────────────────
      getAgentToolIds: (agent, isBuiltin) => this._agentToolIds(agent, isBuiltin),
      parseToolId: (toolId) => this._parseToolId(toolId),
      // ── TAB_ACTIONS openers ────────────────────────────────────────────────
      openNewSkillEditor: () => this._openNewSkillEditor(),
      openNewAgentEditor: () => this._openNewAgentEditor(),
      openNewEditor: () => this._openNewEditor(),
      openNewMcpEditor: () => this._openNewMcpEditor(),
    };
  }

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
      ${this._refreshingCount > 0 ? html`
        <div class="refresh-indicator" role="status" aria-live="polite">
          <span class="refresh-indicator-label">Auto-refreshing capabilities…</span>
          <span class="refresh-indicator-track"><span class="refresh-indicator-bar"></span></span>
        </div>
      ` : nothing}
      ${renderChatDrawer(this._buildViewModel())}
      ${renderListCol(this._buildViewModel())}
      ${renderEditorPanel(this._buildViewModel())}
    </div>`;
  }
}

customElements.define('nx-skills-editor', NxSkillsEditor);
