import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import { buildAttachmentItems } from '../shared/chat/files.js';
import '../shared/menu/menu.js';
import ChatBackend from './chat-backend.js';
import { renderMessage } from './renderers/renderers.js';
import { renderToolCard } from './renderers/card-renderers.js';
import { renderNewerEpisodeBanner, renderUiArtifact } from './ao/ao-renderers.js';
import '../shared/chat/new-chat/new-chat.js';
import '../shared/chat/prompts/prompts.js';
import '../shared/pills/pills.js';
import './interaction/interaction.js';
import { loadSiteConfig } from './utils/api.js';
import { isCoworkerEnabled } from '../../utils/ewFlags.js';
import { getConfig } from '../../scripts/nx.js';
import { buildAttachmentPayload, buildSlashMessage } from './utils/chat-helpers.js';
import { PANEL_EVENT } from '../../utils/panel.js';
import { CHAT_EVENT } from '../../utils/chat.js';
import { createFileDropHandlers } from '../shared/chat/dnd.js';
import { openPopoverAbove } from '../shared/chat/positioning.js';
import { ADD_MENU_ITEMS, ADOBE_AI_GUIDELINES_URL, ICON_NAMES, MENU_OPTIONS } from '../shared/chat/constants.js';
import { ROLE } from './constants.js';

const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

const icon = (name) => html`<svg class="chat-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${ICON_NAMES[name]}.svg#icon"></use></svg>`;

function isAllowedFile(file) {
  return file.type?.startsWith('image/')
    || file.type === 'application/pdf'
    || file.type === 'text/markdown'
    || file.name?.endsWith('.md');
}

class NxChat extends LitElement {
  static properties = {
    messages: { type: Array },
    thinking: { type: Boolean },
    connected: { type: Boolean },
    toolCards: { type: Object },
    // Discriminated union { type: 'approval'|'question'|'plan', ... } | null — see
    // chat-backend.js#_normalize. Populated for both backends, since approval is
    // da-agent's one turn-suspension concept too; question/plan never occur there.
    pendingInteraction: { type: Object },
    // AO-only — always undefined on the da-agent path, since it has no equivalent.
    newerEpisodeAvailable: { type: Object },
    // Resolved async from the `ew.coworker` site flag once org/site are known (see
    // _ensureController) — undefined/false until then, which also means MENU_ITEMS
    // renders as the full (da-agent) list during that brief window.
    _useCoworker: { state: true },
    _prompts: { state: true },
    _hasItems: { state: true },
    _dragging: { state: true },
  };

  set context(value) {
    this._explicitContext = true;
    this._applyContext(value);
  }

  setPrompt(text, { autoSend = false } = {}) {
    if (this.connected) {
      this._sendPrompt(text, { autoSend });
    } else {
      this._pendingPrompt = { text, autoSend };
    }
  }

  addAttachment(item) {
    this.shadowRoot.querySelector('nx-pills')?.add(item);
  }

  _onPillsChange({ detail: { items } }) {
    this._hasItems = items.length > 0;
  }

  _applyContext(value) {
    this._context = value;
    if (this._controller) {
      this._controller.setContext(value);
    } else {
      this._ensureController(value);
    }
    this.shadowRoot.querySelector('nx-pills')?.dropKeyed();
    this._loadConfig();
    this.requestUpdate();
  }

  clear() {
    this._controller?.clear();
  }

