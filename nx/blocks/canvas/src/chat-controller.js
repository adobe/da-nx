import { loadMessages, saveMessages, clearMessages } from './chat-idb-store.js';
import { isToolAutoApproved } from './tool-auto-approve.js';

/** Clone add-to-chat payloads for storage / API (minimal serializable fields). */
function sanitizeSelectionContext(items) {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  const out = items.map((it) => {
    if (it?.kind === 'da-browse-source' && typeof it?.pathKey === 'string' && it.pathKey.trim()) {
      const pathKey = it.pathKey.trim().replace(/^\/+/, '');
      const proseIndex = typeof it.proseIndex === 'number' && !Number.isNaN(it.proseIndex)
        ? it.proseIndex
        : 0;
      const name = (typeof it.name === 'string' && it.name.trim())
        ? it.name.trim()
        : (pathKey.split('/').pop() || pathKey);
      const innerText = (typeof it.innerText === 'string' && it.innerText.trim())
        ? it.innerText.trim()
        : `Selected repository path: ${pathKey}`;
      return {
        proseIndex,
        blockName: name,
        innerText,
        pathKey,
        source: 'da-browse',
      };
    }
    const proseIndex = typeof it?.proseIndex === 'number' ? it.proseIndex : NaN;
    const innerText = typeof it?.innerText === 'string' ? it.innerText : '';
    const blockName = typeof it?.blockName === 'string' && it.blockName.trim()
      ? it.blockName.trim()
      : undefined;
    if (Number.isNaN(proseIndex)) return null;
    return blockName != null
      ? { proseIndex, blockName, innerText }
      : { proseIndex, innerText };
  }).filter(Boolean);
  return out.length ? out : undefined;
}

function sanitizeOutgoingAttachments(items) {
  if (!Array.isArray(items) || items.length === 0) return { request: [], meta: [] };
  const request = [];
  const meta = [];
  items.forEach((it, index) => {
    const id = typeof it?.id === 'string' && it.id.trim() ? it.id.trim() : `att-${index + 1}`;
    const fileName = typeof it?.fileName === 'string' && it.fileName.trim()
      ? it.fileName.trim()
      : 'attachment';
    const mediaType = typeof it?.mediaType === 'string' && it.mediaType.trim()
      ? it.mediaType.trim()
      : 'application/octet-stream';
    const dataBase64 = typeof it?.dataBase64 === 'string' ? it.dataBase64.trim() : '';
    const sizeBytes = Number.isFinite(it?.sizeBytes) ? Number(it.sizeBytes) : undefined;
    if (!dataBase64) return;
    request.push({
      id,
      fileName,
      mediaType,
      dataBase64,
      ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
    });
    meta.push({
      id,
      fileName,
      mediaType,
      ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
    });
  });
  return { request, meta };
}

function normalizePath(path) {
  if (typeof path !== 'string') return '';
  return path
    .trim()
    .split('?')[0]
    .split('#')[0]
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '');
}

/** Match da-agent ensureHtmlExtension: add extension only when basename has none. */
function ensureContentPath(path) {
  if (typeof path !== 'string' || !path) return path;
  const last = path.split('/').pop() ?? '';
  return last.includes('.') ? path : `${path}.html`;
}

const REPO_FILE_TOOLS = new Set([
  'da_create_source',
  'da_update_source',
  'da_delete_source',
  'da_copy_content',
  'da_move_content',
]);

/** Legacy MCP names (see tool-card-summaries COPY_TOOLS, etc.) → da_* ids for refresh logic. */
function canonicalRepoToolName(toolName) {
  if (!toolName || typeof toolName !== 'string') return '';
  switch (toolName) {
    case 'content_copy': return 'da_copy_content';
    case 'content_move': return 'da_move_content';
    case 'content_create': return 'da_create_source';
    case 'content_delete': return 'da_delete_source';
    case 'content_update': return 'da_update_source';
    default: return toolName;
  }
}

/** Server registers these without `execute`; the canvas completes them and POSTs tool-result. */
const CLIENT_ONLY_TOOLS = new Set([
  'da_bulk_preview',
  'da_bulk_publish',
  'da_bulk_delete',
]);

/** Wire names for content update tools (client may inject revert snapshot on input). */
const REVERT_SNAPSHOT_UPDATE_TOOLS = new Set([
  'content_update',
  'da_update_source',
]);

