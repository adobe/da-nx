import { loadMessages, saveMessages, clearMessages } from './chat-idb-store.js';

function normalizePath(path) {
  if (typeof path !== 'string') return '';
  return path
    .trim()
    .split('?')[0]
    .split('#')[0]
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '');
}

export class ChatController {
  constructor(options = {}) {
    const isLocal = new URLSearchParams(window.location.search).get('ref') === 'local';
    this.host = options.host || (isLocal ? 'localhost:5173' : 'da-agent.adobeaem.workers.dev');
    this.room = options.name || 'default';
    this.getContext = options.getContext || (() => ({}));
    this.getImsToken = options.getImsToken || (() => null);

    this.onUpdate = options.onUpdate || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onConnectionChange = options.onConnectionChange || (() => {});
    this.onDocumentUpdated = options.onDocumentUpdated || (() => {});

    // CoreMessage[] — exactly what gets sent to the server, no transformation needed.
    this.messages = [];
    // Map<toolCallId, { toolName, input, state, approvalId, output }> — UI display state.
    this.toolCards = new Map();

    this.connected = false;
    this.isThinking = false;
    this.isAwaitingApproval = false;
    this.statusText = '';
    // In-flight assistant text (committed to messages on text-end).
    this.streamingText = '';

    // toolCallId → approvalId for tools awaiting user decision.
    this._pendingApprovals = new Map();
    // toolCallId → toolName (tool-output-available events lack toolName).
    this._toolNameById = {};
    this._abortController = null;
    this._processedUpdateToolCalls = new Set();
  }

  get _chatUrl() {
    const protocol = this.host.startsWith('localhost') ? 'http' : 'https';
    return `${protocol}://${this.host}/chat`;
  }

  async connect() {
    if (this.connected) return;

    try {
      await fetch(this._chatUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      this.connected = true;
      this.statusText = 'Connected';
    } catch {
      this.connected = false;
      this.statusText = 'Disconnected';
    }

    this.onConnectionChange(this.connected);
    this.onStatusChange(this.statusText);
    this.onUpdate();

    if (this.connected) this.loadInitialMessages();
  }

  disconnect() {
    this._abortController?.abort();
    this._abortController = null;

    this.connected = false;
    this.isThinking = false;
    this.isAwaitingApproval = false;
    this._pendingApprovals.clear();
    this.streamingText = '';
    this.statusText = 'Disconnected';

    this.onConnectionChange(false);
    this.onStatusChange(this.statusText);
    this.onUpdate();
  }

  // ---------- stream reading ----------

  _processStreamLine(rawLine) {
    const line = rawLine.startsWith('data: ') ? rawLine.slice(6) : rawLine;
    if (!line.trim() || line === '[DONE]') return;

    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }

    if (!event || typeof event !== 'object') return;

    switch (event.type) {
      case 'text-start':
        this.streamingText = '';
        break;

      case 'text-delta':
        this.streamingText += event.delta ?? event.textDelta ?? event.text ?? '';
        this.onUpdate();
        break;

      case 'text-end':
        if (this.streamingText) {
          this.messages = [...this.messages, { role: 'assistant', content: this.streamingText }];
        }
        this.streamingText = '';
        this.onUpdate();
        break;

      case 'tool-call':
      case 'tool-input-available': {
        const { toolCallId, toolName } = event;
        const input = event.input ?? event.args ?? {};
        this._toolNameById[toolCallId] = toolName;
        // Push CoreMessage directly — same format as the server expects.
        this.messages = [
          ...this.messages,
          {
            role: 'assistant',
            content: [{
              type: 'tool-call', toolCallId, toolName, input,
            }],
          },
        ];
        const nextCards = new Map(this.toolCards);
        nextCards.set(toolCallId, { toolName, input, state: 'running' });
        this.toolCards = nextCards;
        this.onUpdate();
        break;
      }

      case 'tool-approval-request': {
        const { toolCallId, approvalId } = event;
        // Append tool-approval-request to the assistant message that contains the matching
        // tool-call, so the server's resolveApprovals() can find it by approvalId.
        this.messages = this.messages.map((msg) => {
          if (msg.role !== 'assistant' || !Array.isArray(msg.content)) return msg;
          if (!msg.content.some((p) => p.type === 'tool-call' && p.toolCallId === toolCallId)) {
            return msg;
          }
          return {
            ...msg,
            content: [...msg.content, { type: 'tool-approval-request', approvalId, toolCallId }],
          };
        });
        const nextCards = new Map(this.toolCards);
        const existing = nextCards.get(toolCallId) || {
          toolName: event.toolName || '',
          input: event.input ?? {},
        };
        nextCards.set(toolCallId, { ...existing, state: 'approval-requested', approvalId });
        this.toolCards = nextCards;
        this._pendingApprovals.set(toolCallId, approvalId ?? toolCallId);
        this.onUpdate();
        break;
      }

      case 'tool-result':
      case 'tool-output-available': {
        const { toolCallId } = event;
        const toolName = event.toolName ?? this._toolNameById[toolCallId];
        const raw = event.output ?? event.result;
        const isError = raw && typeof raw === 'object' && 'error' in raw;
        const output = typeof raw === 'string'
          ? { type: 'text', value: raw }
          : { type: 'json', value: raw };
        this.messages = [
          ...this.messages,
          {
            role: 'tool',
            content: [{
              type: 'tool-result', toolCallId, toolName, output,
            }],
          },
        ];
        const nextCards = new Map(this.toolCards);
        const existing = nextCards.get(toolCallId) || { toolName, input: {} };
        nextCards.set(toolCallId, { ...existing, state: isError ? 'error' : 'done', output: raw });
        this.toolCards = nextCards;
        this._pendingApprovals.delete(toolCallId);
        this._notifyDocumentUpdated(toolCallId, toolName, raw);
        this.onUpdate();
        break;
      }

      case 'finish-message':
      case 'finish':
        this._onFinish();
        break;

      case 'error':
        this.isThinking = false;
        this.statusText = 'Error';
        this.onStatusChange(this.statusText);
        this.onUpdate();
        break;

      default:
        break;
    }
  }

