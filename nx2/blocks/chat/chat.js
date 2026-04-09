import { LitElement, html, nothing } from 'da-lit';
import { loadStyle, hashChange } from '../../utils/utils.js';
import ChatController from './chat-controller.js';
import { renderMessage, renderThinking } from './renderers.js';
import './welcome/welcome.js';
import { loadChatIcons } from './utils.js';

const styles = await loadStyle(import.meta.url);
const icons = await loadChatIcons({ add: 'Add', clear: 'RemoveCircle', copy: 'Copy', send: 'ArrowUpSend', stop: 'Stop' });

const icon = (name) => icons?.[name]?.cloneNode(true);

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

  // Runs when the panel header slot is ready
  _mountClearBtn() {
    if (!this._panelSlot || this._clearBtn) return;
    const btn = document.createElement('button');
    btn.className = 'panel-header-action';
    btn.setAttribute('aria-label', 'Clear chat');
    btn.hidden = !this.messages?.length;
    if (icons.clear) btn.append(icon('clear'));
    btn.append(Object.assign(document.createElement('span'), { textContent: 'Clear' }));
    btn.addEventListener('click', () => this.clear());
    this._clearBtn = btn;
    this._panelSlot.append(btn);
  }

  async connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];

    this.closest('.panel-body')?.addEventListener('nx-panel-slot', ({ detail }) => {
      this._panelSlot = detail.slot;
      this._mountClearBtn();
    }, { once: true });

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
    if (this._clearBtn) this._clearBtn.hidden = !this.messages?.length;
  }

  _handleKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._submit();
    }
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

  render() {
    return html`
      <div class="chat-messages-container" role="log" aria-live="polite">
        ${!this.messages?.length && !this.thinking
        ? html`<nx-chat-welcome .context=${this._context} .onSend=${(p) => this._sendPrompt(p)}></nx-chat-welcome>`
        : nothing}
        ${this.messages?.map((msg) => renderMessage(msg, icons))}
        ${this.thinking && !this.messages?.at(-1)?.streaming ? renderThinking() : nothing}
      </div>
      <form class="chat-form" autocomplete="off" @submit=${(e) => { e.preventDefault(); this._submit(); }}>
        <textarea
          name="chat-input"
          class="chat-input"
          placeholder="Ask anything, or type / for commands..."
          ?disabled=${this.thinking}
          @keydown=${this._handleKeydown}
        ></textarea>
        <div class="chat-actions ${this.thinking ? 'chat-thinking' : ''}">
          <button class="chat-stop" type="button" aria-label="Stop" @click=${this._submit}>${icon('stop')}</button>
          <button class="chat-send" type="submit" aria-label="Send">${icon('send')}</button>
        </div>
      </form>
    `;
  }
}

customElements.define('nx-chat', NxChat);

export default async function init(el) {
  const chat = document.createElement('nx-chat');
  el.replaceWith(chat);
}
