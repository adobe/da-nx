import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import { readFileAsBase64 } from './utils/stream.js';
import '../shared/menu/menu.js';
import ChatController from './chat-controller.js';
import { renderMessage, renderApprovalCard } from './renderers.js';
import './welcome/welcome.js';
import './prompts/prompts.js';
import './pills/pills.js';
import { loadSiteConfig } from './utils/api.js';
import { ADOBE_AI_GUIDELINES_URL, ADD_MENU_ITEMS, MENU_OPTIONS, ROLE, TOOL_STATE } from './constants.js';
import { getConfig } from '../../scripts/nx.js';
import { buildAttachmentPayload, buildSlashMessage } from './utils/chat-helpers.js';

const styles = await loadStyle(import.meta.url);
const { codeBase } = getConfig();

const ICON_NAMES = {
  add: 's2-icon-add-20-n',
  clear: 's2-icon-removecircle-20-n',
  close: 's2-icon-splitleft-20-n',
  send: 's2-icon-arrowupsend-20-n',
  stop: 's2-icon-stop-20-n',
  up: 's2-icon-chevronup-20-n',
};

const icon = (name) => html`<svg class="chat-icon" viewBox="0 0 20 20" aria-hidden="true"><use href="${codeBase}/img/icons/${ICON_NAMES[name]}.svg#icon"></use></svg>`;

const UI_PROMPTS_GAP = 8;

class NxChat extends LitElement {
  static properties = {
    messages: { type: Array },
    thinking: { type: Boolean },
    connected: { type: Boolean },
    toolCards: { type: Object },
    _prompts: { state: true },
    _items: { state: true },
    _dragging: { state: true },
  };

  set context(value) {
    this._explicitContext = true;
    this._applyContext(value);
  }

  _keyedItemIds = new Map();

  _onAddToChat = ({ detail }) => {
    const { key, ...item } = detail;
    if (key !== undefined) {
      const prevId = this._keyedItemIds.get(key);
      const without = (this._items ?? []).filter((i) => i.id !== prevId);
      const matchesPinned = item.id
        && typeof item.selFrom === 'number'
        && typeof item.selTo === 'number'
        && without.some((i) => i.pinned
          && i.selFrom === item.selFrom
          && i.selTo === item.selTo);
      if (matchesPinned) {
        this._keyedItemIds.delete(key);
        this._items = without;
      } else if (item.id) {
        this._keyedItemIds.set(key, item.id);
        this._items = [...without, item];
      } else {
        this._keyedItemIds.delete(key);
        this._items = without;
      }
    } else {
      this.addAttachment(item);
    }
  };

  setPrompt(text, { autoSend = false } = {}) {
    if (this.connected) {
      this._sendPrompt(text, { autoSend });
    } else {
      this._pendingPrompt = { text, autoSend };
    }
  }

  addAttachment(item) {
    const current = this._items ?? [];
    if (current.some((i) => i.id === item.id)) return;
    this._items = [...current, item];
  }

  _applyContext(value) {
    this._context = value;
    this._controller?.setContext(value);
    const contextIds = new Set(this._keyedItemIds.values());
    this._items = (this._items ?? []).filter((item) => !contextIds.has(item.id));
    this._keyedItemIds = new Map();
    this._loadConfig();
    this.requestUpdate();
  }

  clear() {
    this._controller?.clear();
  }

  _closePanel() {
    this.dispatchEvent(new CustomEvent('nx-panel-close', { bubbles: true, composed: true }));
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
    if (!this._skills) return [];
    const skills = this._skills.map((id) => ({ id, label: id }));
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
    const items = this._items ?? [];
    const fileItems = items.filter((item) => item.dataBase64);
    const contextItems = items.filter((item) => !item.dataBase64);
    const attachments = buildAttachmentPayload(items);
    fileItems.forEach((item) => { if (item.thumbnail) URL.revokeObjectURL(item.thumbnail); });
    const opts = { requestedSkills: [skillId], ...(attachments.length ? { attachments } : {}) };
    this._controller.sendMessage(message, contextItems, opts);
    this._items = [];
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];

