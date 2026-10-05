import { loadIms } from '../../utils/ims.js';
import {
  AGENT_EVENT, PART_TYPE, ROLE, TOOL_NAME, TOOL_STATE,
} from './constants.js';
import { readStream } from './utils/stream.js';
import { loadMessages, saveMessages, resetSession, getRoomKey } from './utils/persistence.js';

function affectedFolders(toolName, input) {
  const { org, repo } = input ?? {};
  if (!org || !repo) return [];
  const toParent = (p) => {
    const parts = (p ?? '').replace(/^\//, '').split('/').filter(Boolean);
    parts.pop();
    return `/${org}/${repo}${parts.length ? `/${parts.join('/')}` : ''}`;
  };
  if (toolName === TOOL_NAME.CONTENT_MOVE) {
    return [...new Set([toParent(input.sourcePath), toParent(input.destinationPath)])];
  }
  if (toolName === TOOL_NAME.CONTENT_COPY) return [toParent(input.destinationPath)];
  return input.path ? [toParent(input.path)] : [];
}

const AGENT_URL = new URLSearchParams(window.location.search).get('ref') === 'local'
  ? 'http://localhost:4002/chat'
  : 'https://agent.da.live/chat';

const isToolPart = (p) => p?.type === PART_TYPE.TOOL;
const hasResult = (p) => p.state === TOOL_STATE.OUTPUT_AVAILABLE
  || p.state === TOOL_STATE.OUTPUT_ERROR;
const isDecided = (p) => p.state === TOOL_STATE.APPROVED || p.state === TOOL_STATE.REJECTED;

// Convert a single v1 content part to its v2 equivalent (may drop it).
function migratePart(part, resultsById, msg) {
  if (isToolPart(part) || part.type === PART_TYPE.TEXT) return [part];
  if (part.type === 'tool-call' || part.type === 'tool-input-available') {
    const output = resultsById.has(part.toolCallId)
      ? resultsById.get(part.toolCallId)
      : msg.toolResult?.output;
    // An unresolved v1 tool-call is mid-flight buggy state — drop it.
    if (output === undefined) return [];
    return [{
      type: PART_TYPE.TOOL,
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      input: part.input,
      state: TOOL_STATE.OUTPUT_AVAILABLE,
      output,
    }];
  }
  // tool-approval-request / tool-approval-response → drop
  return [];
}

/**
 * Best-effort migration of persisted v1 histories to the v2 tool-part shape.
 * v1 stored tool activity as separate `tool-call` / `tool-result` /
 * `tool-approval-*` parts, `role: 'tool'` messages and `virtual` assistant
 * messages. v2 collapses each tool invocation into a single `type: 'tool'` part
 * on an assistant message that carries its own lifecycle `state` + `output`.
 * See docs/approval-protocol.md §9.
 */
export function migrateHistory(messages) {
  if (!Array.isArray(messages)) return [];

  const resultsById = new Map();
  messages.forEach((m) => {
    if (m?.role !== ROLE.TOOL || !Array.isArray(m.content)) return;
    m.content.forEach((p) => {
      const isResult = p.type === 'tool-result' || p.type === 'tool-output-available';
      if (!isResult || !p.toolCallId) return;
      resultsById.set(p.toolCallId, p.output?.value ?? p.output ?? p.result);
    });
  });

  return messages.flatMap((m) => {
    if (!m || m.role === ROLE.TOOL) return [];
    const passthrough = m.role === ROLE.USER || typeof m.content === 'string'
      || !Array.isArray(m.content);
    if (passthrough) return [m];
    const parts = m.content.flatMap((p) => migratePart(p, resultsById, m));
    if (!parts.length) return [];
    const migrated = { ...m, content: parts };
    delete migrated.virtual;
    delete migrated.toolResult;
    return [migrated];
  });
}

export default class ChatController {
  constructor({ onUpdate, onToolDone }) {
    this._onUpdate = onUpdate;
    this._onToolDone = onToolDone;
    this._sessionId = crypto.randomUUID();
    this._currentTurnId = crypto.randomUUID();
    // toolCallIds already submitted to the server in a batch — prevents a
    // decided-but-unexecuted part (esp. a rejection) from resending in a loop.
    this._sentToolCallIds = new Set();
  }

  setContext(context) {
    this._context = context;
    this._room = null;
  }

  _pageContextForAgent() {
    const { org, site, path, view } = this._context ?? {};
    return org && site
      ? {
        org,
        site,
        path: path ?? '',
        view,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
      : undefined;
  }

  async _getRoom() {
    if (this._room) return this._room;
    const { userId } = await loadIms();
    const { org, site } = this._context ?? {};
    this._room = getRoomKey({ org, site, userId });
    return this._room;
  }

  async loadInitialMessages() {
    this._messages = [];
    const room = await this._getRoom();
    const { messages: cached, sessionId } = await loadMessages(room);
    this._sessionId = sessionId ?? this._sessionId;
    if (!cached.length) return;
    this._messages = migrateHistory(cached);
    // Anything decided-but-unexecuted was already submitted in a prior session;
    // don't auto-resend it on load.
    this._toolParts()
      .filter((p) => isDecided(p) && !hasResult(p))
      .forEach((p) => this._sentToolCallIds.add(p.toolCallId));
    this._update();
  }

  // Derive the tool-card view for the UI from the single source of truth
  // (`_messages`). Keeping it derived removes the class of bugs that came from
  // maintaining a parallel `_toolCards` map alongside the message history.
  _deriveToolCards() {
    const cards = new Map();
    (this._messages ?? []).forEach((msg) => {
      if (msg.role !== ROLE.ASSISTANT || !Array.isArray(msg.content)) return;
      msg.content.forEach((part) => {
        if (!isToolPart(part)) return;
        cards.set(part.toolCallId, {
          toolName: part.toolName,
          input: part.input,
          state: part.state,
          output: part.output,
          errorText: part.errorText,
          approvalRequired: part.approvalRequired,
        });
      });
    });
    return cards;
  }

  _update() {
    this._onUpdate({
      messages: this._messages,
      thinking: this._thinking,
      streamingText: this._streamingText,
      connected: this._connected,
      toolCards: this._deriveToolCards(),
    });
  }

  async connect(attempt = 0) {
    try {
      await fetch(AGENT_URL, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      this._connected = true;
    } catch {
      this._connected = false;
      const delay = 1000 * 2 ** attempt;
      if (delay < 30000) this._retryTimeout = setTimeout(() => this.connect(attempt + 1), delay);
    } finally {
      this._update();
    }
  }

  _done() {
    this._abortController = null;
    this._thinking = false;
    this._streamingText = undefined;
    this._update();
  }

  stop() {
    this._abortController?.abort();
    this._done();
  }

  async clear() {
    if (this._thinking) this.stop();
    this._messages = undefined;
    this._streamingText = undefined;
    this._autoApprovedTools = new Set();
    this._sentToolCallIds = new Set();
    this._sessionId = crypto.randomUUID();
    this._currentTurnId = crypto.randomUUID();
    this._update();
    const room = await this._getRoom();
    resetSession(room, this._sessionId);
  }

  destroy() {
    clearTimeout(this._retryTimeout);
    this.stop();
  }

  // --- tool-part helpers (operate on the single source of truth) ---

  _findToolPart(toolCallId) {
    const parts = this._toolParts();
    return parts.find((p) => p.toolCallId === toolCallId) ?? null;
  }

  _patchToolPart(toolCallId, patch) {
    this._messages = (this._messages ?? []).map((msg) => {
      if (!Array.isArray(msg.content)) return msg;
      const match = msg.content.some((x) => isToolPart(x) && x.toolCallId === toolCallId);
      if (!match) return msg;
      const content = msg.content.map((x) => (
        isToolPart(x) && x.toolCallId === toolCallId ? { ...x, ...patch } : x
      ));
      return { ...msg, content };
    });
  }

  _toolParts() {
    const parts = [];
    (this._messages ?? []).forEach((msg) => {
      if (msg.role !== ROLE.ASSISTANT || !Array.isArray(msg.content)) return;
      msg.content.forEach((p) => {
        if (isToolPart(p)) parts.push(p);
      });
    });
    return parts;
  }

  _awaitingParts() {
    return this._toolParts().filter((p) => p.state === TOOL_STATE.AWAITING_APPROVAL);
  }

  // Decided (approved/rejected) parts not yet sent to the server — the batch to
  // POST on the next round. Excludes already-sent parts so a rejection (which
  // never gets a client-side result) cannot trigger an endless resend.
  _pendingUnsent() {
    return this._toolParts().filter(
      (p) => isDecided(p) && !hasResult(p) && !this._sentToolCallIds.has(p.toolCallId),
    );
  }

  // --- stream event handling (agent → client) ---

  _onToolEvent = ({
    type, toolCallId, toolName, input, output, errorText, isError, scope,
  }) => {
    if (type === AGENT_EVENT.TOOL_INPUT_AVAILABLE) {
      if (this._findToolPart(toolCallId)) return; // duplicate
      const part = {
        type: PART_TYPE.TOOL,
        toolCallId,
        toolName,
        input,
        state: TOOL_STATE.INPUT_AVAILABLE,
      };
      this._messages = [
        ...this._messages,
        { role: ROLE.ASSISTANT, turnId: this._currentTurnId, content: [part] },
      ];
      this._update();
      return;
    }

    // The agent gates this call behind user approval. Auto-approved tools skip
    // the queue and join the next batch directly.
    if (type === AGENT_EVENT.TOOL_APPROVAL_REQUEST) {
      const existing = this._findToolPart(toolCallId);
      if (!existing) return;
      const autoApprove = this._autoApprovedTools?.has(existing.toolName);
      this._patchToolPart(toolCallId, {
        state: autoApprove ? TOOL_STATE.APPROVED : TOOL_STATE.AWAITING_APPROVAL,
        approvalRequired: true,
      });
      this._update();
      return;
    }

    const isOutput = type === AGENT_EVENT.TOOL_OUTPUT_AVAILABLE
      || type === AGENT_EVENT.TOOL_OUTPUT_ERROR;
    if (!isOutput) return;

    const prior = this._findToolPart(toolCallId);
    if (type === AGENT_EVENT.TOOL_OUTPUT_ERROR || isError) {
      this._patchToolPart(toolCallId, {
        state: TOOL_STATE.OUTPUT_ERROR,
        errorText: errorText ?? output?.error ?? 'Tool error',
      });
      this._update();
      return;
    }

    this._patchToolPart(toolCallId, { state: TOOL_STATE.OUTPUT_AVAILABLE, output });

    // Once content_upload succeeds, replace dataBase64 with contentUrl so
    // continuation POSTs don't retransmit bytes already in storage.
    const contentUrl = output?.source?.contentUrl;
    if (prior?.toolName === TOOL_NAME.CONTENT_UPLOAD && prior?.input?.attachmentRef && contentUrl) {
      this._pendingAttachments = (this._pendingAttachments ?? []).map((a) => {
        if (a.id !== prior.input.attachmentRef) return a;
        return {
          id: a.id,
          fileName: a.fileName,
          mediaType: a.mediaType,
          contentUrl,
          ...(typeof a.sizeBytes === 'number' ? { sizeBytes: a.sizeBytes } : {}),
        };
      });
    }

    this._onToolDone?.(scope, affectedFolders(prior?.toolName ?? toolName, prior?.input ?? input));
    this._update();
  };

  // --- approvals (client → agent), batched ---

  approveToolCall = async (toolCallId, approved, always = false) => {
    const part = this._findToolPart(toolCallId);
    if (!part || part.state !== TOOL_STATE.AWAITING_APPROVAL) return;

    if (always && approved) {
      this._autoApprovedTools ??= new Set();
      this._autoApprovedTools.add(part.toolName);
    }

    this._patchToolPart(toolCallId, {
      state: approved ? TOOL_STATE.APPROVED : TOOL_STATE.REJECTED,
    });

    // "Always approve" drains every still-queued approval of the same tool.
    if (always && approved) {
      this._awaitingParts()
        .filter((p) => p.toolName === part.toolName)
        .forEach((p) => this._patchToolPart(p.toolCallId, { state: TOOL_STATE.APPROVED }));
    }

    this._update();

    // Wait until the whole approval queue for this round is drained, then send
    // one batched POST (the core Bug 1 fix — all decisions in a single request).
    if (this._awaitingParts().length) return;
    const batch = this._pendingUnsent();
    if (!batch.length) {
      this._done();
      return;
    }
    batch.forEach((p) => this._sentToolCallIds.add(p.toolCallId));

    this._thinking = true;
    this._update();
    try {
      await this._stream(this._pageContextForAgent());
    } catch (err) {
      if (err.name !== 'AbortError') {
        this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: `Error: ${err.message}` }];
      }
    } finally {
      this._done();
    }
  };

  // Prune prior-turn non-gated tool reads to bound payload size, mirroring the
  // old virtual-message pruning. Approval-gated tool parts are kept across turns
  // so the agent retains the record of destructive actions it took.
  _messagesForAgent() {
    return (this._messages ?? []).flatMap((msg) => {
      if (msg.role !== ROLE.ASSISTANT || !Array.isArray(msg.content)) return [msg];
      if (!msg.turnId || msg.turnId === this._currentTurnId) return [msg];
      const kept = msg.content.filter((p) => !isToolPart(p) || p.approvalRequired);
      if (!kept.length) return [];
      return kept.length === msg.content.length ? [msg] : [{ ...msg, content: kept }];
    });
  }

  async _stream(pageContext) {
    const [{ accessToken }, room] = await Promise.all([loadIms(), this._getRoom()]);
    this._abortController = new AbortController();

    const resp = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: this._messagesForAgent(),
        pageContext,
        imsToken: accessToken?.token ?? null,
        room,
        sessionId: this._sessionId,
        ...(this._requestedSkills?.length ? { requestedSkills: this._requestedSkills } : {}),
        ...(this._pendingAttachments?.length ? { attachments: this._pendingAttachments } : {}),
        ...this._mcpPayload(),
      }),
      signal: this._abortController.signal,
    });

    if (!resp.ok) {
      throw new Error(`Agent responded with ${resp.status}: ${await resp.text()}`);
    }

    await readStream(resp.body, {
      onDelta: (next) => { this._streamingText = next; this._update(); },
      onText: (text) => {
        this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: text }];
        this._streamingText = '';
        this._update();
        saveMessages(room, this._messages, this._sessionId);
      },
      onTool: this._onToolEvent,
    });

    // Persist tool-part state (approvals/results) as well as text.
    saveMessages(room, this._messages, this._sessionId);

    // Chain rounds: pause for the user if approvals are pending; otherwise, if a
    // decided batch is waiting (e.g. auto-approved tools), send it right away.
    await this._maybeContinue(pageContext);
  }

  async _maybeContinue(pageContext) {
    if (this._awaitingParts().length) return; // wait for the user's decisions
    const batch = this._pendingUnsent();
    if (!batch.length) return;
    batch.forEach((p) => this._sentToolCallIds.add(p.toolCallId));
    await this._stream(pageContext); // execute the auto-approved batch
  }

  setMcpConfig(mcpServers, mcpServerHeaders) {
    this._mcpServers = mcpServers;
    this._mcpServerHeaders = mcpServerHeaders;
  }

  _mcpPayload() {
    const s = this._mcpServers;
    const h = this._mcpServerHeaders;
    return {
      ...(s && Object.keys(s).length ? { mcpServers: s } : {}),
      ...(h && Object.keys(h).length ? { mcpServerHeaders: h } : {}),
    };
  }

  async sendMessage(message, context = [], { requestedSkills = [], attachments = [] } = {}) {
    if (this._thinking || !this._connected) return;

    this._currentTurnId = crypto.randomUUID();
    this._requestedSkills = requestedSkills;
    const selectionContext = context
      .filter((item) => {
        const t = item.type ?? (item.blockName ? 'block' : null);
        if (t === 'block' || t === 'file' || t === 'folder' || t === 'image') return !!item.blockName;
        if (t === 'text') return !!item.innerHTML;
        return false;
      })
      .map((item) => {
        const t = item.type ?? 'block';
        const { proseIndex } = item;
        if (t === 'text') {
          return {
            type: 'text',
            ...(typeof proseIndex === 'number' && { proseIndex }),
            innerHTML: item.innerHTML,
          };
        }
        return {
          type: t,
          ...(typeof proseIndex === 'number' && { proseIndex }),
          blockName: item.blockName,
          ...(item.innerText && { innerText: item.innerText }),
        };
      });

    const attachmentsMeta = attachments.map(({ id, fileName, mediaType, sizeBytes }) => ({
      id,
      fileName,
      mediaType,
      ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
    }));

    const userMessage = {
      role: ROLE.USER,
      content: message,
      ...(selectionContext.length && { selectionContext }),
      ...(attachmentsMeta.length && { attachmentsMeta }),
    };

    this._pendingAttachments = attachments;
    this._messages = [...(this._messages ?? []), userMessage];
    this._thinking = true;
    this._update();

    try {
      await this._stream(this._pageContextForAgent());
    } catch (err) {
      if (err.name !== 'AbortError') {
        this._messages = [
          ...this._messages,
          { role: ROLE.ASSISTANT, content: `Error: ${err.message}` },
        ];
      }
    } finally {
      this._done();
    }
  }
}