  _closePanel() {
    this.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { bubbles: true, composed: true }));
  }

  async _loadConfig() {
    const { org, site } = this._context ?? {};
    if (!org || !site) return;
    const key = `${org}/${site}`;
    if (this._configKey === key) return;
    this._configKey = key;
    const { prompts, skills, mcpServers, mcpServerHeaders } = await loadSiteConfig(org, site);
    this._prompts = prompts ?? [];
    this._skills = skills ?? [];
    this._controller?.setMcpConfig(mcpServers ?? {}, mcpServerHeaders ?? {});
    if (this._slashCtx) this._syncSlashMenu(this._slashCtx);
  }

  _getSlashItems(filter) {
    const skillIds = this._controller?.getSkills() ?? this._skills;
    if (!skillIds) return [];
    const skills = skillIds.map((id) => ({ id, label: id }));
    const filtered = filter
      ? skills.filter((item) => item.id.toLowerCase().includes(filter))
      : skills;
    if (!filtered.length) return [];
    return [{ section: 'Skills' }, ...filtered];
  }

  firstUpdated() {
    this._slashMenuEl = this.shadowRoot.querySelector('.slash-menu');
  }

  _getSlashContext(input) {
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos);
    const wordStart = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\n')) + 1;
    const word = before.slice(wordStart);
    if (!word.startsWith('/')) return null;
    return { filter: word.slice(1).toLowerCase(), wordStart };
  }

  _syncSlashMenu(ctx) {
    if (!this._slashMenuEl) return;
    if (!ctx) {
      this._slashMenuEl.close();
      return;
    }
    const items = this._getSlashItems(ctx.filter);
    if (!items.length) {
      this._slashMenuEl.close();
      return;
    }
    this._slashMenuEl.items = items;
    if (!this._slashMenuEl.open) {
      const form = this.shadowRoot.querySelector('.chat-form');
      this._slashMenuEl.show({ anchor: form, placement: 'above' });
    } else {
      this._slashMenuEl.reposition();
    }
  }

  _spliceInput(input, text, start, end = start) {
    input.value = input.value.slice(0, start) + text + input.value.slice(end);
    input.setSelectionRange(start + text.length, start + text.length);
  }

  _onSlashSelect(skillId) {
    const input = this.shadowRoot?.querySelector('.chat-input');
    const { wordStart } = this._slashCtx ?? {};
    const message = buildSlashMessage(input?.value ?? '', input?.selectionStart ?? 0, wordStart, skillId);
    this._slashCtx = null;
    this._slashMenuEl?.close();
    if (input) input.value = '';
    const pills = this.shadowRoot.querySelector('nx-pills');
    const items = pills?.items ?? [];
    const contextItems = items.filter((item) => !item.dataBase64);
    const attachments = buildAttachmentPayload(items);
    const opts = { requestedSkills: [skillId], ...(attachments.length ? { attachments } : {}) };
    this._controller.sendMessage(message, contextItems, opts);
    pills?.clear();
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];

    if (this._context) this._ensureController(this._context);

    this._unsubscribeHash = hashChange.subscribe((state) => {
      if (!this._explicitContext) this._applyContext(state);
    });

    this._dnd = createFileDropHandlers({
      isAllowed: isAllowedFile,
      onDragging: (dragging) => { this._dragging = dragging; },
      onFiles: (files) => this._onFilesSelected(files),
    });
  }

  async _ensureController(context) {
    if (this._controller || this._resolvingController) return;
    const { org, site } = context ?? {};
    if (!org || !site) return;

    this._resolvingController = true;
    const useCoworker = await isCoworkerEnabled({ org, site });
    this._resolvingController = false;
    if (this._destroyed || this._controller) return;

    this._useCoworker = useCoworker;
    if (useCoworker) {
      const aoStyles = await loadStyle(new URL('./ao/ao.css', import.meta.url).href);
      this.shadowRoot.adoptedStyleSheets = [...this.shadowRoot.adoptedStyleSheets, aoStyles];
    }

    this._controller = new ChatBackend(useCoworker, {
      onToolDone: (scope, paths) => {
        this.dispatchEvent(new CustomEvent(CHAT_EVENT.AGENT_CHANGE, {
          bubbles: true,
          composed: true,
          detail: { scope, paths },
        }));
      },
      onUpdate: ({
        messages, thinking, streamingText, connected, toolCards,
        pendingInteraction, newerEpisodeAvailable,
      }) => {
        const newMessages = streamingText
          ? [...(messages ?? []), { role: ROLE.ASSISTANT, content: streamingText, streaming: true }]
          : messages;
        this.thinking = thinking;
        this.connected = connected;
        this.toolCards = toolCards;
        this.pendingInteraction = pendingInteraction;
        this.newerEpisodeAvailable = newerEpisodeAvailable;
        cancelAnimationFrame(this._updateRaf);
        this._updateRaf = requestAnimationFrame(() => {
          this.messages = newMessages;
          this.thinking = thinking;
          this.connected = connected;
          this.toolCards = toolCards;
          this.pendingInteraction = pendingInteraction;
          this.newerEpisodeAvailable = newerEpisodeAvailable;
        });
      },
    });
    this._controller.setContext(this._context ?? context);
    this._controller.connect().then(() => this._controller.loadInitialMessages());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._destroyed = true;
    cancelAnimationFrame(this._updateRaf);
    this._unsubscribeHash?.();
    this._controller?.destroy();
  }

  willUpdate(changed) {
    if (changed.has('messages')) {
      const log = this.shadowRoot?.querySelector('.chat-scroll-container');
      this._wasNearBottom = !log || (log.scrollHeight - log.scrollTop - log.clientHeight < 50);
    }
  }

  updated(changed) {
    if (changed.has('messages')) {
      const log = this.shadowRoot.querySelector('.chat-scroll-container');
      if (log && this._wasNearBottom) {
        cancelAnimationFrame(this._scrollRaf);
        this._scrollRaf = requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
      }
    }
    if (changed.has('thinking') && !this.thinking && changed.get('thinking')) {
      this.shadowRoot.querySelector('.chat-input')?.focus();
    }
    if (changed.has('connected') && this.connected && this._pendingPrompt) {
      const { text, autoSend } = this._pendingPrompt;
      this._pendingPrompt = null;
      this._sendPrompt(text, { autoSend });
    }
  }

  _openPrompts() {
    const popover = this.shadowRoot.querySelector('.prompts-popover');
    const form = this.shadowRoot.querySelector('.chat-form');
    openPopoverAbove(popover, form, {
      onOpen: () => this.shadowRoot.querySelector('nx-prompts')?.focus(),
    });
  }

  _onAddClick(e) {
    const popover = this.shadowRoot.querySelector('.prompts-popover');
    if (!popover?.open) return;
    e.stopImmediatePropagation();
    popover.close();
  }

  _handleInput(e) {
    this._slashCtx = this._getSlashContext(e.target);
    this._syncSlashMenu(this._slashCtx);
  }

  _handleBlur() {
    // Defer past any click event on a menu item that triggered the blur
    setTimeout(() => {
      this._slashMenuEl?.close();
      this._slashCtx = null;
    }, 0);
  }

  _handleKeydown(e) {
    if (this._slashMenuEl?.open) {
      const keys = ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'];
      if (keys.includes(e.key)) {
        e.preventDefault();
        this._slashMenuEl.handleKey(e.key);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._submit();
    }
  }

  _submit(e) {
    e?.preventDefault();
    if (this.thinking) {
      this._controller.stop();
      return;
    }
    const input = this.shadowRoot.querySelector('.chat-input');
    const text = input.value.trim();
    const pills = this.shadowRoot.querySelector('nx-pills');
    const items = pills?.items ?? [];
    if (!text && !items.length) return;
    const fileItems = items.filter((i) => i.dataBase64);
    const contextItems = items.filter((i) => !i.dataBase64);
    const message = text || (fileItems.length > 1 ? 'Attached files' : 'Attached file');
    const attachments = buildAttachmentPayload(items);
    this._slashMenuEl?.close();
    this._controller.sendMessage(message, contextItems, { attachments });
    input.value = '';
    pills?.clear();
  }

  _sendPrompt(prompt, { autoSend = false } = {}) {
    if (!prompt || this.thinking || !this.connected) return;
    this.shadowRoot.querySelector('.prompts-popover')?.close();
    const input = this.shadowRoot.querySelector('.chat-input');
    if (!input) return;
    input.value = prompt;
    if (autoSend) {
      input.closest('form')?.requestSubmit();
    } else {
      input.focus();
    }
  }

  _handleMenuSelect({ detail: { id } }) {
    if (id === MENU_OPTIONS.FILES) this._openFilePicker();
    if (id === MENU_OPTIONS.PROMPT) this._openPrompts();
    if (id === MENU_OPTIONS.COMMAND) this._insertSlash();
    if (id === MENU_OPTIONS.MANAGE_PROMPT || id === MENU_OPTIONS.MANAGE_SKILLS) {
      const { org, site } = this._context ?? {};
      if (!org || !site) return;
      const url = new URL(window.location.href);
      url.pathname = '/apps/skills';
      url.search = `?tab=${id}`;
      url.hash = `#/${org}/${site}`;
      window.open(url.href, '_blank', 'noopener,noreferrer');
    }
  }

  _insertSlash() {
    const input = this.shadowRoot.querySelector('.chat-input');
    if (!input) return;
    const { value, selectionStart: pos } = input;
    const before = value.slice(0, pos);
    const slash = (before && !before.endsWith(' ')) ? ' /' : '/';
    this._spliceInput(input, slash, pos);
    input.focus();
    input.dispatchEvent(new Event('input'));
  }

  _openFilePicker() {
    this.shadowRoot.querySelector('.chat-file-input')?.click();
  }

  async _onFilesSelected(fileList) {
    const pills = this.shadowRoot.querySelector('nx-pills');
    const currentCount = (pills?.items ?? []).filter((i) => i.dataBase64).length;
    const items = await buildAttachmentItems(fileList, { currentCount });
    items.forEach((item) => pills?.add(item));
  }

  async _onFileInputChange(e) {
    const { target } = e;
    await this._onFilesSelected(target.files);
    target.value = '';
  }

  _handlePillActivate({ detail }) {
    const { selFrom, selTo, selectionType, blockName, proseIndex } = detail;
    document.dispatchEvent(new CustomEvent(CHAT_EVENT.HIGHLIGHT_SELECTION, {
      detail: { selFrom, selTo, selectionType, blockName, proseIndex },
    }));
  }

  render() {
    const { view } = this._context ?? {};
    const prompts = (this._prompts ?? [])
      .filter((p) => !p.area || p.area === 'all' || p.area === view);

    return html`
      <nx-popover class="prompts-popover">
        <nx-prompts
          .prompts=${prompts}
          .onSend=${(p) => this._sendPrompt(p)}
        ></nx-prompts>
      </nx-popover>
      <div class="chat-header">
        <button
          type="button"
          class="chat-header-btn clear-btn"
          aria-label="Clear chat"
          ?hidden=${!this.messages?.length}
          @click=${() => this.clear()}
        >${icon('clear')}<span>Clear</span></button>
        <button
          type="button"
          class="chat-header-btn"
          aria-label="Close chat panel"
          @click=${this._closePanel}
        >${icon('close')}</button>
      </div>
      ${renderNewerEpisodeBanner(this.newerEpisodeAvailable, {
      onSwitch: () => this._controller.switchToLatestEpisode(),
      onDismiss: () => this._controller.dismissNewerEpisode(),
    })}
      <div class="chat-scroll-container">
        <div class="chat-messages-container" role="log" aria-live="polite">
          ${!this.messages?.length && !this.thinking
        ? html`<nx-new-chat
              .prompts=${prompts}
              .onSend=${(p) => this._sendPrompt(p)}
              @nx-show-prompts=${this._openPrompts}
            ></nx-new-chat>`
        : nothing}
        ${this.messages?.map((msg) => {
          if (msg.uiArtifact) {
            return renderUiArtifact(msg.uiArtifact, (p) => this._sendPrompt(p, { autoSend: true }));
          }
          if (msg.toolCard) return renderToolCard(msg.toolCard);
          return renderMessage(msg, this.toolCards);
        })}
        ${this.thinking && !this.messages?.at(-1)?.streaming && !this.pendingInteraction
        ? html`<div class="chat-thinking">Thinking...</div>` : nothing}
        </div>
      </div>
      <div class="chat-form-wrap">
        <nx-menu
          class="slash-menu"
          .ignoreFocus=${true}
          .scoped=${true}
          @select=${({ detail }) => this._onSlashSelect(detail.id)}
          @mousedown=${(e) => e.preventDefault()}
        ></nx-menu>
        <nx-chat-interaction
          .pending=${this.pendingInteraction}
          .onApprove=${(toolCallId, approved, always) => this._controller.approveToolCall(toolCallId, approved, always)}
          .onAnswerQuestion=${(answers) => this._controller.answerQuestion(answers)}
          .onDeclineQuestion=${() => this._controller.declineQuestion()}
          .onApprovePlan=${() => this._controller.respondToPlanApproval('approve')}
          .onRejectPlan=${(feedback) => this._controller.respondToPlanApproval('reject', feedback)}
        ></nx-chat-interaction>
        <form class="chat-form" autocomplete="off" @submit=${this._submit}
          @dragenter=${this._dnd.onDragEnter}
          @dragleave=${this._dnd.onDragLeave}
          @dragover=${this._dnd.onDragOver}
          @drop=${this._dnd.onDrop}
        >
        <input
          class="chat-file-input"
          type="file"
          accept="image/*,text/markdown,.md,application/pdf,.pdf"
          multiple
          hidden
          @change=${this._onFileInputChange}
        />
        ${this._dragging ? html`
          <div class="chat-drop-zone" aria-hidden="true">
            <span class="chat-drop-title">Drop a file to add context</span>
            <span class="chat-drop-hint">Supports PDF, images, and documents</span>
          </div>` : nothing}
        <nx-pills
          addEvent=${CHAT_EVENT.ADD_TO_CHAT}
          @nx-pill-activate=${this._handlePillActivate}
          @nx-pills-change=${this._onPillsChange}
        ></nx-pills>
        <textarea
          name="chat-input"
          class="chat-input"
          placeholder="Ask anything, or type / for skills..."
          ?disabled=${this.thinking || !this.connected}
          @input=${this._handleInput}
          @keydown=${this._handleKeydown}
          @blur=${this._handleBlur}
        ></textarea>
        <div class="chat-actions" ?data-thinking=${this.thinking} ?data-has-items=${this._hasItems}>
          <nx-menu .items=${ADD_MENU_ITEMS} placement="above" @select=${this._handleMenuSelect}>
            <button slot="trigger" class="chat-add" type="button" aria-label="Add" @click=${this._onAddClick}>
              <span class="icon-add">${icon('add')}</span>
              <span class="icon-up">${icon('up')}</span>
            </button>
          </nx-menu>
          <button class="chat-stop action-btn" type="button" aria-label="Stop" @click=${this._submit}>${icon('stop')}</button>
          <button class="chat-send action-btn" type="submit" aria-label="Send">${icon('send')}</button>
        </div>
        </form>
      </div>
      <p class="chat-disclaimer">
        Responses are generated using AI, and may be inaccurate. Check before using.
        <a href="${ADOBE_AI_GUIDELINES_URL}" target="_blank" rel="noopener noreferrer">AI User Guidelines</a>
      </p>
    `;
  }
}

customElements.define('nx-chat', NxChat);
