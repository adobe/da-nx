import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import ChatController from './chat-controller.js';
import { renderMessageContent } from './renderers.js';
import './welcome/welcome.js';
import { loadChatIcons } from './utils.js';

const styles = await loadStyle(import.meta.url);

const ICONS = {
  copy: 'Copy',
  send: 'Send',
  stop: 'Stop',
};

class NxChat extends LitElement {
  static properties = {
    messages: { type: Array },
    thinking: { type: Boolean },
    connected: { type: Boolean },
  };

  set context(value) {
    this._explicitContext = true;
    this._context = value;
    this._controller?.setContext(value);
    this.requestUpdate();
  }

  clear() {
    this._controller?.clear();
  }

  async firstUpdated() {
    this._icons = await loadChatIcons(ICONS);
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._controller = new ChatController({
      onUpdate: ({ messages, thinking, streamingText, connected }) => {
        this.messages = streamingText
          ? [...(messages ?? []), { role: 'assistant', content: streamingText, streaming: true }]
          : messages;
        this.thinking = thinking;
        this.connected = connected;
      },
    });
    if (this._context) this._controller.setContext(this._context);

    this._unsubscribeHash = hashChange.subscribe((state) => {
      if (!this._explicitContext) {
        this._context = state;
        this._controller.setContext(state);
        this.requestUpdate();
      }
    });

    this._controller.connect().then(() => this._controller.loadInitialMessages());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeHash?.();
    this._controller?.destroy();
  }

  updated(changed) {
    if (changed.has('thinking') && !this.thinking && changed.get('thinking')) {
      this.shadowRoot.querySelector('.chat-input')?.focus();
    }
  }

  _renderIcon(name) {
    const svg = this._icons?.[name];
    return svg ? svg.cloneNode(true) : nothing;
  }

  _handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._submit();
    }
  }

  _onSubmit(e) {
    e.preventDefault();
    this._submit();
  }

  _submit() {
    if (this.thinking) {
      this._controller.stop();
      return;
    }

    const input = this.shadowRoot.querySelector('.chat-input');
    const message = input.value.trim();

    if (!message) return;
    this._controller.sendMessage(message);

    input.value = '';
  }

  _sendPrompt(prompt) {
    if (!prompt || this.thinking) return;
    this._controller.sendMessage(prompt);
  }

  _copy(content) {
    navigator.clipboard.writeText(content);
  }

  _renderThinking() {
    return html`
      <div class="chat-thinking">
        <span></span><span></span><span></span>
        <span class="chat-thinking-label">Thinking...</span>
      </div>
    `;
  }

  _renderMessage(msg) {
    if (msg.role === 'tool') return nothing;
    const isAssistant = msg.role === 'assistant';

    return html`
      <div class="message message-${msg.role}">
        <div class="message-content">${isAssistant ? renderMessageContent(msg.content) : msg.content}</div>
        ${isAssistant && !msg.streaming ? html`
          <button class="message-action-copy" @click=${() => this._copy(msg.content)} aria-label="Copy">
            ${this._renderIcon('copy')}
          </button>
        ` : nothing}
      </div>
    `;
  }

  render() {
    return html`
      <div class="chat-messages-container" role="log" aria-live="polite">
        ${!this.messages?.length && !this.thinking
        ? html`<nx-chat-welcome .context=${this._context} .onSend=${(p) => this._sendPrompt(p)}></nx-chat-welcome>`
        : nothing}
        ${this.messages?.map((msg) => this._renderMessage(msg))}
        ${this.thinking && !this.messages?.at(-1)?.streaming ? this._renderThinking() : nothing}
      </div>
      <form class="chat-form" autocomplete="off" @submit=${this._onSubmit}>
        <textarea
          name="chat-input"
          class="chat-input"
          placeholder="Ask anything, or type / for commands..."
          ?disabled=${this.thinking}
          @keydown=${this._handleKeydown}
        ></textarea>
        <div class="chat-actions ${this.thinking ? 'chat-thinking' : ''}">
          <button class="chat-stop" type = "button" aria - label="Stop" @click=${this._submit}> ${this._renderIcon('stop')}</button > 
          <button class="chat-send" type = "submit" aria - label="Send" > ${this._renderIcon('send')}</button >
        </div>
      </form>
    `;
  }
}

customElements.define('nx-chat', NxChat);

export default async function init(el) {
  const chat = document.createElement('nx-chat');
  el.replaceWith(chat);
  // todo: remove once integrated with context
  chat.context = { view: 'edit' };
}
