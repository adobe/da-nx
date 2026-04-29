import { html, nothing } from 'da-lit';
import { extractTitle } from '../../utils/markdown.js';
import {
  BUILTIN_AGENTS,
  BUILTIN_MCP_SERVERS,
  BUILTIN_TOOL_DETAILS,
  BUILTIN_TOOL_IDS,
  CATALOG_TABS,
  CATEGORY_OPTIONS,
  KNOWN_CATEGORY_CLASSES,
  STATUS,
  STATUS_TYPE,
  TAB_ACTIONS,
  TAB_AGENTS,
  TAB_MCPS,
  TAB_MEMORY,
  TAB_PROMPTS,
  TAB_SKILLS,
} from './constants.js';
import {
  skillRowEnabled,
  skillRowStatus,
  DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT,
  DA_SKILLS_EDITOR_PROMPT_SEND,
  DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT,
  DA_SKILLS_LAB_PROMPT_SEND,
} from './skills-editor-api.js';

// ─── private helpers ──────────────────────────────────────────────────────────

function msgClass(statusType) {
  if (statusType === STATUS_TYPE.ERR) return 'msg-err';
  if (statusType === STATUS_TYPE.WARN) return 'msg-warn';
  return 'msg-ok';
}

function editorTitle(vm, tab) {
  if (tab === TAB_AGENTS && vm.isAgentViewTools) return 'Associated Tools';
  if (tab === TAB_AGENTS) return vm.isFormEdit ? 'Edit Agent' : 'New Agent';
  if (tab === TAB_SKILLS) return vm.isFormEdit ? 'Edit Skill' : 'New Skill';
  if (tab === TAB_PROMPTS) return vm.isFormPromptEdit ? 'Edit Prompt' : 'New Prompt';
  if (tab === TAB_MCPS) {
    if (vm.viewingMcpServerId && !vm.editingMcpKey) return vm.viewingMcpServerId;
    if (vm.editingMcpKey) return `Edit: ${vm.editingMcpKey}`;
    return 'Register MCP Server';
  }
  if (tab === TAB_MEMORY) return 'Project Memory';
  return '';
}

