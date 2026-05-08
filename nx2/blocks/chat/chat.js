import { LitElement, html, nothing } from 'da-lit';
import ChatController from './chat-controller.js';
import { SlashMenuController } from './slash-menu.js';
import { renderMessage, renderApprovalCard } from './renderers.js';
import './welcome/welcome.js';
import './prompts/prompts.js';
import './pills/pills.js';
import '../shared/menu/menu.js';
import { loadStyle, hashChange } from '../../utils/utils.js';
import { loadChatIcons, readFileAsBase64 } from './utils.js';
import { loadSiteConfig } from './api.js';
import { ADD_MENU_ITEMS, CHAT_ICONS, MENU_OPTIONS, ROLE, TOOL_STATE } from './constants.js';

const styles = await loadStyle(import.meta.url);
const icons = await loadChatIcons(CHAT_ICONS);

const icon = (name) => icons?.[name]?.cloneNode(true);
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

  _slashMenu = new SlashMenuController();

  _onAddToChat = ({ detail }) => {
    const { key, ...item } = detail;
    if (key !== undefined) {
      const prevId = this._keyedItemIds.get(key);
      const without = (this._items ?? []).filter((i) => i.id !== prevId);
      if (item.id) {
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
    const { prompts, skills } = await loadSiteConfig(org, site);
    this._prompts = prompts ?? [];
    this._slashMenu.setSkills(skills ?? []);
    this._slashMenu.refresh(this.shadowRoot?.querySelector('.chat-form'));
  }

  firstUpdated() {
    this._slashMenu.connect(this.shadowRoot.querySelector('.slash-menu'));
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];

    this._controller = new ChatController({
      onToolDone: () => {
        this.dispatchEvent(new CustomEvent('nx-agent-change', { bubbles: true, composed: true }));
      },
      onUpdate: ({
        messages, thinking, streamingText, connected, toolCards,
      }) => {
        this.messages = streamingText
          ? [...(messages ?? []), { role: ROLE.ASSISTANT, content: streamingText, streaming: true }]
          : messages;
        this.thinking = thinking;
        this.connected = connected;
        this.toolCards = toolCards;
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

  updated(changed) {
    if (changed.has('messages')) {
      const log = this.shadowRoot.querySelector('.chat-scroll-container');
      if (log) requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
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
    const form = this.shadowRoot.querySelector('.chat-form');
    this._slashMenu.handleInput(e.target, form);
  }

  _handleBlur() {
    this._slashMenu.handleBlur();
  }

  _handleKeydown(e) {
    if (this._slashMenu.handleKey(e.key)) {
      e.preventDefault();
      return;
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

    const fileItems = (this._items ?? []).filter((i) => i.type === 'image');
    const contextItems = (this._items ?? []).filter((i) => i.type !== 'image');
    const message = text || (fileItems.length > 1 ? 'Attached files' : 'Attached file');
    const attachments = fileItems.map(({ id, fileName, mediaType, sizeBytes, dataBase64 }) => ({
      id, fileName, mediaType, dataBase64, ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
    }));
    fileItems.forEach((i) => { if (i.thumbnail) URL.revokeObjectURL(i.thumbnail); });

    this._slashMenu.close();
    this._controller.sendMessage(message, contextItems, { attachments });
    input.value = '';
    this._items = [];
  }

  _sendPrompt(prompt) {
    if (!prompt || this.thinking || !this.connected) return;
    this.shadowRoot.querySelector('.prompts-popover')?.close();
    const input = this.shadowRoot.querySelector('.chat-input');
    if (!input) return;
    input.value = prompt;
    input.focus();
  }

  async _onFilesSelected(fileList) {
    const MAX_FILES = 5;
    const imageCount = (this._items ?? []).filter((i) => i.type === 'image').length;
    const available = Math.max(0, MAX_FILES - imageCount);
    const files = Array.from(fileList)
      .filter((f) => f.type?.startsWith('image/'))
      .slice(0, available);
    if (!files.length) return;

    const results = await Promise.all(files.map(async (file) => {
      try {
        const dataBase64 = await readFileAsBase64(file);
        if (!dataBase64) return null;
        return {
          id: crypto.randomUUID(),
          label: file.name,
          type: 'image',
          fileName: file.name,
          mediaType: file.type,
          sizeBytes: file.size,
          dataBase64,
          thumbnail: URL.createObjectURL(file),
        };
      } catch { return null; }
    }));

    results.filter(Boolean).forEach((item) => this.addAttachment(item));
  }

  _openFilePicker() {
    this.shadowRoot.querySelector('.chat-file-input')?.click();
  }

  async _onFileInputChange(e) {
    await this._onFilesSelected(e.target.files);
    e.target.value = '';
  }

  _handleMenuSelect({ detail: { id } }) {
    if (id === MENU_OPTIONS.PROMPT) this._openPrompts();
    if (id === MENU_OPTIONS.COMMAND) this._slashMenu.insertSlash(this.shadowRoot.querySelector('.chat-input'));
    if (id === MENU_OPTIONS.FILES) this._openFilePicker();
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
    if (files?.length) await this._onFilesSelected(files);
  }

  _onSkillSelect({ detail }) {
    const input = this.shadowRoot.querySelector('.chat-input');
    this._slashMenu.select(detail.id, input, (msg, skill) => {
      this._controller.sendMessage(msg, [], { requestedSkills: [skill] });
    });
  }

  _handlePillRemove({ detail: { id } }) {
    const removed = (this._items ?? []).find((i) => i.id === id);
    if (removed?.thumbnail) URL.revokeObjectURL(removed.thumbnail);
    this._items = (this._items ?? []).filter((item) => item.id !== id);
  }

  render() {
    const { view } = this._context ?? {};
    const prompts = (this._prompts ?? [])
      .filter((p) => !p.area || p.area === 'all' || p.area === view);

    return html`
      <nx-popover class="prompts-popover">
        <nx-prompts
          .prompts=${prompts}
          @nx-select-prompt=${({ detail }) => this._sendPrompt(detail.prompt)}
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
              @nx-select-prompt=${({ detail }) => this._sendPrompt(detail.prompt)}
              @nx-show-prompts=${this._openPrompts}
            ></nx-chat-welcome>`
        : nothing}
        ${this.messages?.map((msg) => renderMessage(msg, icons, this.toolCards))}
        ${this.thinking && !this.messages?.at(-1)?.streaming ? html`<div class="chat-thinking">Thinking...</div>` : nothing}
        </div>
      </div>
      <div class="chat-form-wrap">
        <nx-menu
          class="slash-menu"
          .ignoreFocus=${true}
          .scoped=${true}
          @mousedown=${(e) => e.preventDefault()}
          @select=${this._onSkillSelect}
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
          accept="image/*"
          multiple
          hidden
          @change=${this._onFileInputChange}
        />
        ${this._dragging ? html`
          <div class="chat-drop-zone" aria-hidden="true">
            <span class="chat-drop-title">Drop a file to add context</span>
            <span class="chat-drop-hint">Supports images</span>
          </div>` : nothing}
        ${this._items?.length ? html`
          <nx-chat-pills
            .items=${this._items}
            @nx-pill-remove=${this._handlePillRemove}
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
    `;
  }
}

customElements.define('nx-chat', NxChat);

export default async function init(el) {
  const chat = document.createElement('nx-chat');
  el.replaceWith(chat);
}
