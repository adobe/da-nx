import { LitElement, html, nothing } from 'lit';
import { loadStyle } from '../../utils/utils.js';
import loadIcons from '../../utils/svg.js';
import ChatController from './chat-controller.js';

const styles = await loadStyle(import.meta.url);

class DaChat extends LitElement {
  static properties = {
    messages: { type: Array },
    thinking: { type: Boolean },
  };

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._controller = new ChatController({
      onUpdate: ({ messages, thinking }) => {
        this.messages = messages;
        this.thinking = thinking;
      },
    });
  }

  firstUpdated() {
    loadIcons({ icons: this.shadowRoot.querySelectorAll('.icon') });
  }

  _handleInput(e) {
    this._input = e.target.value;
  }

  _handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._submit();
    }
  }

  _submit() {
    const message = (this._input ?? '').trim();
    if (!message || this.thinking) return;
    this._controller.sendMessage(message);
    this._input = '';
    this.shadowRoot.querySelector('.chat-input').value = '';
  }

  _renderMessage(msg) {
    if (msg.role === 'tool') return nothing;
    return html`
      <div class="message message-${msg.role}">
        <div class="message-content">${msg.content}</div>
      </div>
    `;
  }

  _renderEmpty() {
    return html`<div class="chat-empty">Start a conversation</div>`;
  }

  render() {
    return html`
      <div class="chat-messages-container" role="log" aria-live="polite">
        ${!this.messages?.length && !this.thinking ? this._renderEmpty() : nothing}
        ${this.messages?.map((msg) => this._renderMessage(msg))}
        ${this.thinking ? html`
          <div class="chat-thinking">
            <span></span><span></span><span></span>
            <span class="chat-thinking-label">Gathering insights...</span>
          </div>` : nothing}
      </div>
      <div class="chat-footer">
        <textarea
          class="chat-input"
          placeholder="Ask something..."
          .value=${this._input ?? ''}
          ?disabled=${this.thinking}
          @input=${this._handleInput}
          @keydown=${this._handleKeydown}
        ></textarea>
        <div class="chat-actions">
          <div class="chat-actions-start"></div>
          <button class="chat-send" ?disabled=${this.thinking} @click=${this._submit} aria-label="Send">
            <span class="icon icon-send"></span>
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('da-chat', DaChat);

export default async function init(el) {
  const chat = document.createElement('da-chat');
  el.replaceWith(chat);
}
