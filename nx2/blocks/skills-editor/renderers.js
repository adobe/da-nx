import { html, nothing } from 'da-lit';
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

export function extractTitle(md) {
  if (!md) return '';
  const match = md.match(/^#\s+(.+)/m);
  return match ? match[1].trim() : '';
}

function msgClass(host) {
  if (host._statusType === STATUS_TYPE.ERR) return 'msg-err';
  if (host._statusType === STATUS_TYPE.WARN) return 'msg-warn';
  return 'msg-ok';
}

function editorTitle(host, tab) {
  if (tab === TAB_AGENTS && host._isAgentViewTools) return 'Associated Tools';
  if (tab === TAB_AGENTS) return host._isFormEdit ? 'Edit Agent' : 'New Agent';
  if (tab === TAB_SKILLS) return host._isFormEdit ? 'Edit Skill' : 'New Skill';
  if (tab === TAB_PROMPTS) return host._isFormPromptEdit ? 'Edit Prompt' : 'New Prompt';
  if (tab === TAB_MCPS) {
    if (host._viewingMcpServerId && !host._editingMcpKey) return host._viewingMcpServerId;
    if (host._editingMcpKey) return `Edit: ${host._editingMcpKey}`;
    return 'Register MCP Server';
  }
  if (tab === TAB_MEMORY) return 'Project Memory';
  return '';
}

function mcpServerToolData(host, serverId) {
  const builtinList = BUILTIN_TOOL_DETAILS[serverId];
  if (builtinList) return { tools: builtinList, error: null, source: 'builtin' };

  if (!host._mcpTools) return { tools: [], error: null, source: 'pending' };

  const server = (host._mcpTools.servers || []).find((s) => s.id === serverId);
  if (!server) {
    const isConfigured = Boolean(host._configuredMcpServers?.[serverId]);
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

function renderSkillCard(host, id) {
  const title = extractTitle(host._skills[id]);
  const status = host._skillStatuses[id] || STATUS.APPROVED;
  const isEditing = host._isFormEdit && host._formSkillId === id;
  const isDraft = status === STATUS.DRAFT;
  return html`
    <article
      role="button"
      tabindex="0"
      aria-label="Edit skill ${id}"
      data-testid="skill-card"
      data-skill-id=${id}
      @click=${(e) => host._onCardClick(e, () => host._onEditSkill(id))}
      @keydown=${(e) => host._onCardKeydown(e, () => host._onEditSkill(id))}
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
          @click=${(e) => { e.stopPropagation(); host._openSkillMenu(e, id); }}
        >⋮</button>
      </nx-card>
      <nx-popover placement="auto">
        <div class="card-menu" role="menu">
          <button role="menuitem" type="button"
            @click=${() => { host._closeSkillMenu(id); host._onEditSkill(id); }}
          >Edit</button>
          <button role="menuitem" type="button" class="card-menu-delete"
            @click=${() => { host._closeSkillMenu(id); host._onDeleteSkillById(id); }}
          >Delete</button>
        </div>
      </nx-popover>
    </article>
  `;
}

function renderAgentCard(host, agent, isBuiltin = false) {
  const title = agent.label || agent.name || agent.preset?.name || agent.id;
  const description = agent.description || agent.preset?.description || '';
  const tools = host._agentToolIds(agent, isBuiltin);
  return html`
    <article class="agent-card" role="button" tabindex="0"
      aria-label="Open agent ${title}"
      data-testid=${isBuiltin ? 'agent-builtin-card' : 'agent-card'}
      @click=${(e) => host._onCardClick(e, () => host._onSelectAgent(agent))}
      @keydown=${(e) => host._onCardKeydown(e, () => host._onSelectAgent(agent))}
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

export function renderChatDrawer(host) {
  return html`
    <div class="chat-drawer" aria-hidden=${host._isChatOpen ? 'false' : 'true'}
      ?inert=${!host._isChatOpen}>
      ${host._isChatOpen ? html`
        <div class="chat-drawer-header">
          <span class="chat-drawer-title">Chat</span>
          <button type="button" class="btn-icon close-btn" aria-label="Close chat"
            @click=${() => host._toggleChat()}
          >✕</button>
        </div>
        <div class="chat-drawer-body"
          @nx-panel-close=${(e) => { e.stopPropagation(); host._toggleChat(); }}>
          <nx-chat></nx-chat>
        </div>
      ` : nothing}
    </div>
  `;
}

export function renderListCol(host) {
  const tab = host._catalogTab;
  const showSearch = [TAB_SKILLS, TAB_PROMPTS, TAB_MCPS].includes(tab);

  return html`
    <div class="col col-list" role="region" aria-label="Catalog">
      <div class="list-header">
        <nx-tabs
          .items=${CATALOG_TABS}
          .active=${tab}
          @tab-change=${(e) => host._onTabChange(e.detail.id)}
        ></nx-tabs>
        <div class="list-actions-row">
          ${TAB_ACTIONS[tab] ? html`
            <button type="button" class="new-btn"
              @click=${() => {
                const { opener } = TAB_ACTIONS[tab];
                if (typeof host[opener] === 'function') host[opener]();
              }}
            >${TAB_ACTIONS[tab].btnLabel}</button>
          ` : nothing}
          <button type="button"
            class="chat-toggle-btn ${host._isChatOpen ? 'is-active' : ''}"
            aria-label="${host._isChatOpen ? 'Close chat' : 'Open chat'}"
            aria-pressed="${host._isChatOpen}"
            @click=${() => host._toggleChat()}
          >${host._isChatOpen ? 'Close Chat' : 'Chat'}</button>
        </div>
      </div>
      ${showSearch ? html`
        <div class="list-search">
          <input
            type="search"
            placeholder="Search…"
            aria-label="Search list"
            .value=${host._promptSearch}
            @input=${(e) => { host._promptSearch = e.target.value; }}
          >
        </div>
      ` : nothing}
      <div class="catalog-scroll">
        ${tab === TAB_SKILLS ? renderSkillsCatalog(host) : nothing}
        ${tab === TAB_AGENTS ? renderAgentsCatalog(host) : nothing}
        ${tab === TAB_PROMPTS ? renderPromptsCatalog(host) : nothing}
        ${tab === TAB_MCPS ? renderMcpsCatalog(host) : nothing}
        ${tab === TAB_MEMORY ? html`<div class="empty">Memory is shown in the panel →</div>` : nothing}
      </div>
    </div>
  `;
}

export function renderEditorPanel(host) {
  const tab = host._catalogTab;
  const isSkill = tab === TAB_SKILLS;
  const isPrompt = tab === TAB_PROMPTS;
  const isMcp = tab === TAB_MCPS;
  const isAgent = tab === TAB_AGENTS;
  const isMemory = tab === TAB_MEMORY;

  const title = editorTitle(host, tab);

  return html`
    <div class="col-editor" aria-hidden=${host._isEditorOpen ? 'false' : 'true'}
      ?inert=${!host._isEditorOpen}>
      <div class="col-editor-inner">
        ${host._isEditorOpen ? html`
          <div class="editor-header">
            <h3 class="editor-title">${title}</h3>
            <button type="button" class="btn-icon close-btn" aria-label="Close"
              @click=${() => host._closeEditor()}
            >✕</button>
          </div>
          ${host._isFormDirty ? html`
            <div class="dirty-notice" role="status">Unsaved edits · save to persist</div>
          ` : nothing}
          <div class="editor-body ${isMemory ? 'editor-body-memory' : ''}">
            ${isSkill ? renderSkillForm(host) : nothing}
            ${isAgent && host._isAgentViewTools ? renderAssociatedToolsSelector(host) : nothing}
            ${isAgent && !host._isAgentViewTools ? renderAgentForm(host) : nothing}
            ${isPrompt ? renderPromptForm(host) : nothing}
            ${isMcp && (host._editingMcpKey || !host._viewingMcpServerId)
              ? renderMcpForm(host) : nothing}
            ${isMcp && host._viewingMcpServerId && !host._editingMcpKey
              ? renderMcpServerInfo(host) : nothing}
            ${isMcp && (host._viewingMcpServerId || host._editingMcpKey)
              ? renderMcpToolsList(host) : nothing}
            ${isMemory ? html`
              <p class="form-hint">.da/agent/memory.md</p>
              ${renderMemoryContent(host)}
            ` : nothing}
          </div>
          ${(isSkill || (isAgent && !host._isAgentViewTools) || isPrompt
            || (isMcp && (!host._viewingMcpServerId || host._editingMcpKey))) ? html`
            <div class="editor-footer">
              ${renderEditorFooter(host, tab)}
            </div>
          ` : nothing}
        ` : nothing}
      </div>
    </div>
  `;
}

export function renderSkillForm(host) {
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <input
        type="text"
        placeholder="skill-id"
        aria-label="Skill ID"
        .value=${host._formSkillId}
        ?readonly=${host._isFormEdit}
        @input=${(e) => { host._formSkillId = e.target.value; host._markDirty(); }}
      >
      <div class="textarea-wrap ${host._hasSuggestion ? 'is-suggestion' : ''}">
        <textarea
          placeholder="Write or revise skill markdown"
          aria-label="Skill markdown"
          .value=${host._formSkillBody}
          @input=${(e) => { host._formSkillBody = e.target.value; host._markDirty(); }}
        ></textarea>
      </div>
    </form>
  `;
}

export function renderAgentForm(host) {
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <p class="form-hint">Creates <code>/.da/agents/&lt;id&gt;.json</code></p>
      <input
        type="text"
        placeholder="agent-id"
        aria-label="Agent ID"
        .value=${host._newAgentId}
        @input=${(e) => { host._newAgentId = e.target.value; host._markDirty(); }}
      >
      <input
        type="text"
        placeholder="Display name"
        aria-label="Agent display name"
        .value=${host._newAgentName}
        @input=${(e) => { host._newAgentName = e.target.value; host._markDirty(); }}
      >
    </form>
  `;
}

export function renderPromptForm(host) {
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <input type="text" placeholder="Title" aria-label="Prompt title"
        .value=${host._formPromptTitle}
        @input=${(e) => { host._formPromptTitle = e.target.value; host._markDirty(); }}
      >
      <input type="text" placeholder="Category (e.g. Review, Workflow…)" aria-label="Prompt category"
        list="category-list"
        .value=${host._formPromptCategory}
        @input=${(e) => { host._formPromptCategory = e.target.value; host._markDirty(); }}
      >
      <input type="url" placeholder="Icon URL" aria-label="Prompt icon URL"
        .value=${host._formPromptIcon}
        @input=${(e) => { host._formPromptIcon = e.target.value; host._markDirty(); }}
      >
      <datalist id="category-list">
        ${CATEGORY_OPTIONS.map((c) => html`<option value=${c}></option>`)}
      </datalist>
      <div class="textarea-wrap">
        <textarea
          placeholder="Write your prompt…"
          aria-label="Prompt body"
          .value=${host._formPromptBody}
          @input=${(e) => { host._formPromptBody = e.target.value; host._markDirty(); }}
        ></textarea>
      </div>
    </form>
  `;
}

export function renderAssociatedToolsSelector(host) {
  const builtIn = BUILTIN_TOOL_IDS;
  const mcpToolIds = [];
  if (host._mcpTools?.servers) {
    host._mcpTools.servers.forEach((server) => {
      (server.tools || []).forEach((tool) => {
        mcpToolIds.push(`mcp__${server.id}__${tool.name}`);
      });
    });
  }

  const toolFilter = (host._toolsSearch || '').trim().toLowerCase();
  const filterById = (id) => id.toLowerCase().includes(toolFilter);
  const daTools = toolFilter ? builtIn.filter(filterById) : builtIn;
  const mcpTools = toolFilter ? mcpToolIds.filter(filterById) : mcpToolIds;
  const selected = new Set(host._formPromptTools || []);
  const collapsed = host._toolsGroupCollapsed || {};

  const renderGroup = (ns, tools) => {
    if (!tools.length && !toolFilter) return nothing;
    const isOpen = !collapsed[ns];
    return html`
      <details class="tools-group" ?open=${isOpen}
        @toggle=${(e) => {
          host._toolsGroupCollapsed = { ...host._toolsGroupCollapsed, [ns]: !e.target.open };
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
                      const prevTools = host._formPromptTools ? [...host._formPromptTools] : [];
                      const next = new Set(prevTools);
                      if (e.target.checked) next.add(toolId);
                      else next.delete(toolId);
                      host._formPromptTools = [...next];
                      const { serverId, toolName } = host._parseToolId(toolId);
                      host._onToggleToolEnabled(serverId, toolName, e.target.checked, () => {
                        host._formPromptTools = prevTools;
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
        .value=${host._toolsSearch}
        @input=${(e) => { host._toolsSearch = e.target.value; }}
      >
      ${renderGroup('DA', daTools)}
      ${mcpTools.length || toolFilter ? renderGroup('MCP', mcpTools) : nothing}
    </div>
  `;
}

export function renderMcpForm(host) {
  const hasSecret = Boolean(String(host._mcpAuthHeaderValue || '').trim());
  return html`
    <form class="form" @submit=${(e) => e.preventDefault()}>
      <input type="text" placeholder="server-id (not API key)" aria-label="MCP server id"
        .value=${host._mcpKey}
        ?readonly=${Boolean(host._editingMcpKey)}
        @input=${(e) => { host._mcpKey = e.target.value; host._markDirty(); }}
      >
      <p class="form-hint">Identifier only. Do not paste secrets or API keys here.</p>
      <input type="text" placeholder="SSE endpoint URL" aria-label="MCP server URL"
        .value=${host._mcpUrl}
        @input=${(e) => { host._mcpUrl = e.target.value; host._markDirty(); }}
      >
      <textarea
        class="textarea-sm"
        placeholder="Description — what this server does (optional)"
        aria-label="MCP server description"
        .value=${host._mcpDescription}
        @input=${(e) => { host._mcpDescription = e.target.value; host._markDirty(); }}
      ></textarea>
      <div class="mcp-auth-section ${hasSecret ? 'is-sensitive' : ''}">
        <p class="form-hint">Authentication header (optional, for private MCP servers)</p>
        <input
          type="text"
          placeholder="Header name (e.g. Authorization, x-api-key)"
          aria-label="MCP auth header name"
          .value=${host._mcpAuthHeaderName}
          @input=${(e) => { host._mcpAuthHeaderName = e.target.value; host._markDirty(); }}
        >
        <input
          type="password"
          autocomplete="new-password"
          placeholder="Header value"
          aria-label="MCP auth header value"
          .value=${host._mcpAuthHeaderValue}
          @input=${(e) => { host._mcpAuthHeaderValue = e.target.value; host._markDirty(); }}
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

export function renderMcpServerInfo(host) {
  const serverId = host._viewingMcpServerId;
  const builtin = BUILTIN_MCP_SERVERS.find((s) => s.id === serverId);
  if (!builtin) return nothing;
  return html`
    <div class="mcp-server-info">
      <p class="mcp-server-desc">${builtin.description}</p>
      <span class="badge">built-in</span>
    </div>
  `;
}

export function renderMcpToolsList(host) {
  const serverId = host._viewingMcpServerId || host._editingMcpKey;
  if (!serverId) return nothing;

  const { tools, error, source } = mcpServerToolData(host, serverId);

  const overrides = host._toolOverrides || {};
  const filterQ = (host._toolsSearch || '').trim().toLowerCase();
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
                host._mcpUrl = hint;
                host._setStatus(`URL updated to ${hint} — save to apply`, STATUS_TYPE.WARN);
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
          .value=${host._toolsSearch}
          @input=${(e) => { host._toolsSearch = e.target.value; }}
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
                      @change=${(e) => host._onToggleToolEnabled(serverId, t.name, e.target.checked)}
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

export function renderEditorFooter(host, tab) {
  const isSkill = tab === TAB_SKILLS;
  const isPrompt = tab === TAB_PROMPTS;
  const isMcp = tab === TAB_MCPS;
  const isAgent = tab === TAB_AGENTS;
  const statusTpl = host._statusMsg ? html`
    <output class="msg ${msgClass(host)}">
      ${host._statusMsg}
    </output>
  ` : nothing;

  if (isSkill) {
    return html`
      <div class="editor-actions" role="toolbar" aria-label="Skill actions">
        ${host._isFormEdit || host._hasSuggestion ? html`
          <button type="button" data-variant="secondary"
            ?disabled=${host._isSaveBusy}
            @click=${() => { host._dismissForm(); }}
          >Dismiss</button>
        ` : nothing}
        <button type="button" data-variant="secondary"
          ?disabled=${host._isSaveBusy}
          @click=${() => host._onSaveSkill(STATUS.DRAFT)}
        >Save Draft</button>
        <button type="button" data-variant="accent"
          ?disabled=${host._isSaveBusy}
          @click=${() => host._onSaveSkill(STATUS.APPROVED)}
        >Save</button>
        ${host._isFormEdit ? html`
          <button type="button" data-variant="negative"
            ?disabled=${host._isSaveBusy}
            @click=${host._onDeleteSkill}
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
          ?disabled=${host._isSaveBusy || !host._newAgentId.trim()}
          @click=${host._onSaveAgent}
        >Save Agent File</button>
      </div>
      ${statusTpl}
    `;
  }

  if (isPrompt) {
    return html`
      <div class="editor-actions" role="toolbar" aria-label="Prompt actions">
        <button type="button" data-variant="secondary"
          ?disabled=${host._isSaveBusy}
          @click=${() => host._onSavePrompt(STATUS.DRAFT)}
        >Save Draft</button>
        <button type="button" data-variant="accent"
          ?disabled=${host._isSaveBusy}
          @click=${() => host._onSavePrompt(STATUS.APPROVED)}
        >Save</button>
        <button type="button" data-variant="secondary"
          ?disabled=${host._isSaveBusy || !host._formPromptBody.trim()}
          @click=${() => {
            host._dispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT, host._formPromptBody);
            host._dispatchPromptToChat(DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT, host._formPromptBody);
          }}
        >Add to Chat</button>
        <button type="button" data-variant="secondary"
          ?disabled=${host._isSaveBusy || !host._formPromptBody.trim()}
          @click=${() => host._onRunPrompt()}
        >Run / Test</button>
        ${host._isFormPromptEdit ? html`
          <button type="button" data-variant="negative"
            ?disabled=${host._isSaveBusy}
            @click=${host._onDeletePrompt}
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
          ?disabled=${host._isSaveBusy || !host._mcpKey.trim() || !host._mcpUrl.trim()}
          @click=${host._onRegisterMcp}
        >${host._editingMcpKey ? 'Update' : 'Register'}</button>
      </div>
      ${statusTpl}
    `;
  }

  return nothing;
}

export function renderSkillsCatalog(host) {
  const ids = Object.keys(host._skills);
  const searchQuery = host._promptSearch.trim().toLowerCase();

  let filtered = host._catalogFilter === 'all' ? ids
    : ids.filter((id) => host._skillStatuses[id] === host._catalogFilter);

  if (searchQuery) {
    filtered = filtered.filter((id) => {
      const title = extractTitle(host._skills[id]).toLowerCase();
      return id.toLowerCase().includes(searchQuery) || title.includes(searchQuery);
    });
  }

  return html`
    <div class="catalog-toolbar" role="toolbar" aria-label="Filter skills">
      ${[STATUS.APPROVED, STATUS.DRAFT].map((status) => html`
        <button type="button"
          class="filter-chip ${host._catalogFilter === status ? 'is-active' : ''}"
          aria-pressed=${host._catalogFilter === status ? 'true' : 'false'}
          @click=${() => { host._catalogFilter = status; }}
        >${status.charAt(0).toUpperCase() + status.slice(1)}</button>
      `)}
      <button type="button"
        class="filter-chip ${host._catalogFilter === 'all' ? 'is-active' : ''}"
        aria-pressed=${host._catalogFilter === 'all' ? 'true' : 'false'}
        @click=${() => { host._catalogFilter = 'all'; }}
      >All</button>
    </div>
    ${!filtered.length
      ? html`<div class="empty">No skills found</div>`
      : filtered.map((id) => renderSkillCard(host, id))}
  `;
}

export function renderAgentsCatalog(host) {
  return html`
    <h3 class="section-h">Built-in (${BUILTIN_AGENTS.length})</h3>
    ${BUILTIN_AGENTS.map((agent) => renderAgentCard(host, agent, true))}
    ${host._agents.length ? html`
      <h3 class="section-h">Custom (${host._agents.length})</h3>
      ${host._agents.map((agent) => renderAgentCard(host, agent, false))}
    ` : nothing}
    ${host._agentRows.length ? html`
      <h3 class="section-h">Config Agents (${host._agentRows.length})</h3>
      ${host._agentRows.map((row) => html`
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

export function renderPromptsCatalog(host) {
  const searchQuery = host._promptSearch.trim().toLowerCase();
  const prompts = searchQuery
    ? host._prompts.filter((r) => (r.title || '').toLowerCase().includes(searchQuery)
      || (r.category || '').toLowerCase().includes(searchQuery))
    : host._prompts;

  if (!prompts.length) {
    return html`<div class="empty">No prompts found</div>`;
  }

  return html`
    <div role="list" aria-label="Prompts">
      ${prompts.map((row) => {
        const title = row.title || '';
        const isSelected = host._isEditorOpen && host._isFormPromptEdit
          && host._formPromptTitle === title;
        const cat = (row.category || '').toLowerCase().trim();
        const catClass = KNOWN_CATEGORY_CLASSES.has(cat) ? cat : 'default';
        return html`
          <article role="listitem" data-testid="prompt-card" data-prompt-title=${title}>
            <div class="prompt-row ${isSelected ? 'is-selected' : ''}" role="button"
              tabindex="0"
              aria-label="Edit prompt ${title || '(untitled)'}"
              @click=${(e) => host._onCardClick(e, () => host._openEditor(row))}
              @keydown=${(e) => host._onCardKeydown(e, () => host._openEditor(row))}
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
                  @click=${(e) => { e.stopPropagation(); host._openEditor(row); }}
                >✎</button>
                <button type="button" class="btn-icon row-action-btn" title="Duplicate"
                  aria-label="Duplicate ${title}"
                  @click=${(e) => { e.stopPropagation(); host._duplicatePrompt(row); }}
                >⧉</button>
                <button type="button" class="btn-icon row-action-btn" title="Add to chat"
                  aria-label="Add to chat: ${title}"
                  @click=${(e) => {
                    e.stopPropagation();
                    host._dispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_ADD_TO_CHAT, row.prompt);
                    host._dispatchPromptToChat(DA_SKILLS_LAB_PROMPT_ADD_TO_CHAT, row.prompt);
                  }}
                >+</button>
                <button type="button" class="btn-icon row-action-btn" title="Send to chat"
                  aria-label="Send to chat: ${title}"
                  @click=${(e) => {
                    e.stopPropagation();
                    host._dispatchPromptToChat(DA_SKILLS_EDITOR_PROMPT_SEND, row.prompt);
                    host._dispatchPromptToChat(DA_SKILLS_LAB_PROMPT_SEND, row.prompt);
                  }}
                >▶</button>
                <button type="button" class="btn-icon row-action-btn row-action-btn-delete" title="Delete"
                  aria-label="Delete ${title}"
                  @click=${(e) => { e.stopPropagation(); host._deletePromptDirect(row); }}
                >🗑</button>
              </div>
            </div>
          </article>
        `;
      })}
    </div>
  `;
}

export function renderMcpsCatalog(host) {
  const searchQuery = host._promptSearch.trim().toLowerCase();
  const filterPasses = (status) => host._catalogFilter === 'all' || status === host._catalogFilter;
  let filteredCustom = host._mcpRows.filter((row) => filterPasses(skillRowStatus(row)));
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
        const isViewing = host._viewingMcpServerId === s.id && !host._editingMcpKey;
        return html`
          <article
            role="button"
            tabindex="0"
            aria-label="View tools for ${s.id}"
            data-testid="mcp-builtin-card"
            @click=${(e) => host._onMcpCardClick(e, () => host._onViewMcpTools(s.id))}
            @keydown=${(e) => host._onMcpCardKeydown(e, () => host._onViewMcpTools(s.id))}
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
        const isBusy = host._mcpEnableBusy[token];
        const isSelected = host._isEditorOpen
          && (host._editingMcpKey === key || host._viewingMcpServerId === key);
        return html`
          <article
            role="button"
            tabindex="0"
            aria-label="Edit MCP server ${key || '(unnamed)'}"
            data-testid="mcp-card"
            data-mcp-key=${key}
            @click=${(e) => host._onMcpCardClick(e, () => host._onEditMcp(row))}
            @keydown=${(e) => host._onMcpCardKeydown(e, () => host._onEditMcp(row))}
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
                @click=${(e) => { e.stopPropagation(); host._openMcpMenu(e, key); }}
              >⋮</button>
            </nx-card>
            <nx-popover placement="auto">
              <div class="card-menu" role="menu"
                @click=${(e) => e.stopPropagation()}>
                ${isApproved ? html`
                  <button role="menuitem" type="button"
                    ?disabled=${isBusy}
                    @click=${() => { host._closeMcpMenu(key); host._onToggleMcpEnabled(row); }}
                  >${isEnabled ? 'Disable' : 'Enable'}</button>
                ` : nothing}
                <button role="menuitem" type="button"
                  @click=${() => { host._closeMcpMenu(key); host._onEditMcp(row); }}
                >Edit</button>
                <button role="menuitem" type="button" class="card-menu-delete"
                  @click=${() => { host._closeMcpMenu(key); host._onDeleteMcpDirect(row); }}
                >Delete</button>
              </div>
            </nx-popover>
          </article>
        `;
      })}
  `;
}

export function renderMemoryContent(host) {
  if (host._memory === null) {
    return html`<div class="empty" aria-live="polite">Loading…</div>`;
  }
  if (host._memory === '') {
    return html`<div class="empty">No project memory yet. The DA agent writes here as it learns about your site.</div>`;
  }
  return html`<pre class="memory-content">${host._memory}</pre>`;
}