  _onFinish() {
    // Flush any text not yet committed (no text-end received).
    if (this.streamingText) {
      this.messages = [...this.messages, { role: 'assistant', content: this.streamingText }];
      this.streamingText = '';
    }
    if (this.isThinking) {
      this.isThinking = false;
      if (this._pendingApprovals.size > 0) {
        this.isAwaitingApproval = true;
        this.statusText = 'Approval required';
      } else {
        this.statusText = '';
      }
      this.onStatusChange(this.statusText);
      this.onUpdate();
    }
  }

  async _readStream(reader) {
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        lines.forEach((line) => {
          if (line.trim()) this._processStreamLine(line);
        });
      }
      if (buffer.trim()) this._processStreamLine(buffer);
    } finally {
      reader.releaseLock();
    }

    // Fallback: if no finish event arrived, clean up thinking state.
    if (this.isThinking) this._onFinish();
  }

  // ---------- document update notification ----------

  _notifyDocumentUpdated(toolCallId, toolName, output) {
    if (toolName !== 'da_update_source') return;
    if (!output || typeof output !== 'object' || output.error) return;
    if ('success' in output && !output.success) return;

    const context = this.getContext();
    if (context?.view !== 'edit') return;

    const currentPath = normalizePath(context.path || '');
    if (!currentPath) return;

    const card = this.toolCards.get(toolCallId);
    const targetPath = normalizePath(card?.input?.path || '');
    if (!targetPath || targetPath !== currentPath) return;

    if (this._processedUpdateToolCalls.has(toolCallId)) return;
    this._processedUpdateToolCalls.add(toolCallId);

    this.onDocumentUpdated({ toolName, toolCallId, path: targetPath });
  }

  // ---------- public API ----------

  async sendMessage(text) {
    const content = (text || '').trim();
    if (!content || this.isThinking || this.isAwaitingApproval || !this.connected) return;

    this.messages = [...this.messages, { role: 'user', content }];
    this.isThinking = true;
    this.statusText = 'Thinking...';
    this.onStatusChange(this.statusText);
    this.onUpdate();

    await this._resumeWithMessages();
  }

  async approveToolCall({ toolCallId, approved }) {
    const approvalId = this._pendingApprovals.get(toolCallId);
    if (!approvalId) return;
    this._pendingApprovals.delete(toolCallId);

    // Update tool card for immediate UI feedback.
    const nextCards = new Map(this.toolCards);
    const card = nextCards.get(toolCallId);
    if (card) {
      nextCards.set(toolCallId, { ...card, state: approved ? 'approved' : 'rejected' });
      this.toolCards = nextCards;
    }

    this.messages = [
      ...this.messages,
      { role: 'tool', content: [{ type: 'tool-approval-response', approvalId, approved }] },
    ];

    if (this._pendingApprovals.size > 0) {
      // More approvals still pending — update UI only.
      this.onUpdate();
      return;
    }

    // All resolved — resume conversation.
    this.isAwaitingApproval = false;
    this.isThinking = true;
    this.statusText = 'Thinking...';
    this.onStatusChange(this.statusText);
    this.onUpdate();

    await this._resumeWithMessages();
  }

  async _resumeWithMessages() {
    // eslint-disable-next-line no-console
    console.debug('[da-chat] sending', this.messages.length, 'messages');
    this._abortController = new AbortController();

    try {
      const imsToken = await this.getImsToken();
      const response = await fetch(this._chatUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: this.messages,
          pageContext: this.getContext(),
          imsToken,
          room: this.room,
        }),
        signal: this._abortController.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await this._readStream(response.body.getReader());

      if (!this.isAwaitingApproval) {
        saveMessages(this.room, this.messages);
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      this.isThinking = false;
      this.isAwaitingApproval = false;
      this._pendingApprovals.clear();
      this.streamingText = '';
      const isNetworkError = e instanceof TypeError;
      if (isNetworkError) {
        this.connected = false;
        this.onConnectionChange(false);
      }
      this.statusText = 'Error';
      const errorText = `Error: ${e.message || 'Failed to send message'}`;
      this.messages = [...this.messages, { role: 'assistant', content: errorText }];
      saveMessages(this.room, this.messages);
      this.onStatusChange(this.statusText);
      this.onUpdate();
    } finally {
      this._abortController = null;
    }
  }

  stop() {
    this._abortController?.abort();
    this._abortController = null;
    this.isThinking = false;
    this.isAwaitingApproval = false;
    this._pendingApprovals.clear();
    this.streamingText = '';
    this.statusText = 'Stopped';
    this.onStatusChange(this.statusText);
    this.onUpdate();
  }

  clearHistory() {
    this._abortController?.abort();
    this._abortController = null;
    clearMessages(this.room);
    this.messages = [];
    this.toolCards = new Map();
    this._pendingApprovals.clear();
    this._toolNameById = {};
    this.streamingText = '';
    this.isThinking = false;
    this.isAwaitingApproval = false;
    this.statusText = '';
    this._processedUpdateToolCalls.clear();
    this.onStatusChange(this.statusText);
    this.onUpdate();
  }

  async loadInitialMessages() {
    try {
      const cached = await loadMessages(this.room);
      if (cached.length > 0) {
        // Discard messages saved in the old format (they have a 'parts' array).
        // Sending old-format messages causes AI_MissingToolResultsError because tool
        // calls were stored in 'parts', not in 'content' arrays.
        if (cached.some((m) => Array.isArray(m.parts))) {
          clearMessages(this.room);
          return;
        }
        this.messages = cached;
        this.toolCards = this._rebuildToolCards(cached);
        this.onUpdate();
      }
    } catch {
      // IDB unavailable — start with empty history.
    }
  }

  // Reconstruct toolCards from a saved CoreMessage[] (e.g. loaded from IDB).
  // eslint-disable-next-line class-methods-use-this
  _rebuildToolCards(msgs) {
    const cards = new Map();
    msgs.forEach((msg) => {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        msg.content.forEach((part) => {
          if (part.type === 'tool-call') {
            cards.set(part.toolCallId, {
              toolName: part.toolName || '',
              input: part.input ?? {},
              state: 'done',
              output: null,
            });
          }
        });
      }
      if (msg.role === 'tool' && Array.isArray(msg.content)) {
        msg.content.forEach((part) => {
          if (part.type === 'tool-result') {
            const card = cards.get(part.toolCallId);
            if (card) {
              const raw = part.output?.value ?? part.output;
              const isError = raw && typeof raw === 'object' && 'error' in raw;
              cards.set(part.toolCallId, {
                ...card, state: isError ? 'error' : 'done', output: raw,
              });
            }
          }
        });
      }
    });
    return cards;
  }
}

export default ChatController;