/** Client-only tool input key; stripped server-side (da-agent). */
// eslint-disable-next-line no-underscore-dangle -- protocol key name
const DA_REVERT_SNAPSHOT_KEY = '_daRevertSnapshot';

/**
 * @param {Array<{ role: string, content?: unknown }>} messages
 * @returns {Array<{ toolCallId: string, toolName: string, input: object }>}
 */
function findPendingClientToolCalls(messages) {
  const withResult = new Set();
  messages.forEach((msg) => {
    if (msg.role !== 'tool' || !Array.isArray(msg.content)) return;
    msg.content.forEach((p) => {
      if (p.type === 'tool-result' && p.toolCallId) withResult.add(p.toolCallId);
    });
  });
  const pending = [];
  messages.forEach((msg) => {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) return;
    msg.content.forEach((p) => {
      if (p.type === 'tool-call'
          && CLIENT_ONLY_TOOLS.has(p.toolName)
          && !withResult.has(p.toolCallId)) {
        pending.push({
          toolCallId: p.toolCallId,
          toolName: p.toolName,
          input: p.input ?? {},
        });
      }
    });
  });
  return pending;
}

function repoFilePathKey(org, repo, relativePath) {
  const rel = ensureContentPath(String(relativePath).replace(/^\/+/, ''));
  return `${org}/${repo}/${rel}`.replace(/\/{2,}/g, '/');
}

/**
 * Directory fullpaths (/org/repo, …) to refetch after a file under the repo changes.
 */
