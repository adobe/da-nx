import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import '../shared/menu/menu.js';
import ChatController from './chat-controller.js';
import { renderMessage, renderApprovalCard } from './renderers.js';
import './welcome/welcome.js';
import './prompts/prompts.js';
import './pills/pills.js';
import { loadSiteConfig } from './api.js';
import { ADD_MENU_ITEMS, MENU_OPTIONS, ROLE, TOOL_STATE } from './constants.js';

const styles = await loadStyle(import.meta.url);

const ICON_SRCS = {
  add: new URL('../../img/icons/s2-icon-add-20-n.svg', import.meta.url).href,
  clear: new URL('../../img/icons/s2-icon-removecircle-20-n.svg', import.meta.url).href,
  close: new URL('../../img/icons/s2-icon-splitleft-20-n.svg', import.meta.url).href,
  send: new URL('../../img/icons/s2-icon-arrowupsend-20-n.svg', import.meta.url).href,
  stop: new URL('../../img/icons/s2-icon-stop-20-n.svg', import.meta.url).href,
  up: new URL('../../img/icons/s2-icon-chevronup-20-n.svg', import.meta.url).href,
};

const icon = (name) => html`<img src="${ICON_SRCS[name]}" aria-hidden="true">`;

const UI_PROMPTS_GAP = 8;

class NxChat extends LitElement {
  static properties = {
    messages: { type: Array },
    thinking: { type: Boolean },
    connected: { type: Boolean },
    toolCards: { type: Object },
    _prompts: { state: true },
    _items: { state: true },
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
    this._skills = skills ?? [];
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
    const before = input?.value.slice(0, wordStart ?? 0).trimEnd();
    const after = input?.value.slice(input.selectionStart).trimStart();
    const message = [before, `/${skillId}`, after].filter(Boolean).join(' ');
    this._slashCtx = null;
    this._slashMenuEl?.close();
    if (input) input.value = '';
    this._controller.sendMessage(message, [], { requestedSkills: [skillId] });
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];

    this._controller = new ChatController({
      onToolDone: () => {
        this.dispatchEvent(new CustomEvent('nx-agent-change', { bubbles: true, composed: true }));
      },
      onUpdate: ({ messages, thinking, streamingText, connected, toolCards }) => {
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
    const message = input.value.trim();
    if (!message && !this._items?.length) return;
    const context = this._items ?? [];
    this._slashMenuEl?.close();
    this._controller.sendMessage(message, context);
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

  _handleMenuSelect({ detail: { id } }) {
    if (id === MENU_OPTIONS.PROMPT) this._openPrompts();
    if (id === MENU_OPTIONS.COMMAND) this._insertSlash();
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

  _handlePillRemove({ detail: { id } }) {
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
        ${this.messages?.map((msg) => renderMessage(msg, null, this.toolCards))}
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
        <form class="chat-form" autocomplete="off" @submit=${this._submit}>
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
        <div class="chat-actions" ?data-thinking=${this.thinking}>
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
