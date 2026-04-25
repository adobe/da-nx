import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, HashController } from '../../utils/utils.js';
import '../shared/tabs/tabs.js';
import '../shared/card/card.js';
import '../shared/popover/popover.js';
import './generated-tools/generated-tools.js';
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
  registerMcpServer,
  setMcpServerEnabled,
  deleteMcpServer,
  skillRowStatus,
  skillRowEnabled,
  fetchSiteSourceText,
  DA_SKILLS_EDITOR_SUGGESTION_HANDOFF,
  DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT,
  DA_SKILLS_EDITOR_FORM_DISMISS,
  DA_SKILLS_EDITOR_PROMPT_SEND,
} from './skills-editor-api.js';

const styles = await loadStyle(import.meta.url);

const CATALOG_TABS = [
  { id: 'skills', label: 'Skills' },
  { id: 'agents', label: 'Agents' },
  { id: 'prompts', label: 'Prompts' },
  { id: 'mcps', label: 'MCPs' },
  { id: 'memory', label: 'Memory' },
];

const CATEGORY_OPTIONS = ['Review', 'Workflow', 'Style', 'Content'];
const KNOWN_CATEGORY_CLASSES = new Set(['review', 'workflow', 'style', 'content']);

const STATUS = { APPROVED: 'approved', DRAFT: 'draft' };

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
    tools: [
      'da_list_sources', 'da_get_source', 'da_create_source', 'da_update_source',
      'da_delete_source', 'da_copy_content', 'da_move_content', 'da_create_version',
      'da_get_versions', 'da_lookup_media', 'da_lookup_fragment', 'da_upload_media',
    ],
  },
];

class NxSkillsEditor extends LitElement {
  static properties = {
    _isLoading: { state: true },
    _catalogTab: { state: true },
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
    _editingMcpKey: { state: true },
    _mcpEnableBusy: { state: true },
    _activeToolRefs: { state: true },
    _memory: { state: true },
    // new master-detail state
    _isEditorOpen: { state: true },
    _isAgentViewTools: { state: true },
    _isFormDirty: { state: true },
    _promptSearch: { state: true },
    _toolsSearch: { state: true },
    _toolsGroupCollapsed: { state: true },
    _formPromptTools: { state: true },
  };

  constructor() {
    super();
    this._hash = new HashController(this);
    this._isLoading = true;
    this._catalogTab = 'skills';
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
    this._mcpDescription = '';
    this._editingMcpKey = null;
    this._mcpEnableBusy = {};
    this._activeToolRefs = null;
    this._memory = null;
    this._loadedKey = null;
    this._statusTimer = null;
    this._isEditorOpen = false;
    this._isAgentViewTools = false;
    this._isFormDirty = false;
    this._dirtyForms = {}; // non-reactive: { [tabId]: snapshot }
    this._promptSearch = '';
    this._toolsSearch = '';
    this._toolsGroupCollapsed = { DA: false, MCP: false };
    this._formPromptTools = [];
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
    window.addEventListener(DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT, this._boundOnClearForm);
    window.addEventListener('popstate', this._boundOnPopstate);
    // Seed initial history state so back navigation knows which tab was active
    history.replaceState({ ...history.state, skillsEditorTab: this._catalogTab }, '');
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearTimeout(this._statusTimer);
    window.removeEventListener(DA_SKILLS_EDITOR_SUGGESTION_HANDOFF, this._boundOnSuggestion);
    window.removeEventListener(DA_SKILLS_EDITOR_CLEAR_FORM_FROM_CHAT, this._boundOnClearForm);
    window.removeEventListener('popstate', this._boundOnPopstate);
  }

