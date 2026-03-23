// eslint-disable-next-line import/no-unresolved
import getStyle from 'https://da.live/nx/utils/styles.js';
// eslint-disable-next-line import/no-unresolved
import { LitElement, html } from 'da-lit';
// eslint-disable-next-line import/no-named-as-default
import ChatController from './chat-controller.js';
import { initIms } from '../../../utils/daFetch.js';

const style = await getStyle(import.meta.url);
const imsInitial = await initIms();
const token = imsInitial?.accessToken?.token ?? null;

const DOCUMENT_UPDATED_EVENT = 'da:agent-content-updated';

function getUserIdFromToken(jwtToken) {
  try {
    const payload = JSON.parse(atob(jwtToken.split('.')[1]));
    return payload.userId || payload.sub || payload.email || null;
  } catch {
    return null;
  }
}

function getContextFromHash() {
  const hash = window.location.hash || '';
  const path = hash.replace(/^#\/?/, '').trim();
  const segments = path ? path.split('/').filter(Boolean) : [];
  const [org = '', repo = '', ...rest] = segments;
  return {
    org,
    site: repo,
    path: rest.join('/'),
    view: 'edit',
  };
}

/**
 * Chat panel component with real AI agent connection.
 * Self-contained: reads org/repo/path from the URL hash; IMS token via initIms (nx).
 * @fires da:agent-content-updated - when the agent updates the document
 */
class Chat extends LitElement {
  static properties = {
    header: { type: String },
    onPageContextItems: { type: Array },
    _connected: { state: true },
    _messages: { state: true },
    _toolCards: { state: true },
    _streamingText: { state: true },
    _inputValue: { state: true },
    _isThinking: { state: true },
    _isAwaitingApproval: { state: true },
    _statusText: { state: true },
    _skillsLibraryTab: { state: true },
    _openToolCards: { state: true },
  };

  constructor() {
    super();
    this.header = 'Assistant';
    this.onPageContextItems = [];
    this._connected = false;
    this._messages = [];
    this._inputValue = '';
    this._isThinking = false;
    this._isAwaitingApproval = false;
    this._statusText = '';
    this._toolCards = new Map();
    this._streamingText = '';
    this._skillsLibraryTab = 'skills';
    this._openToolCards = new Set();
    this._chatController = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._ensureController();
    this._chatController?.connect();
  }

  disconnectedCallback() {
    this._chatController?.disconnect();
    super.disconnectedCallback();
  }

  _ensureController() {
    if (this._chatController) return;

    // Use a unique room per user per project so each person gets their own
    // isolated Durable Object instance with separate conversation history.
    const { org, site } = getContextFromHash();
    const userId = getUserIdFromToken(token);
    const agentRoom = org && site && userId
      ? `${org}--${site}--${userId}`
      : 'default';

    this._chatController = new ChatController({
      name: agentRoom,
      getContext: getContextFromHash,
      getImsToken: async () => (await initIms())?.accessToken?.token ?? null,
      onUpdate: () => {
        this._messages = [...this._chatController.messages];
        this._toolCards = new Map(this._chatController.toolCards);
        this._streamingText = this._chatController.streamingText;
        this._isThinking = this._chatController.isThinking;
        this._isAwaitingApproval = this._chatController.isAwaitingApproval;
        this._scrollMessagesToBottom();
      },
      onStatusChange: (statusText) => {
        this._statusText = statusText || '';
      },
      onConnectionChange: (connected) => {
        this._connected = connected;
      },
      onDocumentUpdated: (payload) => {
        window.dispatchEvent(new CustomEvent(DOCUMENT_UPDATED_EVENT, {
          detail: { ...payload, ts: Date.now() },
        }));
      },
    });
  }

  _scrollMessagesToBottom() {
    this.updateComplete.then(() => {
      const el = this.shadowRoot?.querySelector('.chat-messages');
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  _handleInput(e) {
    this._inputValue = e.target.value;
  }

  _handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this._sendMessage();
    }
  }

  _sendMessage() {
    const content = this._inputValue.trim();
    if (!content || this._isThinking || this._isAwaitingApproval || !this._chatController) return;
    this._inputValue = '';
    this._chatController.sendMessage(content, this.onPageContextItems ?? []);
    this.dispatchEvent(new CustomEvent('da-chat-message-sent', { bubbles: true }));
  }

  _stopRequest() {
    this._chatController?.stop();
  }

  _clearChat() {
    this._chatController?.clearHistory();
  }

  _sendToolApproval(toolCallId, approved) {
    if (!toolCallId || !this._chatController) return;
    this._chatController.approveToolCall({ toolCallId, approved });
  }

  _sendPrompt(prompt) {
    if (!prompt || this._isThinking || this._isAwaitingApproval || !this._connected) return;
    this._chatController?.sendMessage(prompt, this.onPageContextItems ?? []);
    this.dispatchEvent(new CustomEvent('da-chat-message-sent', { bubbles: true }));
  }

  _onSkillsNavChange(e) {
    const { value } = e.target;
    if (value) this._skillsLibraryTab = value;
  }

  _toggleToolCard(toolCallId) {
    if (!toolCallId) return;
    const next = new Set(this._openToolCards);
    if (next.has(toolCallId)) {
      next.delete(toolCallId);
    } else {
      next.add(toolCallId);
    }
    this._openToolCards = next;
  }

  /**
   * Label for a context item pill: block name if block, else first 20 chars + '...'
   * @param {{ blockName?: string, innerText: string }} item
   * @returns {string}
   */
  // eslint-disable-next-line class-methods-use-this
  _contextPillLabel(item) {
    if (!item) return '';
    if (item.blockName && item.blockName.trim()) return item.blockName.trim();
    const text = (item.innerText || '').trim();
    if (text.length <= 20) return text;
    return `${text.slice(0, 20)}...`;
  }

  _removeContextItem(index) {
    this.dispatchEvent(new CustomEvent('chat-context-remove', {
      bubbles: true,
      composed: true,
      detail: { index },
    }));
  }

  _renderToolCard(toolCallId) {
    const card = this._toolCards?.get(toolCallId);
    if (!card) return '';

    const {
      toolName, input, state, output,
    } = card;
    const isApproval = state === 'approval-requested';
    const isRejected = state === 'rejected';
    const isDone = state === 'done';
    const isError = state === 'error';
    const isOpen = this._openToolCards?.has(toolCallId);

    const icon = isApproval ? '⚠️' : '🔧';

    let statusText = 'running';
    let statusClass = 'running';
    if (isApproval) {
      statusText = 'needs approval';
      statusClass = 'approval';
    } else if (state === 'approved') {
      statusText = 'approved…';
      statusClass = 'running';
    } else if (isRejected) {
      statusText = 'rejected';
      statusClass = 'rejected';
    } else if (isError) {
      statusText = 'error';
      statusClass = 'error';
    } else if (isDone) {
      statusText = 'done';
      statusClass = 'ok';
    }

    // eslint-disable-next-line no-nested-ternary
    const cardStateClass = isApproval ? 'needs-approval' : (isError || isRejected ? 'error' : (isDone ? 'done' : ''));

    const inputText = input && typeof input === 'object' ? JSON.stringify(input, null, 2) : null;
    const outputText = output ? JSON.stringify(output, null, 2) : null;

    return html`
      <div class="tool-card ${cardStateClass} ${isOpen ? 'open' : ''}">
        <div class="tool-summary" @click=${() => this._toggleToolCard(toolCallId)}>
          <span class="tool-icon">${icon}</span>
          <span class="tool-name-label">${toolName}</span>
          <span class="tool-status ${statusClass}">${statusText}</span>
          <span class="tool-chevron">▶</span>
        </div>
        <div class="tool-body">
          ${inputText ? html`
            <div class="tool-section-label">Input</div>
            <pre class="tool-code">${inputText}</pre>
          ` : ''}
          ${outputText ? html`
            <div class="tool-section-label">Output</div>
            <pre class="tool-code output">${outputText}</pre>
          ` : ''}
        </div>
        ${isApproval ? html`
          <div class="approval-footer">
            <button class="btn-approve" @click=${() => this._sendToolApproval(toolCallId, true)}>Approve</button>
            <button class="btn-reject" @click=${() => this._sendToolApproval(toolCallId, false)}>Reject</button>
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderWelcome() {
    const prompts = [
      'Summarize this page',
      'Suggest better headings',
      'Improve clarity and tone',
      'Find accessibility issues',
    ];

    return html`
      <div class="chat-empty-state">
        <div class="chat-empty-title">Start a conversation</div>
        <div class="chat-empty-actions">
          ${prompts.map((prompt) => html`
            <button
              class="chat-welcome-btn"
              ?disabled=${this._isThinking || !this._connected}
              @click=${() => this._sendPrompt(prompt)}
            >
              ${prompt}
            </button>
          `)}
        </div>
      </div>
    `;
  }

  _renderSkillsButton() {
    return html`
      <overlay-trigger type="modal" triggered-by="click">
        <sp-dialog-wrapper slot="click-content" headline="Skills library" dismissable underlay>
          <div class="chat-skills-modal-body">
            <sp-sidenav
              class="chat-skills-sidenav"
              .value="${this._skillsLibraryTab}"
              @change="${this._onSkillsNavChange}"
            >
              <sp-sidenav-item value="skills" label="Skills" ?selected="${this._skillsLibraryTab === 'skills'}"></sp-sidenav-item>
              <sp-sidenav-item value="mcp" label="MCP" ?selected="${this._skillsLibraryTab === 'mcp'}"></sp-sidenav-item>
              <sp-sidenav-item value="agents" label="Agents" ?selected="${this._skillsLibraryTab === 'agents'}"></sp-sidenav-item>
            </sp-sidenav>
            <div class="chat-skills-content">
              <div class="chat-skills-empty">
                <svg class="chat-skills-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                  <path d="M2 12h4v8H2zM10 6h4v14h-4zM18 2h4v20h-4z"/>
                </svg>
                <p class="chat-skills-empty-text">Nothing here yet.</p>
              </div>
            </div>
          </div>
        </sp-dialog-wrapper>
        <sp-action-button slot="trigger" label="Skills library" quiet>
          <svg slot="icon" width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8.75 5.375C8.40527 5.375 8.125 5.65527 8.125 6V10C8.125 10.3447 8.40527 10.625 8.75 10.625C9.09473 10.625 9.375 10.3447 9.375 10V6C9.375 5.65527 9.09473 5.375 8.75 5.375Z" fill="currentColor"/><path d="M18.8643 15.5586L16.3311 4.33984C16.1182 3.40039 15.1787 2.80371 14.2383 3.01953L12.7764 3.34961C12.473 3.41773 12.2046 3.5669 11.9824 3.77124C11.8926 2.78149 11.0674 2 10.0547 2H7.44531C6.37304 2 5.5 2.87305 5.5 3.94531V4.02539C5.41772 4.01318 5.33557 4 5.25 4H3.75C2.78516 4 2 4.78516 2 5.75V16.25C2 17.2148 2.78516 18 3.75 18H5.25C5.65173 18 6.0177 17.8584 6.31348 17.6299C6.63306 17.8604 7.02222 18 7.44532 18H10.0547C11.127 18 12 17.1269 12 16.0547V7.85864L13.9873 16.6582C14.0899 17.1152 14.3633 17.5039 14.7588 17.7529C15.042 17.9326 15.3623 18.0244 15.6894 18.0244C15.8193 18.0244 15.9502 18.0098 16.0791 17.9805L17.541 17.6504C17.998 17.5478 18.3867 17.2734 18.6367 16.8779C18.8857 16.4834 18.9668 16.0146 18.8643 15.5586ZM3.74999 5.5H5.24999C5.38769 5.5 5.49999 5.6123 5.49999 5.75V13.5137C5.47667 13.5115 5.45653 13.5 5.43261 13.5H3.49999V5.75C3.49999 5.6123 3.61229 5.5 3.74999 5.5ZM5.49999 16.25C5.49999 16.3877 5.38769 16.5 5.24999 16.5H3.74999C3.61229 16.5 3.49999 16.3877 3.49999 16.25V15H5.43261C5.45654 15 5.47668 14.9885 5.49999 14.9863V16.25ZM10.5 16.0547C10.5 16.2998 10.2998 16.5 10.0547 16.5H7.4453C7.20018 16.5 6.99999 16.2998 6.99999 16.0547V3.94531C6.99999 3.70019 7.20019 3.5 7.4453 3.5H10.0547C10.2998 3.5 10.5 3.7002 10.5 3.94531V16.0547ZM17.3682 16.0772C17.3476 16.1094 17.2998 16.168 17.2129 16.1875L15.748 16.5176C15.6621 16.541 15.5928 16.5049 15.5595 16.4853C15.5273 16.4648 15.4697 16.417 15.4502 16.3291L12.917 5.11035C12.8974 5.02344 12.9287 4.95508 12.9492 4.92285C12.9697 4.88965 13.0176 4.83203 13.1054 4.8125L14.5693 4.48242C14.5879 4.47851 14.6055 4.47656 14.624 4.47656C14.7383 4.47656 14.8418 4.55566 14.8682 4.6709L17.4014 15.8887C17.4209 15.9766 17.3887 16.0439 17.3682 16.0772Z" fill="currentColor"/></svg>
        </sp-action-button>
      </overlay-trigger>
    `;
  }

  render() {
    return html`
      <div class="chat">
        <div class="chat-header">
          <span class="chat-header-title">${this.header}</span>
          <div class="chat-header-actions">
            <span class="status-pill ${this._connected ? 'connected' : 'disconnected'}">
              ${this._connected ? 'Connected' : 'Disconnected'}
            </span>
            <button
              class="chat-clear-btn"
              @click=${this._clearChat}
              title="Clear chat"
              aria-label="Clear chat"
            >×</button>
          </div>
        </div>

        <div class="chat-messages" role="log" aria-live="polite">
          ${this._messages.length === 0 && !this._streamingText ? this._renderWelcome() : ''}
          ${this._messages.map((message) => {
    // Skip protocol-only tool messages (tool-result, tool-approval-response).
    if (message.role === 'tool') return '';

    // User message — always a plain string.
    if (message.role === 'user') {
      return html`
              <div class="message-row user">
                <div class="message-bubble">${message.content}</div>
              </div>`;
    }

    // Assistant message: either a plain string (text) or an array (tool calls).
    if (typeof message.content === 'string' && message.content) {
      return html`
              <div class="message-row assistant">
                <div class="message-bubble">${message.content}</div>
              </div>`;
    }
    if (Array.isArray(message.content)) {
      return html`${message.content
        .filter((p) => p.type === 'tool-call')
        .map((p) => this._renderToolCard(p.toolCallId))}`;
    }
    return '';
  })}
          ${this._streamingText ? html`
            <div class="message-row assistant">
              <div class="message-bubble">${this._streamingText}</div>
            </div>` : ''}
        </div>

        <div class="chat-footer">
          ${(this.onPageContextItems?.length ?? 0) > 0 ? html`
          <div class="chat-context-pills">
            ${(this.onPageContextItems || []).map((item, i) => html`
              <span class="chat-context-pill" title="${(item.innerText || '').slice(0, 100)}${(item.innerText?.length ?? 0) > 100 ? '…' : ''}">
                <button type="button" class="chat-context-pill-remove" aria-label="Remove from context" @click=${() => this._removeContextItem(i)}>×</button>
                <span class="chat-context-pill-label">${this._contextPillLabel(item)}</span>
              </span>
            `)}
          </div>
          ` : ''}
          <div class="chat-footer-row">
          ${this._renderSkillsButton()}
          <sp-textfield
            class="chat-input"
            label="Message"
            placeholder="Send a message..."
            .value=${this._inputValue}
            ?disabled=${this._isThinking || this._isAwaitingApproval || !this._connected}
            @input=${this._handleInput}
            @keydown=${this._handleKeyDown}
          ></sp-textfield>
          ${this._isThinking
    ? html`<sp-button variant="secondary" @click=${this._stopRequest}>Stop</sp-button>`
    : html`<sp-button
                variant="accent"
                ?disabled=${!this._inputValue.trim() || !this._connected || this._isAwaitingApproval}
                @click=${this._sendMessage}
              >Send</sp-button>`}
          </div>
        </div>

        <div class="chat-status">${this._statusText}</div>
      </div>
    `;
  }
}

customElements.define('da-chat', Chat);