    this._controller = new ChatController({
      onToolDone: (scope, paths) => {
        this.dispatchEvent(new CustomEvent('nx-agent-change', {
          bubbles: true,
          composed: true,
          detail: { scope, paths },
        }));
      },
      onUpdate: ({ messages, thinking, streamingText, connected, toolCards }) => {
        const newMessages = streamingText
          ? [...(messages ?? []), { role: ROLE.ASSISTANT, content: streamingText, streaming: true }]
          : messages;
        this.thinking = thinking;
        this.connected = connected;
        this.toolCards = toolCards;
        cancelAnimationFrame(this._updateRaf);
        this._updateRaf = requestAnimationFrame(() => {
          this.messages = newMessages;
          this.thinking = thinking;
          this.connected = connected;
          this.toolCards = toolCards;
        });
      },
    });
    if (this._context) this._controller.setContext(this._context);

    this._unsubscribeHash = hashChange.subscribe((state) => {
      if (!this._explicitContext) this._applyContext(state);
    });

    this._controller.connect().then(() => this._controller.loadInitialMessages());
    document.addEventListener('nx-add-to-chat', this._onAddToChat);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    cancelAnimationFrame(this._updateRaf);
    (this._items ?? []).forEach((item) => {
      if (item.thumbnail) URL.revokeObjectURL(item.thumbnail);
    });
    this._unsubscribeHash?.();
    this._controller?.destroy();
    document.removeEventListener('keydown', this._onApprovalKeydown);
    document.removeEventListener('nx-add-to-chat', this._onAddToChat);
  }

  _pendingApproval() {
    if (!this.toolCards) return null;
    for (const [toolCallId, card] of this.toolCards) {
      if (card.state === TOOL_STATE.APPROVAL_REQUESTED) return { toolCallId, ...card };
    }
    return null;
  }

  _onApprovalKeydown = (e) => {
    const pending = this._pendingApproval();
    if (!pending) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      this._controller.approveToolCall(pending.toolCallId, false);
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault();
      this._controller.approveToolCall(pending.toolCallId, true, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this._controller.approveToolCall(pending.toolCallId, true);
    }
  };

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
    if (changed.has('toolCards')) {
      if (this._pendingApproval()) {
        document.addEventListener('keydown', this._onApprovalKeydown);
      } else {
        document.removeEventListener('keydown', this._onApprovalKeydown);
      }
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
    if (!popover || !form) return;
    const { left, width, top } = form.getBoundingClientRect();
    popover.style.left = `${left}px`;
    popover.style.width = `${width}px`;
    popover.style.bottom = `${window.innerHeight - top + UI_PROMPTS_GAP}px`;
    popover.style.height = `${Math.min(top - UI_PROMPTS_GAP, 400)}px`;
    popover.addEventListener('toggle', ({ newState }) => {
      if (newState === 'open') this.shadowRoot.querySelector('nx-prompts')?.focus();
    }, { once: true });
    popover.show();
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
    if (!text && !this._items?.length) return;
    const fileItems = (this._items ?? []).filter((i) => i.dataBase64);
    const contextItems = (this._items ?? []).filter((i) => !i.dataBase64);
    const message = text || (fileItems.length > 1 ? 'Attached files' : 'Attached file');
    const attachments = buildAttachmentPayload(this._items ?? []);
    fileItems.forEach((i) => { if (i.thumbnail) URL.revokeObjectURL(i.thumbnail); });
    this._slashMenuEl?.close();
    this._controller.sendMessage(message, contextItems, { attachments });
    input.value = '';
    this._items = [];
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
    if (id === 'prompts' || id === 'skills') {
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
    const MAX_FILES = 20;
    const fileCount = (this._items ?? []).filter((i) => i.dataBase64).length;
    const available = Math.max(0, MAX_FILES - fileCount);
    const files = Array.from(fileList).slice(0, available);
    if (!files.length) return;

    const results = await Promise.all(files.map(async (file) => {
      try {
        const dataBase64 = await readFileAsBase64(file);
        if (!dataBase64) return null;
        const isImage = file.type?.startsWith('image/');
        return {
          id: crypto.randomUUID(),
          label: file.name,
          type: isImage ? 'image' : 'file',
          fileName: file.name,
          mediaType: file.type,
          sizeBytes: file.size,
          dataBase64,
          ...(isImage ? { thumbnail: URL.createObjectURL(file) } : {}),
        };
      } catch { return null; }
    }));

    results.filter(Boolean).forEach((item) => this.addAttachment(item));
  }

  async _onFileInputChange(e) {
    const { target } = e;
    await this._onFilesSelected(target.files);
    target.value = '';
  }

  _handlePillRemove({ detail: { id } }) {
    const removed = (this._items ?? []).find((i) => i.id === id);
    if (removed?.thumbnail) URL.revokeObjectURL(removed.thumbnail);
    for (const [key, mappedId] of this._keyedItemIds) {
      if (mappedId === id) this._keyedItemIds.delete(key);
    }
    this._items = (this._items ?? []).filter((item) => item.id !== id);
  }

  _handlePillActivate({ detail: { id } }) {
    const item = (this._items ?? []).find((i) => i.id === id);
    if (!item) return;
    const { selFrom, selTo, selectionType, blockName, proseIndex } = item;
    if (typeof selFrom !== 'number' || typeof selTo !== 'number') return;
    document.dispatchEvent(new CustomEvent('nx-highlight-selection', {
      detail: { selFrom, selTo, selectionType, blockName, proseIndex },
    }));
  }

  _handlePillPin({ detail: { id } }) {
    const items = this._items ?? [];
    const target = items.find((i) => i.id === id);
    if (!target || !target.pinnable || target.pinned) return;
    for (const [key, mappedId] of this._keyedItemIds) {
      if (mappedId === id) this._keyedItemIds.delete(key);
    }
    const pinnedId = `pinned-${crypto.randomUUID()}`;
    this._items = items.map((item) => (
      item.id === id ? { ...item, id: pinnedId, pinned: true } : item
    ));
  }

  _onDragEnter(e) {
    e.preventDefault();
    this._dragging = true;
  }

  _onDragLeave(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    this._dragging = false;
  }

  _onDragOver(e) {
    e.preventDefault();
  }

  async _onDrop(e) {
    e.preventDefault();
    this._dragging = false;
    const { files } = e.dataTransfer ?? {};
    if (!files?.length) return;
    const accepted = Array.from(files).filter((f) => (
      f.type?.startsWith('image/')
      || f.type === 'application/pdf'
      || f.type === 'text/markdown'
      || f.name?.endsWith('.md')
    ));
    await this._onFilesSelected(accepted);
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
      <div class="chat-scroll-container">
        <div class="chat-messages-container" role="log" aria-live="polite">
          ${!this.messages?.length && !this.thinking
        ? html`<nx-chat-welcome
              .prompts=${prompts}
              .onSend=${(p) => this._sendPrompt(p)}
              @nx-show-prompts=${this._openPrompts}
            ></nx-chat-welcome>`
        : nothing}
        ${this.messages?.map((msg) => renderMessage(msg, this.toolCards))}
        ${this.thinking && !this.messages?.at(-1)?.streaming ? html`<div class="chat-thinking">Thinking...</div>` : nothing}
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
        ${renderApprovalCard(this._pendingApproval(), this._controller.approveToolCall)}
        <form class="chat-form" autocomplete="off" @submit=${this._submit}
          @dragenter=${this._onDragEnter}
          @dragleave=${this._onDragLeave}
          @dragover=${this._onDragOver}
          @drop=${this._onDrop}
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
        ${this._items?.length ? html`
          <nx-chat-pills
            .items=${this._items}
            @nx-pill-remove=${this._handlePillRemove}
            @nx-pill-pin=${this._handlePillPin}
            @nx-pill-activate=${this._handlePillActivate}
          ></nx-chat-pills>` : nothing}
        <textarea
          name="chat-input"
          class="chat-input"
          placeholder="Ask anything, or type / for skills..."
          ?disabled=${this.thinking || !this.connected}
          @input=${this._handleInput}
          @keydown=${this._handleKeydown}
          @blur=${this._handleBlur}
        ></textarea>
        <div class="chat-actions" ?data-thinking=${this.thinking} ?data-has-items=${!!this._items?.length}>
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