function listFullpathsTouchingFile(pathKey) {
  const parts = pathKey.split('/').filter(Boolean);
  if (parts.length < 3) return [];
  const out = new Set();
  out.add(`/${parts[0]}/${parts[1]}`);
  for (let n = 3; n < parts.length; n += 1) {
    out.add(`/${parts.slice(0, n).join('/')}`);
  }
  return [...out];
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
    this.onRepoFilesChanged = options.onRepoFilesChanged || (() => {});
    this.onClientToolRequest = options.onClientToolRequest || (() => {});
    /** @type {((toolInput: object) => string | null) | null} */
    this.getRevertSnapshotAemHtml = options.getRevertSnapshotAemHtml ?? null;
    /** @type {((detail: { html: string }) => void) | null} */
    this.onRevertCollabAemHtml = options.onRevertCollabAemHtml ?? null;

    // Conversation history; user messages may include selectionContext (page excerpts).
    // The server expands selectionContext into model-facing text before streamText.
    this.messages = [];
    // Map<toolCallId, { toolName, input, state, approvalId, output }> — UI display state.
    this.toolCards = new Map();

    this.connected = false;
    this.isThinking = false;
    this.isAwaitingApproval = false;
    this.isAwaitingClientTool = false;
    this.statusText = '';
    // In-flight assistant text (committed to messages on text-end).
    this.streamingText = '';

    // Active agent preset ID (null = default assistant).
    this.agentId = null;
    // Skill IDs to inject into next request's system prompt.
    this.requestedSkills = [];
    // MCP server configs { id: url } from DA config sheet.
    this.mcpServers = {};
    // toolCallId → approvalId for tools awaiting user decision.
    this._pendingApprovals = new Map();
    // toolCallId → toolName (tool-output-available events lack toolName).
    this._toolNameById = {};
    this._abortController = null;
    this._processedUpdateToolCalls = new Set();
    /** Approved mutating tools; server runs them in resolveApprovals (no tool-result SSE). */
    this._approvedRepoToolsPendingResume = [];
    /** Defer repo refresh until after POST returns (avoid refetch before server write). */
    this._postApprovalRepoRefreshQueue = [];
    /** @type {{ toolCallId: string, toolName: string } | null} */
    this._activeClientToolCall = null;
    /** Binary attachment payloads sent only with the next /chat request. */
    this._pendingRequestAttachments = [];
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
    this.isAwaitingClientTool = false;
    this._activeClientToolCall = null;
    this._pendingApprovals.clear();
    this.streamingText = '';
    this.statusText = 'Disconnected';

    this.onConnectionChange(false);
    this.onStatusChange(this.statusText);
    this.onUpdate();
  }

  // ---------- stream reading ----------

  _processStreamLine(rawLine) {
    const normalized = String(rawLine).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const line = normalized.startsWith('data: ') ? normalized.slice(6).trimEnd() : normalized.trimEnd();
    if (!line || line === '[DONE]') return;

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
        let input = { ...(event.input ?? event.args ?? {}) };
        this._toolNameById[toolCallId] = toolName;
        if (REVERT_SNAPSHOT_UPDATE_TOOLS.has(toolName) && typeof this.getRevertSnapshotAemHtml === 'function') {
          const messageIndexBeforeToolCall = this.messages.length;
          const aemHtml = this.getRevertSnapshotAemHtml(input);
          if (typeof aemHtml === 'string' && aemHtml.length > 0) {
            input = {
              ...input,
              [DA_REVERT_SNAPSHOT_KEY]: {
                html: aemHtml,
                messageIndexBeforeToolCall,
              },
            };
          }
        }
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

        const nameForPolicy = existing.toolName || this._toolNameById[toolCallId] || event.toolName;
        if (nameForPolicy && isToolAutoApproved(nameForPolicy)) {
          queueMicrotask(() => {
            this.approveToolCall({ toolCallId, approved: true }).catch(() => {});
          });
        }
        break;
      }

      case 'tool-result':
      case 'tool-output-available': {
        const { toolCallId } = event;
        const priorCard = this.toolCards.get(toolCallId);
        const toolName = event.toolName ?? this._toolNameById[toolCallId] ?? priorCard?.toolName;
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
        this._emitRepoFilesChanged(toolCallId, toolName, raw);
        this.onUpdate();
        break;
      }

      case 'finish-message':
      case 'finish':
        this._onFinish();
        break;

      case 'error': {
        this.isThinking = false;
        const msg = typeof event.errorText === 'string' ? event.errorText : (event.error?.message ?? 'Chat stream error');
        this.statusText = 'Error';
        this.messages = [...this.messages, { role: 'assistant', content: `Error: ${msg}` }];
        this.onStatusChange(this.statusText);
        this.onUpdate();
        break;
      }

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

  /**
   * Notify listeners (e.g. file browser) when agent tools change repo files.
   * Paths align with DA list API / hash segments: org/repo/path/to/file.html
   */
  _emitRepoFilesChanged(toolCallId, toolName, output) {
    const canonical = canonicalRepoToolName(toolName);
    if (!REPO_FILE_TOOLS.has(canonical)) return;

    let normalizedOut = output;
    if (typeof normalizedOut === 'string') {
      normalizedOut = { success: true, message: normalizedOut };
    }
    if (!normalizedOut || typeof normalizedOut !== 'object' || 'error' in normalizedOut) return;
    if ('success' in normalizedOut && normalizedOut.success === false) return;

    const card = this.toolCards.get(toolCallId);
    const input = card?.input ?? {};
    const ctx = typeof this.getContext === 'function' ? this.getContext() : {};
    const org = String(input.org ?? ctx.org ?? '').trim();
    const repo = String(input.repo ?? ctx.site ?? ctx.repo ?? '').trim();
    if (!org || !repo) return;

    const listFullpaths = new Set();
    const modifiedPathKeys = [];
    const clearModifiedPathKeys = [];

    const addRefreshForPathKey = (pk) => {
      listFullpathsTouchingFile(pk).forEach((fp) => listFullpaths.add(fp));
    };

    switch (canonical) {
      case 'da_update_source': {
        const rel = normalizedOut.path || input.path;
        if (!rel) return;
        const pk = repoFilePathKey(org, repo, rel);
        addRefreshForPathKey(pk);
        modifiedPathKeys.push(pk);
        break;
      }
      case 'da_create_source': {
        const rel = normalizedOut.path || input.path;
        if (!rel) return;
        const pk = repoFilePathKey(org, repo, rel);
        addRefreshForPathKey(pk);
        modifiedPathKeys.push(pk);
        break;
      }
      case 'da_delete_source': {
        const rel = normalizedOut.path || input.path;
        if (!rel) return;
        const pk = repoFilePathKey(org, repo, rel);
        addRefreshForPathKey(pk);
        clearModifiedPathKeys.push(pk);
        break;
      }
      case 'da_copy_content': {
        const src = input.sourcePath;
        const dest = input.destinationPath;
        if (src) addRefreshForPathKey(repoFilePathKey(org, repo, src));
        if (dest) {
          const dpk = repoFilePathKey(org, repo, dest);
          addRefreshForPathKey(dpk);
          modifiedPathKeys.push(dpk);
        }
        break;
      }
      case 'da_move_content': {
        const src = input.sourcePath;
        const dest = input.destinationPath;
        if (src) {
          const spk = repoFilePathKey(org, repo, src);
          addRefreshForPathKey(spk);
          clearModifiedPathKeys.push(spk);
        }
        if (dest) {
          const dpk = repoFilePathKey(org, repo, dest);
          addRefreshForPathKey(dpk);
          modifiedPathKeys.push(dpk);
        }
        break;
      }
      default:
        break;
    }

    if (listFullpaths.size === 0) return;

    this.onRepoFilesChanged({
      org,
      repo,
      listFullpaths: [...listFullpaths],
      modifiedPathKeys,
      clearModifiedPathKeys,
    });
  }

  // ---------- public API ----------

  /**
   * Truncate chat to before this update tool-call and restore collab doc from snapshot HTML.
   * @param {string} toolCallId
   * @returns {boolean} Whether revert ran (snapshot found).
   */
  revertUpdateToolCall(toolCallId) {
    if (!toolCallId) return false;
    let snapshot = null;
    for (let i = 0; i < this.messages.length; i += 1) {
      const msg = this.messages[i];
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        const part = msg.content.find((p) => p.type === 'tool-call' && p.toolCallId === toolCallId);
        const rev = part?.input?.[DA_REVERT_SNAPSHOT_KEY];
        if (rev && typeof rev.messageIndexBeforeToolCall === 'number') {
          snapshot = rev;
          break;
        }
      }
    }
    if (!snapshot) return false;

    const { html, messageIndexBeforeToolCall } = snapshot;
    this._abortController?.abort();
    this._abortController = null;
    this.messages = this.messages.slice(0, messageIndexBeforeToolCall);
    this.toolCards = this._rebuildToolCards(this.messages);
    this._processedUpdateToolCalls.clear();
    this._pendingApprovals.clear();
    this._activeClientToolCall = null;
    this.isAwaitingApproval = false;
    this.isAwaitingClientTool = false;
    this.streamingText = '';
    this.isThinking = false;
    this.statusText = '';
    this._approvedRepoToolsPendingResume = [];
    this._postApprovalRepoRefreshQueue = [];

    saveMessages(this.room, this.messages);
    this.onStatusChange(this.statusText);
    this.onUpdate();

    if (typeof html === 'string' && html.length > 0 && typeof this.onRevertCollabAemHtml === 'function') {
      this.onRevertCollabAemHtml({ html });
    }
    return true;
  }

  async sendMessage(text, selectionContext = [], attachments = []) {
    const content = (text || '').trim();
    const {
      request: requestAttachments,
      meta: attachmentMeta,
    } = sanitizeOutgoingAttachments(attachments);
    if ((!content && attachmentMeta.length === 0)
      || this.isThinking || this.isAwaitingApproval || this.isAwaitingClientTool
        || !this.connected) return;

    const ctx = sanitizeSelectionContext(selectionContext);
    const userMsg = {
      role: 'user',
      content: content || (attachmentMeta.length > 1 ? 'Attached files' : 'Attached file'),
    };
    if (ctx?.length) userMsg.selectionContext = ctx;
    if (attachmentMeta.length > 0) userMsg.attachmentsMeta = attachmentMeta;
    this._pendingRequestAttachments = requestAttachments;
    this._approvedRepoToolsPendingResume = [];
    this._postApprovalRepoRefreshQueue = [];
    this.messages = [...this.messages, userMsg];
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

    if (approved
      && card?.toolName
      && REPO_FILE_TOOLS.has(canonicalRepoToolName(card.toolName))) {
      this._approvedRepoToolsPendingResume.push({ toolCallId, toolName: card.toolName });
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

    this._postApprovalRepoRefreshQueue = [...this._approvedRepoToolsPendingResume];
    this._approvedRepoToolsPendingResume = [];

    await this._resumeWithMessages();
  }

  _flushPostApprovalRepoRefresh() {
    const pending = this._postApprovalRepoRefreshQueue;
    if (!pending?.length) return;
    this._postApprovalRepoRefreshQueue = [];
    pending.forEach(({ toolCallId: id, toolName: name }) => {
      this._emitRepoFilesChanged(id, name, { success: true });
    });
  }

  _maybeFlushPendingClientTools() {
    if (this.isAwaitingApproval || this.isAwaitingClientTool) return;
    const pending = findPendingClientToolCalls(this.messages);
    if (pending.length === 0) return;
    const { toolCallId, toolName, input } = pending[0];
    this._activeClientToolCall = { toolCallId, toolName };
    this.isAwaitingClientTool = true;
    this.isThinking = false;
    this.statusText = 'Action required in the workspace';
    this.onStatusChange(this.statusText);
    this.onClientToolRequest({ toolCallId, toolName, input });
    this.onUpdate();
  }

  /**
   * @param {{ toolCallId: string, toolName: string, output: unknown }} param0
   */
  async submitClientToolResult({ toolCallId, toolName, output }) {
    if (!toolCallId || !toolName) return;
    if (this._activeClientToolCall?.toolCallId !== toolCallId) return;
    this._activeClientToolCall = null;
    this.isAwaitingClientTool = false;

    const isError = output && typeof output === 'object' && 'error' in output;
    const wrappedOutput = typeof output === 'string'
      ? { type: 'text', value: output }
      : { type: 'json', value: output };
    this.messages = [
      ...this.messages,
      {
        role: 'tool',
        content: [{
          type: 'tool-result', toolCallId, toolName, output: wrappedOutput,
        }],
      },
    ];
    const nextCards = new Map(this.toolCards);
    const existing = nextCards.get(toolCallId) || { toolName, input: {} };
    nextCards.set(toolCallId, { ...existing, state: isError ? 'error' : 'done', output });
    this.toolCards = nextCards;

    this.isThinking = true;
    this.statusText = 'Thinking...';
    this.onStatusChange(this.statusText);
    this.onUpdate();

    await this._resumeWithMessages();
  }

  async _resumeWithMessages() {
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
          ...(this._pendingRequestAttachments.length > 0
            ? { attachments: this._pendingRequestAttachments }
            : {}),
          room: this.room,
          ...(this.agentId ? { agentId: this.agentId } : {}),
          ...(this.requestedSkills.length > 0 ? { requestedSkills: this.requestedSkills } : {}),
          ...(Object.keys(this.mcpServers).length > 0 ? { mcpServers: this.mcpServers } : {}),
        }),
        signal: this._abortController.signal,
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      // resolveApprovals() on the server finishes before streamText sends bytes; refresh list now
      // so the UI updates without waiting for the full assistant stream.
      this._flushPostApprovalRepoRefresh();

      await this._readStream(response.body.getReader());

      this._maybeFlushPendingClientTools();

      if (!this.isAwaitingApproval && !this.isAwaitingClientTool) {
        saveMessages(this.room, this.messages);
      }
    } catch (e) {
      this._pendingRequestAttachments = [];
      this._postApprovalRepoRefreshQueue = [];
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
      this._pendingRequestAttachments = [];
      this._abortController = null;
    }
  }

  stop() {
    if (this._activeClientToolCall) {
      const { toolCallId, toolName } = this._activeClientToolCall;
      this._activeClientToolCall = null;
      const output = { cancelled: true, reason: 'user_stopped' };
      const wrappedOutput = { type: 'json', value: output };
      this.messages = [
        ...this.messages,
        {
          role: 'tool',
          content: [{
            type: 'tool-result', toolCallId, toolName, output: wrappedOutput,
          }],
        },
      ];
      const nextCards = new Map(this.toolCards);
      const existing = nextCards.get(toolCallId) || { toolName, input: {} };
      nextCards.set(toolCallId, { ...existing, state: 'error', output });
      this.toolCards = nextCards;
      this.isAwaitingClientTool = false;
    }
    this._abortController?.abort();
    this._abortController = null;
    this.isThinking = false;
    this.isAwaitingApproval = false;
    this._approvedRepoToolsPendingResume = [];
    this._postApprovalRepoRefreshQueue = [];
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
    this.isAwaitingClientTool = false;
    this._activeClientToolCall = null;
    this.statusText = '';
    this._processedUpdateToolCalls.clear();
    this._approvedRepoToolsPendingResume = [];
    this._postApprovalRepoRefreshQueue = [];
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
        this._toolNameById = {};
        cached.forEach((msg) => {
          if (msg.role !== 'assistant' || !Array.isArray(msg.content)) return;
          msg.content.forEach((part) => {
            if (part.type === 'tool-call' && part.toolCallId && part.toolName) {
              this._toolNameById[part.toolCallId] = part.toolName;
            }
          });
        });
        this.onUpdate();
        this._maybeFlushPendingClientTools();
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
