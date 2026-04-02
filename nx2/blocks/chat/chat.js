import { LitElement, html, nothing } from 'da-lit';
import { loadStyle } from '../../utils/utils.js';
import { loadHrefSvg } from '../../utils/svg.js';
import ChatController from './chat-controller.js';

const styles = await loadStyle(import.meta.url);

const ICONS_BASE = new URL('../../img/icons/', import.meta.url).href;

const ICONS = {
  send: `${ICONS_BASE}S2_Icon_Send_20_N.svg`,
  stop: `${ICONS_BASE}S2_Icon_Stop_20_N.svg`,
};

class NxChat extends LitElement {
  static properties = {
    messages: { type: Array },
    thinking: { type: Boolean },
    _icons: { state: true },
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

  async firstUpdated() {
    const entries = Object.entries(ICONS);
    const svgs = await Promise.all(entries.map(([, href]) => loadHrefSvg(href)));
    const icons = {};
    entries.forEach(([key], i) => { icons[key] = svgs[i]; });
    this._icons = icons;
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

  _renderIcon(name) {
    const svg = this._icons?.[name];
    return svg ?? nothing;
  }

  render() {
    return html`
      <div class="chat-messages-container" role="log" aria-live="polite">
        ${!this.messages?.length && !this.thinking ? this._renderEmpty() : nothing}
        ${this.messages?.map((msg) => this._renderMessage(msg))}
        ${this.thinking ? html`
          <div class="chat-thinking">
            <span></span><span></span><span></span>
            <span class="chat-thinking-label">Thinking...</span>
          </div>` : nothing}
      </div>
      <div class="chat-footer">
        <textarea
          name="chat-input"
          class="chat-input"
          placeholder="Ask something..."
          .value=${this._input ?? ''}
          ?disabled=${this.thinking}
          @input=${this._handleInput}
          @keydown=${this._handleKeydown}
        ></textarea>
        <div class="chat-actions">
          <div class="chat-actions-start"></div>
          <button class="chat-send" @click=${this._submit} aria-label=${this.thinking ? 'Stop' : 'Send'}>
            <span class="icon" ?hidden=${this.thinking}>${this._renderIcon('send')}</span>
            <span class="icon" ?hidden=${!this.thinking}>${this._renderIcon('stop')}</span>
          </button>
        </div>
      </div>
    `;
  }
}

customElements.define('nx-chat', NxChat);

export default async function init(el) {
  const chat = document.createElement('nx-chat');
  el.replaceWith(chat);
}