  async updated(changed) {
    if (!this._org || !this._site) return;
    const key = `${this._org}/${this._site}`;
    if (key !== this._loadedKey) {
      this._loadedKey = key;
      this._memory = null;
      await this._reload();
      // Restore panel state after data is available (must come after _reload)
      await this._restoreNavState();
    }
    if (changed?.has('_catalogTab') && this._catalogTab === 'memory' && this._memory === null) {
      this._loadMemory();
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

  async _reload() {
    if (!this._org || !this._site) return;
    this._isLoading = true;

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

    this._isLoading = false;
    this._applySuggestion();

    loadAgentPresets(this._org, this._site)
      .then((presets) => { this._agents = presets; })
      .catch(() => { /* non-fatal: agent presets unavailable */ });
    if (Object.keys(this._configuredMcpServers).length) {
      fetchMcpToolsFromAgent(this._configuredMcpServers)
        .then((tools) => { this._mcpTools = tools; })
        .catch(() => { /* non-fatal: MCP tool listing unavailable */ });
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
    this._formSkillId = '';
    this._formSkillBody = '';
    this._isFormEdit = false;
    this._formPromptTitle = '';
    this._formPromptCategory = '';
    this._formPromptBody = '';
    this._isFormPromptEdit = false;
    this._formPromptTools = [];
    this._mcpKey = '';
    this._mcpUrl = '';
    this._mcpDescription = '';
    this._editingMcpKey = null;
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
  }

  _closeEditor() {
    // Just collapse the drawer. If the form was dirty, the snapshot lives in
    // _dirtyForms[tab] and will be restored when the user reopens the same item.
    this._isEditorOpen = false;
    if (!this._isFormDirty) this._clearForm();
  }

  _setStatus(msg, type = 'ok') {
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
    const tab = this._catalogTab;
    if (tab === 'skills' || tab === 'agents') {
      return {
        tab,
        formSkillId: this._formSkillId,
        formSkillBody: this._formSkillBody,
        formIsEdit: this._isFormEdit,
        agentViewTools: this._isAgentViewTools,
      };
    }
    if (tab === 'prompts') {
      return {
        tab,
        formPromptTitle: this._formPromptTitle,
        formPromptBody: this._formPromptBody,
        formPromptCategory: this._formPromptCategory,
        formPromptTools: [...(this._formPromptTools || [])],
        formPromptIsEdit: this._isFormPromptEdit,
      };
    }
    if (tab === 'mcps') {
      return {
        tab,
        mcpKey: this._mcpKey,
        mcpUrl: this._mcpUrl,
        mcpDescription: this._mcpDescription,
        editingMcpKey: this._editingMcpKey,
      };
    }
    return null;
  }

  /** Restore form fields from a previously captured snapshot. */
  _restoreForm(snapshot) {
    if (!snapshot) return;
    const { tab } = snapshot;
    if (tab === 'skills' || tab === 'agents') {
      this._formSkillId = snapshot.formSkillId;
      this._formSkillBody = snapshot.formSkillBody;
      this._isFormEdit = snapshot.formIsEdit;
      this._isAgentViewTools = snapshot.agentViewTools;
      this._isEditorOpen = true;
    } else if (tab === 'prompts') {
      this._formPromptTitle = snapshot.formPromptTitle;
      this._formPromptBody = snapshot.formPromptBody;
      this._formPromptCategory = snapshot.formPromptCategory;
      this._formPromptTools = snapshot.formPromptTools;
      this._isFormPromptEdit = snapshot.formPromptIsEdit;
      this._isEditorOpen = true;
    } else if (tab === 'mcps') {
      this._mcpKey = snapshot.mcpKey;
      this._mcpUrl = snapshot.mcpUrl;
      this._mcpDescription = snapshot.mcpDescription || '';
      this._editingMcpKey = snapshot.editingMcpKey;
      this._isEditorOpen = true;
    }
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

    const saved = this._dirtyForms[skillsEditorTab];
    if (saved) {
      this._restoreForm(saved);
      this._isFormDirty = true;
    } else {
      this._clearForm();
      this._isEditorOpen = skillsEditorTab === 'memory';
    }
  }

  // ─── editor open helpers ──────────────────────────────────────────────────

  _openEditor(row) {
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
    this._formPromptTools = extractToolRefs(row.prompt || '');
    this._isFormPromptEdit = true;
    this._statusMsg = '';
    this._isEditorOpen = true;
    this._isFormDirty = false;
    delete this._dirtyForms.prompts;
    this._catalogTab = 'prompts';
  }

  _openNewEditor() {
    this._clearForm();
    this._catalogTab = 'prompts';
    this._isEditorOpen = true;
  }

  _openNewSkillEditor() {
    this._clearForm();
    if (this._catalogTab !== 'agents') this._catalogTab = 'skills';
    this._isEditorOpen = true;
  }

  _openNewMcpEditor() {
    this._clearMcpForm();
    this._editingMcpKey = null;
    this._catalogTab = 'mcps';
    this._isEditorOpen = true;
  }

  // ─── skill CRUD ───────────────────────────────────────────────────────────

  async _onSaveSkill(status = STATUS.APPROVED) {
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

    this._isSaveBusy = true;
    this._statusMsg = '';

    const [configResult, fileResult] = await Promise.all([
      upsertSkillInConfig(this._org, this._site, id, body, { status }),
      writeSkillMdFile(this._org, this._site, id, body),
    ]);

    if (configResult.error || !fileResult.ok) {
      this._setStatus(configResult.error || 'Failed to write file', 'err');
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

    const [configResult, fileResult] = await Promise.all([
      deleteSkillFromConfig(this._org, this._site, id),
      deleteSkillMdFile(this._org, this._site, id),
    ]);

    this._isSaveBusy = false;

    if (configResult?.error || !fileResult?.ok) {
      this._setStatus(configResult?.error || 'Failed to delete skill', 'err');
      return;
    }

    this._closeEditor();
    await this._reload();
  }

  async _onDeleteSkillById(id) {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete skill "${id}"? This cannot be undone.`)) return;
    this._isSaveBusy = true;
    const [configResult, fileResult] = await Promise.all([
      deleteSkillFromConfig(this._org, this._site, id),
      deleteSkillMdFile(this._org, this._site, id),
    ]);
    this._isSaveBusy = false;
    if (configResult?.error || !fileResult?.ok) {
      this._setStatus(configResult?.error || 'Failed to delete skill', 'err');
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

    const { text } = await readSkillMdFile(this._org, this._site, skillId);
    // Only apply if the user hasn't started editing while we waited.
    if (text && !this._isFormDirty) this._formSkillBody = text;
  }

  _onSelectAgent(agent) {
    this._formPromptTools = agent.tools || [];
    this._isAgentViewTools = true;
    this._isEditorOpen = true;
  }

  _openNewAgentEditor() {
    this._clearForm();
    this._isAgentViewTools = false;
    this._catalogTab = 'agents';
    this._isEditorOpen = true;
  }

  _onSelectMcp(row) {
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
      this._setStatus('Title and prompt are required', 'err');
      return;
    }

    this._isSaveBusy = true;
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
      this._clearDirty();
      if (!this._isFormPromptEdit) {
        this._formPromptTitle = '';
        this._formPromptCategory = '';
        this._formPromptBody = '';
        this._formPromptTools = [];
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

    if (result?.error) {
      this._setStatus(result.error, 'err');
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
    if (result.error) {
      this._setStatus(result.error, 'err');
    }
    await this._reload();
  }

  async _deletePromptDirect(row) {
    const title = row.title || '';
    if (!title) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete prompt "${title}"? This cannot be undone.`)) return;
    const result = await deletePromptFromConfig(this._org, this._site, title);
    if (result?.error) {
      this._setStatus(result.error, 'err');
      return;
    }
    if (this._isFormPromptEdit && this._formPromptTitle === title) this._closeEditor();
    await this._reload();
  }

  _onRunPrompt() {
    const prompt = this._formPromptBody.trim();
    if (!prompt) return;
    this._dispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_SEND, prompt);
    this._setStatus('Sent to chat');
  }

  // ─── MCP register ─────────────────────────────────────────────────────────

  async _onRegisterMcp() {
    this._isSaveBusy = true;
    const isUpdate = Boolean(this._editingMcpKey);
    // eslint-disable-next-line max-len
    const result = await registerMcpServer(this._org, this._site, this._mcpKey, this._mcpUrl, this._mcpDescription);
    if (!result.ok) this._setStatus(result.error || 'Failed', 'err');
    else {
      this._mcpKey = '';
      this._mcpUrl = '';
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
      this._setStatus(result.error || 'Failed to remove MCP server', 'err');
      return;
    }
    if (this._editingMcpKey === key) this._closeEditor();
    await this._reload();
  }

  _clearMcpForm() {
    this._mcpKey = '';
    this._mcpUrl = '';
    this._mcpDescription = '';
    this._editingMcpKey = null;
  }

  _onEditMcp(row) {
    // If this MCP already has dirty edits, restore them.
    const saved = this._dirtyForms.mcps;
    if (saved?.editingMcpKey === row.key) {
      this._catalogTab = 'mcps';
      this._restoreForm(saved);
      this._isFormDirty = true;
      return;
    }

    this._editingMcpKey = row.key;
    this._mcpKey = row.key;
    this._mcpUrl = row.url || row.value || '';
    this._mcpDescription = row.description || '';
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
      this._setStatus(res.error || 'Could not update MCP state', 'err');
      return;
    }
    await this._reload();
  }