function mcpServerToolData(vm, serverId) {
  const builtinList = BUILTIN_TOOL_DETAILS[serverId];
  if (builtinList) return { tools: builtinList, error: null, source: 'builtin' };

  if (!vm.mcpTools) return { tools: [], error: null, source: 'pending' };

  const server = (vm.mcpTools.servers || []).find((s) => s.id === serverId);
  if (!server) {
    const isConfigured = Boolean(vm.configuredMcpServers?.[serverId]);
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

function renderSkillCard(vm, id) {
  const title = extractTitle(vm.skills[id]);
  const status = vm.skillStatuses[id] || STATUS.APPROVED;
  const isEditing = vm.isFormEdit && vm.formSkillId === id;
  const isDraft = status === STATUS.DRAFT;
  return html`
    <article
      role="button"
      tabindex="0"
      aria-label="Edit skill ${id}"
      data-testid="skill-card"
      data-skill-id=${id}
      @click=${(e) => vm.onCardClick(e, () => vm.onEditSkill(id))}
      @keydown=${(e) => vm.onCardKeydown(e, () => vm.onEditSkill(id))}
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
          @click=${(e) => { e.stopPropagation(); vm.onOpenSkillMenu(e, id); }}
        >⋮</button>
      </nx-card>
      <nx-popover placement="auto">
        <div class="card-menu" role="menu">
          <button role="menuitem" type="button"
            @click=${() => { vm.onCloseSkillMenu(id); vm.onEditSkill(id); }}
          >Edit</button>
          <button role="menuitem" type="button" class="card-menu-delete"
            @click=${() => { vm.onCloseSkillMenu(id); vm.onDeleteSkillById(id); }}
          >Delete</button>
        </div>
      </nx-popover>
    </article>
  `;
}

function renderAgentCard(vm, agent, isBuiltin = false) {
  const title = agent.label || agent.name || agent.preset?.name || agent.id;
  const description = agent.description || agent.preset?.description || '';
  const tools = vm.getAgentToolIds(agent, isBuiltin);
  return html`
    <article class="agent-card" role="button" tabindex="0"
      aria-label="Open agent ${title}"
      data-testid=${isBuiltin ? 'agent-builtin-card' : 'agent-card'}
      @click=${(e) => vm.onCardClick(e, () => vm.onSelectAgent(agent))}
      @keydown=${(e) => vm.onCardKeydown(e, () => vm.onSelectAgent(agent))}
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

// ─── exported render functions ────────────────────────────────────────────────

export function renderChatDrawer(vm) {
  return html`
    <div class="chat-drawer" aria-hidden=${vm.isChatOpen ? 'false' : 'true'}
      ?inert=${!vm.isChatOpen}>
      ${vm.isChatOpen ? html`
        <div class="chat-drawer-header">
          <span class="chat-drawer-title">Chat</span>
          <button type="button" class="btn-icon close-btn" aria-label="Close chat"
            @click=${() => vm.onToggleChat()}
          >✕</button>
        </div>
        <div class="chat-drawer-body"
          @nx-panel-close=${(e) => { e.stopPropagation(); vm.onToggleChat(); }}>
          <nx-chat></nx-chat>
        </div>
      ` : nothing}
    </div>
  `;
}

export function renderListCol(vm) {
  const { catalogTab: tab } = vm;
  const showSearch = [TAB_SKILLS, TAB_PROMPTS, TAB_MCPS].includes(tab);

  return html`
    <div class="col col-list" role="region" aria-label="Catalog">
      <div class="list-header">
        <nx-tabs
          .items=${CATALOG_TABS}
          .active=${tab}
          @tab-change=${(e) => vm.onTabChange(e.detail.id)}
        ></nx-tabs>
        <div class="list-actions-row">
          ${TAB_ACTIONS[tab] ? html`
            <button type="button" class="new-btn"
              @click=${() => {
                const { opener } = TAB_ACTIONS[tab];
                if (typeof vm[opener] === 'function') vm[opener]();
              }}
            >${TAB_ACTIONS[tab].btnLabel}</button>
          ` : nothing}
          <button type="button"
            class="chat-toggle-btn ${vm.isChatOpen ? 'is-active' : ''}"
            aria-label="${vm.isChatOpen ? 'Close chat' : 'Open chat'}"
            aria-pressed="${vm.isChatOpen}"
            @click=${() => vm.onToggleChat()}
          >${vm.isChatOpen ? 'Close Chat' : 'Chat'}</button>
        </div>
      </div>
      ${showSearch ? html`
        <div class="list-search">
          <input
            type="search"
            placeholder="Search…"
            aria-label="Search list"
            .value=${vm.promptSearch}
            @input=${(e) => vm.setPromptSearch(e.target.value)}
          >
        </div>
      ` : nothing}
      <div class="catalog-scroll">
        ${tab === TAB_SKILLS ? renderSkillsCatalog(vm) : nothing}
        ${tab === TAB_AGENTS ? renderAgentsCatalog(vm) : nothing}
        ${tab === TAB_PROMPTS ? renderPromptsCatalog(vm) : nothing}
        ${tab === TAB_MCPS ? renderMcpsCatalog(vm) : nothing}
        ${tab === TAB_MEMORY ? html`<div class="empty">Memory is shown in the panel →</div>` : nothing}
      </div>
    </div>
  `;
}

export function renderEditorPanel(vm) {
  const tab = vm.catalogTab;
  const isSkill = tab === TAB_SKILLS;
  const isPrompt = tab === TAB_PROMPTS;
  const isMcp = tab === TAB_MCPS;
  const isAgent = tab === TAB_AGENTS;
  const isMemory = tab === TAB_MEMORY;

  const title = editorTitle(vm, tab);

  return html`
    <div class="col-editor" aria-hidden=${vm.isEditorOpen ? 'false' : 'true'}
      ?inert=${!vm.isEditorOpen}>
      <div class="col-editor-inner">
        ${vm.isEditorOpen ? html`
          <div class="editor-header">
            <h3 class="editor-title">${title}</h3>
            <button type="button" class="btn-icon close-btn" aria-label="Close"
              @click=${() => vm.onCloseEditor()}
            >✕</button>
          </div>
          ${vm.isFormDirty ? html`
            <div class="dirty-notice" role="status">Unsaved edits · save to persist</div>
          ` : nothing}
          <div class="editor-body ${isMemory ? 'editor-body-memory' : ''}">
            ${isSkill ? renderSkillForm(vm) : nothing}
            ${isAgent && vm.isAgentViewTools ? renderAssociatedToolsSelector(vm) : nothing}
            ${isAgent && !vm.isAgentViewTools ? renderAgentForm(vm) : nothing}
            ${isPrompt ? renderPromptForm(vm) : nothing}
            ${isMcp && (vm.editingMcpKey || !vm.viewingMcpServerId)
              ? renderMcpForm(vm) : nothing}
            ${isMcp && vm.viewingMcpServerId && !vm.editingMcpKey
              ? renderMcpServerInfo(vm) : nothing}
            ${isMcp && (vm.viewingMcpServerId || vm.editingMcpKey)
              ? renderMcpToolsList(vm) : nothing}
            ${isMemory ? html`
              <p class="form-hint">.da/agent/memory.md</p>
              ${renderMemoryContent(vm)}
            ` : nothing}
          </div>
          ${(isSkill || (isAgent && !vm.isAgentViewTools) || isPrompt
            || (isMcp && (!vm.viewingMcpServerId || vm.editingMcpKey))) ? html`
            <div class="editor-footer">
              ${renderEditorFooter(vm, tab)}
            </div>
          ` : nothing}
        ` : nothing}
      </div>
    </div>
  `;
}

export function renderSkillForm(vm) {
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <input
        type="text"
        placeholder="skill-id"
        aria-label="Skill ID"
        .value=${vm.formSkillId}
        ?readonly=${vm.isFormEdit}
        @input=${(e) => vm.setFormSkillId(e.target.value)}
      >
      <div class="textarea-wrap ${vm.hasSuggestion ? 'is-suggestion' : ''}">
        <textarea
          placeholder="Write or revise skill markdown"
          aria-label="Skill markdown"
          .value=${vm.formSkillBody}
          @input=${(e) => vm.setFormSkillBody(e.target.value)}
        ></textarea>
      </div>
    </form>
  `;
}

export function renderAgentForm(vm) {
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <p class="form-hint">Creates <code>/.da/agents/&lt;id&gt;.json</code></p>
      <input
        type="text"
        placeholder="agent-id"
        aria-label="Agent ID"
        .value=${vm.newAgentId}
        @input=${(e) => vm.setNewAgentId(e.target.value)}
      >
      <input
        type="text"
        placeholder="Display name"
        aria-label="Agent display name"
        .value=${vm.newAgentName}
        @input=${(e) => vm.setNewAgentName(e.target.value)}
      >
    </form>
  `;
}

export function renderPromptForm(vm) {
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <input type="text" placeholder="Title" aria-label="Prompt title"
        .value=${vm.formPromptTitle}
        @input=${(e) => vm.setFormPromptTitle(e.target.value)}
      >
      <input type="text" placeholder="Category (e.g. Review, Workflow…)" aria-label="Prompt category"
        list="category-list"
        .value=${vm.formPromptCategory}
        @input=${(e) => vm.setFormPromptCategory(e.target.value)}
      >
      <input type="url" placeholder="Icon URL" aria-label="Prompt icon URL"
        .value=${vm.formPromptIcon}
        @input=${(e) => vm.setFormPromptIcon(e.target.value)}
      >
      <datalist id="category-list">
        ${CATEGORY_OPTIONS.map((c) => html`<option value=${c}></option>`)}
      </datalist>
      <div class="textarea-wrap">
        <textarea
          placeholder="Write your prompt…"
          aria-label="Prompt body"
          .value=${vm.formPromptBody}
          @input=${(e) => vm.setFormPromptBody(e.target.value)}
        ></textarea>
      </div>
    </form>
  `;
}

export function renderAssociatedToolsSelector(vm) {
  const builtIn = BUILTIN_TOOL_IDS;
  const mcpToolIds = [];
  if (vm.mcpTools?.servers) {
    vm.mcpTools.servers.forEach((server) => {
      (server.tools || []).forEach((tool) => {
        mcpToolIds.push(`mcp__${server.id}__${tool.name}`);
      });
    });
  }

  const toolFilter = (vm.toolsSearch || '').trim().toLowerCase();
  const filterById = (id) => id.toLowerCase().includes(toolFilter);
  const daTools = toolFilter ? builtIn.filter(filterById) : builtIn;
  const mcpTools = toolFilter ? mcpToolIds.filter(filterById) : mcpToolIds;
  const selected = new Set(vm.formPromptTools || []);
  const collapsed = vm.toolsGroupCollapsed || {};

  const renderGroup = (ns, tools) => {
    if (!tools.length && !toolFilter) return nothing;
    const isOpen = !collapsed[ns];
    return html`
      <details class="tools-group" ?open=${isOpen}
        @toggle=${(e) => vm.setToolsGroupCollapsed(ns, !e.target.open)}
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
                      const prevTools = vm.formPromptTools ? [...vm.formPromptTools] : [];
                      const next = new Set(prevTools);
                      if (e.target.checked) next.add(toolId);
                      else next.delete(toolId);
                      vm.setFormPromptTools([...next]);
                      const { serverId, toolName } = vm.parseToolId(toolId);
                      vm.onToggleToolEnabled(serverId, toolName, e.target.checked, () => {
                        vm.setFormPromptTools(prevTools);
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
        placeholder="Filter tools…"
        aria-label="Filter tools"
        .value=${vm.toolsSearch}
        @input=${(e) => vm.setToolsSearch(e.target.value)}
      >
      ${renderGroup('DA', daTools)}
      ${mcpTools.length || toolFilter ? renderGroup('MCP', mcpTools) : nothing}
    </div>
  `;
}

export function renderMcpForm(vm) {
  const hasSecret = Boolean(String(vm.mcpAuthHeaderValue || '').trim());
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <input type="text" placeholder="server-id (not API key)" aria-label="MCP server id"
        .value=${vm.mcpKey}
        ?readonly=${Boolean(vm.editingMcpKey)}
        @input=${(e) => vm.setMcpKey(e.target.value)}
      >
      <p class="form-hint">Identifier only. Do not paste secrets or API keys here.</p>
      <input type="text" placeholder="SSE endpoint URL" aria-label="MCP server URL"
        .value=${vm.mcpUrl}
        @input=${(e) => vm.setMcpUrl(e.target.value)}
      >
      <textarea
        class="textarea-sm"
        placeholder="Description — what this server does (optional)"
        aria-label="MCP server description"
        .value=${vm.mcpDescription}
        @input=${(e) => vm.setMcpDescription(e.target.value)}
      ></textarea>
      <div class="mcp-auth-section ${hasSecret ? 'is-sensitive' : ''}">
        <p class="form-hint">Authentication header (optional, for private MCP servers)</p>
        <input
          type="text"
          placeholder="Header name (e.g. Authorization, x-api-key)"
          aria-label="MCP auth header name"
          .value=${vm.mcpAuthHeaderName}
          @input=${(e) => vm.setMcpAuthHeaderName(e.target.value)}
        >
        <input
          type="password"
          autocomplete="new-password"
          placeholder="Header value"
          aria-label="MCP auth header value"
          .value=${vm.mcpAuthHeaderValue}
          @input=${(e) => vm.setMcpAuthHeaderValue(e.target.value)}
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

export function renderMcpServerInfo(vm) {
  const serverId = vm.viewingMcpServerId;
  const builtin = BUILTIN_MCP_SERVERS.find((s) => s.id === serverId);
  if (!builtin) return nothing;
  return html`
    <div class="mcp-server-info">
      <p class="mcp-server-desc">${builtin.description}</p>
      <span class="badge">built-in</span>
    </div>
  `;
}

export function renderMcpToolsList(vm) {
  const serverId = vm.viewingMcpServerId || vm.editingMcpKey;
  if (!serverId) return nothing;

  const { tools, error, source } = mcpServerToolData(vm, serverId);

  const overrides = vm.toolOverrides || {};
  const filterQ = (vm.toolsSearch || '').trim().toLowerCase();
  const filtered = filterQ
    ? tools.filter((t) => t.name.toLowerCase().includes(filterQ)
      || t.description.toLowerCase().includes(filterQ))
    : tools;

  const emptyMsg = () => {
    if (source === 'pending') return 'Connecting to agent to discover tools…';
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
                vm.setMcpUrl(hint);
                vm.onSetStatus(`URL updated to ${hint} — save to apply`, STATUS_TYPE.WARN);
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
          placeholder="Filter tools…" aria-label="Filter tools"
          .value=${vm.toolsSearch}
          @input=${(e) => vm.setToolsSearch(e.target.value)}
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
                      @change=${(e) => vm.onToggleToolEnabled(serverId, t.name, e.target.checked)}
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

export function renderEditorFooter(vm, tab) {
  const isSkill = tab === TAB_SKILLS;
  const isPrompt = tab === TAB_PROMPTS;
  const isMcp = tab === TAB_MCPS;
  const isAgent = tab === TAB_AGENTS;
  const statusTpl = vm.statusMsg ? html`
    <output class="msg ${msgClass(vm.statusType)}">
      ${vm.statusMsg}
    </output>
  ` : nothing;

  if (isSkill) {
    return html`
      <div class="editor-actions" role="toolbar" aria-label="Skill actions">
        ${vm.isFormEdit || vm.hasSuggestion ? html`
          <button type="button" data-variant="secondary"
            ?disabled=${vm.isSaveBusy}
            @click=${() => vm.onDismissForm()}
          >Dismiss</button>
        ` : nothing}
        <button type="button" data-variant="secondary"
          ?disabled=${vm.isSaveBusy}
          @click=${() => vm.onSaveSkill(STATUS.DRAFT)}
        >Save Draft</button>
        <button type="button" data-variant="accent"
          ?disabled=${vm.isSaveBusy}
          @click=${() => vm.onSaveSkill(STATUS.APPROVED)}
        >Save</button>
        ${vm.isFormEdit ? html`
          <button type="button" data-variant="negative"
            ?disabled=${vm.isSaveBusy}
            @click=${vm.onDeleteSkill}
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
          ?disabled=${vm.isSaveBusy || !vm.newAgentId.trim()}
          @click=${vm.onSaveAgent}
        >Save Agent File</button>
      </div>
      ${statusTpl}
    `;
  }

  if (isPrompt) {
    return html`
      <div class="editor-actions" role="toolbar" aria-label="Prompt actions">
        <button type="button" data-variant="secondary"
          ?disabled=${vm.isSaveBusy}
          @click=${() => vm.onSavePrompt(STATUS.DRAFT)}
        >Save Draft</button>
        <button type="button" data-variant="accent"
          ?disabled=${vm.isSaveBusy}
          @click=${() => vm.onSavePrompt(STATUS.APPROVED)}
        >Save</button>
        <button type="button" data-variant="secondary"
          ?disabled=${vm.isSaveBusy || !vm.formPromptBody.trim()}
          @click=${() => {
            vm.onDispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT, vm.formPromptBody);
            vm.onDispatchPromptToChat(DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT, vm.formPromptBody);
          }}
        >Add to Chat</button>
        <button type="button" data-variant="secondary"
          ?disabled=${vm.isSaveBusy || !vm.formPromptBody.trim()}
          @click=${() => vm.onRunPrompt()}
        >Run / Test</button>
        ${vm.isFormPromptEdit ? html`
          <button type="button" data-variant="negative"
            ?disabled=${vm.isSaveBusy}
            @click=${vm.onDeletePrompt}
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
          ?disabled=${vm.isSaveBusy || !vm.mcpKey.trim() || !vm.mcpUrl.trim()}
          @click=${vm.onRegisterMcp}
        >${vm.editingMcpKey ? 'Update' : 'Register'}</button>
      </div>
      ${statusTpl}
    `;
  }

  return nothing;
}

export function renderSkillsCatalog(vm) {
  const ids = Object.keys(vm.skills);
  const searchQuery = vm.promptSearch.trim().toLowerCase();

  let filtered = vm.catalogFilter === 'all' ? ids
    : ids.filter((id) => vm.skillStatuses[id] === vm.catalogFilter);

  if (searchQuery) {
    filtered = filtered.filter((id) => {
      const title = extractTitle(vm.skills[id]).toLowerCase();
      return id.toLowerCase().includes(searchQuery) || title.includes(searchQuery);
    });
  }

  return html`
    <div class="catalog-toolbar" role="toolbar" aria-label="Filter skills">
      ${[STATUS.APPROVED, STATUS.DRAFT].map((status) => html`
        <button type="button"
          class="filter-chip ${vm.catalogFilter === status ? 'is-active' : ''}"
          aria-pressed=${vm.catalogFilter === status ? 'true' : 'false'}
          @click=${() => vm.setCatalogFilter(status)}
        >${status.charAt(0).toUpperCase() + status.slice(1)}</button>
      `)}
      <button type="button"
        class="filter-chip ${vm.catalogFilter === 'all' ? 'is-active' : ''}"
        aria-pressed=${vm.catalogFilter === 'all' ? 'true' : 'false'}
        @click=${() => vm.setCatalogFilter('all')}
      >All</button>
    </div>
    ${!filtered.length
      ? html`<div class="empty">No skills found</div>`
      : filtered.map((id) => renderSkillCard(vm, id))}
  `;
}

export function renderAgentsCatalog(vm) {
  return html`
    <h3 class="section-h">Built-in (${BUILTIN_AGENTS.length})</h3>
    ${BUILTIN_AGENTS.map((agent) => renderAgentCard(vm, agent, true))}
    ${vm.agents.length ? html`
      <h3 class="section-h">Custom (${vm.agents.length})</h3>
      ${vm.agents.map((agent) => renderAgentCard(vm, agent, false))}
    ` : nothing}
    ${vm.agentRows.length ? html`
      <h3 class="section-h">Config Agents (${vm.agentRows.length})</h3>
      ${vm.agentRows.map((row) => html`
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

export function renderPromptsCatalog(vm) {
  const searchQuery = vm.promptSearch.trim().toLowerCase();
  const prompts = searchQuery
    ? vm.prompts.filter((r) => (r.title || '').toLowerCase().includes(searchQuery)
      || (r.category || '').toLowerCase().includes(searchQuery))
    : vm.prompts;

  if (!prompts.length) {
    return html`<div class="empty">No prompts found</div>`;
  }

  return html`
    <div role="list" aria-label="Prompts">
      ${prompts.map((row) => {
        const title = row.title || '';
        const isSelected = vm.isEditorOpen && vm.isFormPromptEdit
          && vm.formPromptTitle === title;
        const cat = (row.category || '').toLowerCase().trim();
        const catClass = KNOWN_CATEGORY_CLASSES.has(cat) ? cat : 'default';
        return html`
          <article role="listitem" data-testid="prompt-card" data-prompt-title=${title}>
            <div class="prompt-row ${isSelected ? 'is-selected' : ''}" role="button"
              tabindex="0"
              aria-label="Edit prompt ${title || '(untitled)'}"
              @click=${(e) => vm.onCardClick(e, () => vm.onOpenEditor(row))}
              @keydown=${(e) => vm.onCardKeydown(e, () => vm.onOpenEditor(row))}
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
                  @click=${(e) => { e.stopPropagation(); vm.onOpenEditor(row); }}
                >✎</button>
                <button type="button" class="btn-icon row-action-btn" title="Duplicate"
                  aria-label="Duplicate ${title}"
                  @click=${(e) => { e.stopPropagation(); vm.onDuplicatePrompt(row); }}
                >⧉</button>
                <button type="button" class="btn-icon row-action-btn" title="Add to chat"
                  aria-label="Add to chat: ${title}"
                  @click=${(e) => {
                    e.stopPropagation();
                    vm.onDispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT, row.prompt);
                    vm.onDispatchPromptToChat(DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT, row.prompt);
                  }}
                >+</button>
                <button type="button" class="btn-icon row-action-btn" title="Send to chat"
                  aria-label="Send to chat: ${title}"
                  @click=${(e) => {
                    e.stopPropagation();
                    vm.onDispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_SEND, row.prompt);
                    vm.onDispatchPromptToChat(DA_SKILLS_LAB_PROMPT_SEND, row.prompt);
                  }}
                >▶</button>
                <button type="button" class="btn-icon row-action-btn row-action-btn-delete" title="Delete"
                  aria-label="Delete ${title}"
                  @click=${(e) => { e.stopPropagation(); vm.onDeletePromptDirect(row); }}
                >🗑</button>
              </div>
            </div>
          </article>
        `;
      })}
    </div>
  `;
}

export function renderMcpsCatalog(vm) {
  const searchQuery = vm.promptSearch.trim().toLowerCase();
  const filterPasses = (status) => vm.catalogFilter === 'all' || status === vm.catalogFilter;
  let filteredCustom = vm.mcpRows.filter((row) => filterPasses(skillRowStatus(row)));
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
        const isViewing = vm.viewingMcpServerId === s.id && !vm.editingMcpKey;
        return html`
          <article
            role="button"
            tabindex="0"
            aria-label="View tools for ${s.id}"
            data-testid="mcp-builtin-card"
            @click=${(e) => vm.onMcpCardClick(e, () => vm.onViewMcpTools(s.id))}
            @keydown=${(e) => vm.onMcpCardKeydown(e, () => vm.onViewMcpTools(s.id))}
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
        const isBusy = vm.mcpEnableBusy[token];
        const isSelected = vm.isEditorOpen
          && (vm.editingMcpKey === key || vm.viewingMcpServerId === key);
        return html`
          <article
            role="button"
            tabindex="0"
            aria-label="Edit MCP server ${key || '(unnamed)'}"
            data-testid="mcp-card"
            data-mcp-key=${key}
            @click=${(e) => vm.onMcpCardClick(e, () => vm.onEditMcp(row))}
            @keydown=${(e) => vm.onMcpCardKeydown(e, () => vm.onEditMcp(row))}
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
                @click=${(e) => { e.stopPropagation(); vm.onOpenMcpMenu(e, key); }}
              >⋮</button>
            </nx-card>
            <nx-popover placement="auto">
              <div class="card-menu" role="menu"
                @click=${(e) => e.stopPropagation()}>
                ${isApproved ? html`
                  <button role="menuitem" type="button"
                    ?disabled=${isBusy}
                    @click=${() => { vm.onCloseMcpMenu(key); vm.onToggleMcpEnabled(row); }}
                  >${isEnabled ? 'Disable' : 'Enable'}</button>
                ` : nothing}
                <button role="menuitem" type="button"
                  @click=${() => { vm.onCloseMcpMenu(key); vm.onEditMcp(row); }}
                >Edit</button>
                <button role="menuitem" type="button" class="card-menu-delete"
                  @click=${() => { vm.onCloseMcpMenu(key); vm.onDeleteMcpDirect(row); }}
                >Delete</button>
              </div>
            </nx-popover>
          </article>
        `;
      })}
  `;
}

export function renderMemoryContent(vm) {
  if (vm.memory === null) {
    return html`<div class="empty" aria-live="polite">Loading…</div>`;
  }
  if (vm.memory === '') {
    return html`<div class="empty">No project memory yet. The DA agent writes here as it learns about your site.</div>`;
  }
  return html`<pre class="memory-content">${vm.memory}</pre>`;
}