  // ─── prompt → chat dispatch ───────────────────────────────────────────────

  _dispatchPromptToChat(eventName, prompt) {
    window.dispatchEvent(new CustomEvent(eventName, {
      detail: { prompt: String(prompt || '') },
    }));
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

  // ─── render: top level ────────────────────────────────────────────────────

  render() {
    if (!this._org || !this._site) {
      return html`<div class="empty">Missing org or site</div>`;
    }
    if (this._isLoading) {
      return html`<div class="loading" aria-live="polite">Loading capabilities\u2026</div>`;
    }
    return html`<div class="root ${this._isEditorOpen ? 'is-drawer-open' : ''}" role="region" aria-label="Skills Editor">
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
            ${tab === 'prompts' ? html`
              <button type="button" class="new-btn"
                @click=${() => this._openNewEditor()}
              >+ New Prompt</button>
            ` : nothing}
            ${tab === 'skills' ? html`
              <button type="button" class="new-btn"
                @click=${() => this._openNewSkillEditor()}
              >+ New Skill</button>
            ` : nothing}
            ${tab === 'agents' ? html`
              <button type="button" class="new-btn"
                @click=${() => this._openNewAgentEditor()}
              >+ New Agent</button>
            ` : nothing}
            ${tab === 'mcps' ? html`
              <button type="button" class="new-btn"
                @click=${() => this._openNewMcpEditor()}
              >+ Register MCP</button>
            ` : nothing}
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

  // ─── render: editor panel ─────────────────────────────────────────────────

  _renderEditorPanel() {
    const tab = this._catalogTab;
    const isSkill = tab === 'skills' || tab === 'agents';
    const isPrompt = tab === 'prompts';
    const isMcp = tab === 'mcps';
    const isMemory = tab === 'memory';

    let title = '';
    if (tab === 'agents' && this._isAgentViewTools) title = 'Associated Tools';
    else if (tab === 'agents') title = this._isFormEdit ? 'Edit Agent' : 'New Agent';
    else if (tab === 'skills') title = this._isFormEdit ? 'Edit Skill' : 'New Skill';
    else if (isPrompt) title = this._isFormPromptEdit ? 'Edit Prompt' : 'New Prompt';
    else if (isMcp) title = this._editingMcpKey ? `Edit: ${this._editingMcpKey}` : 'Register MCP Server';
    else if (isMemory) title = 'Project Memory';

    return html`
      <div class="col-editor" aria-hidden=${this._isEditorOpen ? 'false' : 'true'}
        ?inert=${!this._isEditorOpen}>
        <div class="col-editor-inner">
          ${this._isEditorOpen ? html`
            <div class="editor-header">
              <h3 class="editor-title">${title}</h3>
              <button type="button" class="close-btn" aria-label="Close"
                @click=${() => this._closeEditor()}
              >\u2715</button>
            </div>
            ${this._isFormDirty ? html`
              <div class="dirty-notice" role="status">Unsaved edits &middot; save to persist</div>
            ` : nothing}
            <div class="editor-body ${isMemory ? 'editor-body-memory' : ''}">
              ${tab === 'agents' && this._isAgentViewTools ? this._renderAssociatedToolsSelector() : nothing}
              ${isSkill && !this._isAgentViewTools ? this._renderSkillForm() : nothing}
              ${isPrompt ? this._renderPromptForm() : nothing}
              ${isMcp ? this._renderMcpForm() : nothing}
              ${isMemory ? html`
                <p class="form-hint">.da/agent/memory.md</p>
                ${this._renderMemoryContent()}
              ` : nothing}
            </div>
            ${(isSkill && !this._isAgentViewTools) || isPrompt || isMcp ? html`
              <div class="editor-footer">
                ${this._renderEditorFooter(isSkill && !this._isAgentViewTools, isPrompt, isMcp)}
              </div>
            ` : nothing}
          ` : nothing}
        </div>
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
            placeholder="Create or edit a tool"
            aria-label="Skill markdown"
            .value=${this._formSkillBody}
            @input=${(e) => { this._formSkillBody = e.target.value; this._markDirty(); }}
          ></textarea>
        </div>
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
    const builtIn = BUILTIN_AGENTS[0]?.tools || [];
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
                        const next = new Set(this._formPromptTools || []);
                        if (e.target.checked) next.add(toolId);
                        else next.delete(toolId);
                        this._formPromptTools = [...next];
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
    return html`
      <form class="form" @submit=${(e) => e.preventDefault()}>
        <input type="text" placeholder="server-key" aria-label="MCP server key"
          .value=${this._mcpKey}
          ?readonly=${Boolean(this._editingMcpKey)}
          @input=${(e) => { this._mcpKey = e.target.value; this._markDirty(); }}
        >
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
      </form>
    `;
  }

  // ─── render: editor footer (sticky actions) ───────────────────────────────

  _renderEditorFooter(isSkill, isPrompt, isMcp) {
    const statusTpl = this._statusMsg ? html`
      <output class="msg ${this._statusType === 'err' ? 'msg-err' : 'msg-ok'}">
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

  // ─── render: generated tools ──────────────────────────────────────────────

  _renderGeneratedTools() {
    return html`
      <nx-generated-tools
        .org=${this._org}
        .site=${this._site}
        context-page-path=${window.location.pathname || ''}
      ></nx-generated-tools>
    `;
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
      <article role="listitem" data-testid="skill-card" data-skill-id=${id}>
        <nx-card
          heading=${id}
          subheading=${title || nothing}
          ?selected=${isEditing}
          @click=${() => this._onEditSkill(id)}
        >
          <span slot="pill"
            class="status-dot ${isDraft ? 'status-dot-draft' : 'status-dot-approved'}"
            aria-label=${isDraft ? 'Draft' : 'Approved'}
          ></span>
          <button slot="actions" type="button" class="more-btn"
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

  _renderAgentCard(a, isBuiltin = false) {
    return html`
      <article class="agent-card" role="listitem"
        data-testid=${isBuiltin ? 'agent-builtin-card' : 'agent-card'}
        @click=${() => this._onSelectAgent(a)}
      >
        <header class="agent-card-header">
          <span class="status-dot status-dot-approved" aria-label="Active"></span>
          <span class="agent-card-title">${a.label || a.id}</span>
          <span class="badge">${isBuiltin ? 'built-in' : 'custom'}</span>
        </header>
        ${a.description ? html`<p class="agent-card-desc">${a.description}</p>` : nothing}
        ${a.tools?.length ? html`
          <footer class="agent-card-footer">
            <ul class="agent-tools-list" aria-label="Tools used by ${a.label || a.id}">
              ${a.tools.map((t) => html`<li class="agent-tool-chip">${t}</li>`)}
            </ul>
          </footer>
        ` : nothing}
      </article>
    `;
  }

  _renderAgentsCatalog() {
    return html`
      <h3 class="section-h">Built-in (${BUILTIN_AGENTS.length})</h3>
      ${BUILTIN_AGENTS.map((a) => this._renderAgentCard(a, true))}
      ${this._agents.length ? html`
        <h3 class="section-h">Custom (${this._agents.length})</h3>
        ${this._agents.map((a) => this._renderAgentCard(a, false))}
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
              <div class="prompt-row ${isSelected ? 'is-selected' : ''}"
                @click=${() => this._openEditor(row)}
              >
                <div class="prompt-row-body">
                  <span class="prompt-row-title">${title || '(untitled)'}</span>
                  ${row.category ? html`
                    <span class="category-badge cat-${catClass}">${row.category}</span>
                  ` : nothing}
                </div>
                <div class="prompt-row-actions">
                  <button type="button" class="row-action-btn" title="Edit"
                    aria-label="Edit ${title}"
                    @click=${(e) => { e.stopPropagation(); this._openEditor(row); }}
                  >\u270e</button>
                  <button type="button" class="row-action-btn" title="Duplicate"
                    aria-label="Duplicate ${title}"
                    @click=${(e) => { e.stopPropagation(); this._duplicatePrompt(row); }}
                  >\u29c9</button>
                  <button type="button" class="row-action-btn" title="Send to chat"
                    aria-label="Send to chat: ${title}"
                    @click=${(e) => {
                      e.stopPropagation();
                      this._dispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_SEND, row.prompt);
                    }}
                  >\u25b6</button>
                  <button type="button" class="row-action-btn row-action-btn-delete" title="Delete"
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
        ${BUILTIN_MCP_SERVERS.map((s) => html`
          <article role="listitem" data-testid="mcp-builtin-card">
            <nx-card heading=${s.id} subheading=${s.description}>
              <span slot="pill" class="status-dot status-dot-approved" aria-label="Enabled"></span>
              <span slot="actions" class="badge">built-in</span>
            </nx-card>
          </article>
        `)}
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
          return html`
            <article role="listitem" data-testid="mcp-card" data-mcp-key=${key}>
              <nx-card heading=${key || '(unnamed)'}
                subheading=${row.description || row.url || row.value || ''}
                @click=${() => this._onEditMcp(row)}>
                <span slot="pill"
                  class="status-dot ${isEnabled ? 'status-dot-approved' : 'status-dot-draft'}"
                  aria-label=${isEnabled ? 'Enabled' : 'Disabled'}
                ></span>
                <button slot="actions" type="button" class="more-btn"
                  aria-label="More actions for ${key}"
                  @click=${(e) => { e.stopPropagation(); this._openMcpMenu(e, key); }}
                >\u22ee</button>
              </nx-card>
              <nx-popover placement="auto">
                <div class="card-menu" role="menu">
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
