import { loadIms } from '../../utils/ims.js';
import { AGENT_EVENT, ROLE, TOOL_NAME, TOOL_STATE } from './constants.js';
import { readStream } from './utils/stream.js';
import { mcpToolName } from './utils/tool-name.js';
import { loadMessages, saveMessages, resetSession, getRoomKey } from './utils/persistence.js';

// Tools whose card shows a live loading state while executing need a message created at
// tool-call time to render from. Tools that go through approval get their message from the
// approval branch instead, so we only pre-create for non-approval loading cards.
function rendersWhileRunning(toolName) {
  return mcpToolName(toolName) === TOOL_NAME.EVALUATE_PAGE;
}

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

/**
 * Drop assistant array-content messages whose tool-call IDs have no matching
 * tool-result anywhere in the history. These orphans appear when the agent's
 * streamText step-limit fires mid-tool-execution or when the client strips
 * virtual (non-approval) tool results. Without this filter the Anthropic API
 * rejects the request with "tool_use ids without tool_result blocks".
 */
function stripOrphanedToolCallMessages(messages) {
  const resolvedIds = new Set();
  const requestedApprovalIds = new Set();
  const respondedApprovalIds = new Set();
  for (const msg of messages) {
    if (msg.role === ROLE.ASSISTANT && Array.isArray(msg.content)) {
      for (const p of msg.content) {
        if (p.type === AGENT_EVENT.TOOL_APPROVAL_REQUEST && p.approvalId) {
          requestedApprovalIds.add(p.approvalId);
        }
      }
    }
    if (msg.role === ROLE.TOOL && Array.isArray(msg.content)) {
      for (const p of msg.content) {
        if (p.type === AGENT_EVENT.TOOL_RESULT && p.toolCallId) resolvedIds.add(p.toolCallId);
        if (p.type === AGENT_EVENT.TOOL_APPROVAL_RESPONSE && p.approvalId) {
          respondedApprovalIds.add(p.approvalId);
        }
      }
    }
    // A virtual tool card stores its result inline in `toolResult` (no separate role:tool
    // message), so it is self-resolved — otherwise it would be dropped as an orphan on
    // reload and the card would vanish on refresh.
    if (msg.virtual && msg.toolResult && Array.isArray(msg.content)) {
      for (const p of msg.content) {
        if (p.type === AGENT_EVENT.TOOL_CALL && p.toolCallId) resolvedIds.add(p.toolCallId);
      }
    }
  }
  // An approval is "complete" only when both request and response exist.
  // Incomplete approvals (e.g. session interrupted mid-flow) are treated as orphans.
  const completeApprovalIds = new Set(
    [...respondedApprovalIds].filter((id) => requestedApprovalIds.has(id)),
  );

  return messages.filter((msg) => {
    // Strip dangling approval-response messages whose request was already dropped.
    if (msg.role === ROLE.TOOL && Array.isArray(msg.content)) {
      const resp = msg.content.find((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_RESPONSE);
      if (resp) return completeApprovalIds.has(resp.approvalId);
      return true;
    }
    if (msg.role !== ROLE.ASSISTANT || !Array.isArray(msg.content)) return true;
    const calls = msg.content.filter((p) => p.type === AGENT_EVENT.TOOL_CALL);
    if (calls.length === 0) return true;
    const approvals = msg.content.filter((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_REQUEST);
    if (approvals.length > 0) {
      // Keep only if every approval in this message has a corresponding response.
      return approvals.every((a) => completeApprovalIds.has(a.approvalId));
    }
    return calls.every((c) => resolvedIds.has(c.toolCallId));
  });
}

/**
 * Rebuild the toolCards map from persisted messages so cards render on reload. Restores
 * the stored output (from a virtual message's `toolResult`) and derives the terminal state
 */
function reconstructToolCards(messages) {
  const cards = new Map();
  for (const msg of messages) {
    if (msg.role === ROLE.ASSISTANT && Array.isArray(msg.content)) {
      const call = msg.content.find((p) => p.type === AGENT_EVENT.TOOL_CALL);
      if (call) {
        const { toolCallId, toolName, input } = call;
        const output = msg.toolResult?.output;
        const isError = output && typeof output === 'object' && 'error' in output;
        cards.set(toolCallId, {
          toolName, input, output, state: isError ? TOOL_STATE.ERROR : TOOL_STATE.DONE,
        });
      }
    }
  }
  return cards;
}

export { stripOrphanedToolCallMessages, reconstructToolCards };

export default class ChatController {
  constructor({ onUpdate, onToolDone }) {
    this._onUpdate = onUpdate;
    this._onToolDone = onToolDone;
    this._sessionId = crypto.randomUUID();
    this._currentTurnId = crypto.randomUUID();
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
    this._messages = stripOrphanedToolCallMessages(cached);
    // Reconstruct tool cards (with their stored output) so they render on reload.
    this._toolCards = reconstructToolCards(this._messages);
    this._update();
  }

  _update() {
    this._onUpdate({
      messages: this._messages,
      thinking: this._thinking,
      streamingText: this._streamingText,
      connected: this._connected,
      toolCards: this._toolCards,
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
    this._toolCards = new Map();
    this._autoApprovedTools = new Set();
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

  _onToolEvent = ({
    type, toolCallId, toolName, input, output, isError, approvalId, scope,
  }) => {
    const next = new Map(this._toolCards ?? []);

    if (type === AGENT_EVENT.TOOL_CALL) {
      if (next.has(toolCallId)) return; // duplicate — ignore
      next.set(toolCallId, { toolName, input, state: TOOL_STATE.RUNNING });
      if (rendersWhileRunning(toolName)) {
        // Pre-create a virtual message so the loading card renders while the tool runs.
        // No toolResult yet, so _messagesForAgent() skips it until the result arrives.
        this._messages = [
          ...this._messages,
          {
            role: ROLE.ASSISTANT,
            virtual: true,
            turnId: this._currentTurnId,
            content: [{ type: AGENT_EVENT.TOOL_CALL, toolCallId, toolName, input }],
          },
        ];
      }
    } else if (type === AGENT_EVENT.TOOL_APPROVAL_REQUEST) {
      const existingCard = next.get(toolCallId);
      const settled = existingCard?.state;
      if (settled === TOOL_STATE.APPROVED || settled === TOOL_STATE.REJECTED
        || settled === TOOL_STATE.DONE || settled === TOOL_STATE.ERROR) return;
      // prior carries the toolName from the earlier TOOL_CALL event; the TOOL_APPROVAL_REQUEST
      // event from da-agent omits toolName, so we cannot rely on the destructured value here.
      const prior = existingCard ?? { toolName, input: {} };
      const autoApprove = this._autoApprovedTools?.has(prior.toolName ?? toolName);
      // Promote to _messages now that we know approval is needed.
      // Both parts go in one message — resolveApprovals() matches tool-approval-request
      // to tool-call by toolCallId within the same assistant message.
      this._messages = [
        ...this._messages,
        {
          role: ROLE.ASSISTANT,
          content: [
            {
              type: AGENT_EVENT.TOOL_CALL,
              toolCallId,
              toolName: prior.toolName,
              input: prior.input,
            },
            { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId, toolCallId },
          ],
        },
      ];
      const state = autoApprove ? TOOL_STATE.APPROVED : TOOL_STATE.APPROVAL_REQUESTED;
      next.set(toolCallId, { ...prior, state, approvalId });
      this._toolCards = next;
      this._update();
      if (autoApprove) queueMicrotask(() => this.approveToolCall(toolCallId, true));
      return;
    } else if (type === AGENT_EVENT.CONTINUATION) {
      // Post-execution gate: the tool already finished (card is DONE, result shown).
      // Flag it as awaiting a Continue/Stop decision. Ephemeral (UI-only) — nothing is
      // pushed to _messages, so a reload simply drops the prompt while the result persists.
      const card = next.get(toolCallId);
      if (!card) return;
      next.set(toolCallId, { ...card, continuationPending: true });
      this._toolCards = next;
      this._update();
      return;
    } else {
      const prior = next.get(toolCallId) ?? { toolName, input: {} };
      const state = isError ? TOOL_STATE.ERROR : TOOL_STATE.DONE;
      next.set(toolCallId, { ...prior, state, output });

      // Render + persist a card for any terminal result — success OR error. Errors must
      // create a card too: otherwise a failed tool leaves the user with a continuation
      // prompt but no visible result to review.
      const existingIdx = this._messages.findIndex(
        (m) => Array.isArray(m.content) && m.content.some(
          (p) => p.type === AGENT_EVENT.TOOL_CALL && p.toolCallId === toolCallId,
        ),
      );
      if (existingIdx === -1) {
        // No message yet — create a virtual one. turnId + toolResult let
        // _messagesForAgent() replay this result to the agent (and it persists on refresh).
        this._messages = [
          ...this._messages,
          {
            role: ROLE.ASSISTANT,
            virtual: true,
            turnId: this._currentTurnId,
            toolResult: { output },
            content: [{
              type: AGENT_EVENT.TOOL_CALL,
              toolCallId,
              toolName: prior.toolName,
              input: prior.input,
            }],
          },
        ];
      } else if (this._messages[existingIdx].virtual) {
        // A running virtual message already exists.
        // Attach the result in place so the card updates and can be replayed — no duplicate.
        this._messages = this._messages.map((m, i) => (
          i === existingIdx ? { ...m, toolResult: { output } } : m
        ));
      }
      // else: a real (approval) message already carries this call; leave it untouched.

      if (state === TOOL_STATE.DONE) {
        // Once content_upload succeeds, replace dataBase64 with contentUrl so
        // continuation POSTs don't retransmit bytes already in storage.
        const contentUrl = output?.source?.contentUrl;
        if (prior.toolName === 'content_upload' && prior.input?.attachmentRef && contentUrl) {
          this._pendingAttachments = (this._pendingAttachments ?? []).map((a) => (
            a.id === prior.input.attachmentRef
              ? { id: a.id, fileName: a.fileName, mediaType: a.mediaType, contentUrl, ...(typeof a.sizeBytes === 'number' ? { sizeBytes: a.sizeBytes } : {}) }
              : a
          ));
        }

        this._onToolDone?.(scope, affectedFolders(toolName, prior.input));
      }
    }

    this._toolCards = next;
    this._update();
  };

  approveToolCall = async (toolCallId, approved, always = false) => {
    const card = this._toolCards.get(toolCallId);
    if (!card?.approvalId) return;

    if (always) {
      this._autoApprovedTools ??= new Set();
      this._autoApprovedTools.add(card.toolName);
    }

    const next = new Map(this._toolCards ?? []);
    next.set(toolCallId, { ...card, state: approved ? TOOL_STATE.APPROVED : TOOL_STATE.REJECTED });

    // When "always approve" is clicked, bulk-approve any other pending parallel calls
    // with the same tool name so they don't surface their own popovers.
    const bulkApprovalMessages = [];
    if (always && approved) {
      for (const [id, c] of next) {
        if (id !== toolCallId && c.toolName === card.toolName
          && c.state === TOOL_STATE.APPROVAL_REQUESTED && c.approvalId) {
          next.set(id, { ...c, state: TOOL_STATE.APPROVED });
          bulkApprovalMessages.push({
            role: ROLE.TOOL,
            content: [{
              type: AGENT_EVENT.TOOL_APPROVAL_RESPONSE, approvalId: c.approvalId, approved: true,
            }],
          });
        }
      }
    }

    this._toolCards = next;

    const { approvalId } = card;
    this._messages = [
      ...this._messages,
      {
        role: ROLE.TOOL,
        content: [{ type: AGENT_EVENT.TOOL_APPROVAL_RESPONSE, approvalId, approved }],
      },
      ...bulkApprovalMessages,
    ];
    this._thinking = approved;
    this._update();

    if (approved) {
      try {
        await this._stream(this._pageContextForAgent());
      } catch (err) {
        if (err.name !== 'AbortError') {
          this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: `Error: ${err.message}` }];
        }
      } finally {
        this._done();
      }
    } else {
      this._done();
    }
  };

  /** Clear the ephemeral continuation-pending flag from every tool card. */
  _clearContinuationPending() {
    const next = new Map(this._toolCards ?? []);
    for (const [id, card] of next) {
      if (card.continuationPending) next.set(id, { ...card, continuationPending: false });
    }
    this._toolCards = next;
  }

  // Continuation gate — user chose "Continue": resume the agentic loop. The gated tool's
  // result is already persisted for the current turn, so re-streaming replays it to the
  // agent (keeping the same turnId) and the model picks up where it left off.
  continueExecution = async () => {
    this._clearContinuationPending();
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

  // Continuation gate — user chose "Stop": record the decision as a user message and halt.
  // No re-stream and no assistant reply — the turn simply ends (code-driven, not the LLM).
  stopExecution = async () => {
    this._clearContinuationPending();
    this._messages = [
      ...this._messages,
      { role: ROLE.USER, content: 'User decided not to continue further.' },
    ];
    this._update();
    const room = await this._getRoom();
    saveMessages(room, this._messages, this._sessionId);
  };

  // Adds in the tool calls and tool results for the current turn so the agent can replay them.
  _messagesForAgent() {
    const represented = new Set();
    this._messages.forEach((msg) => {
      if (msg.virtual || msg.role !== ROLE.ASSISTANT || !Array.isArray(msg.content)) return;
      msg.content.forEach((part) => {
        if (part.type === AGENT_EVENT.TOOL_CALL) represented.add(part.toolCallId);
      });
    });

    return this._messages.flatMap((msg) => {
      if (!msg.virtual) return [msg];
      if (msg.turnId !== this._currentTurnId || !msg.toolResult) return [];
      const call = msg.content?.find((p) => p.type === AGENT_EVENT.TOOL_CALL);
      if (!call || represented.has(call.toolCallId)) return [];
      const { output } = msg.toolResult;
      const { toolCallId, toolName, input } = call;
      const wrapped = typeof output === 'string'
        ? { type: 'text', value: output }
        : { type: 'json', value: output };
      return [
        {
          role: ROLE.ASSISTANT,
          content: [{ type: AGENT_EVENT.TOOL_CALL, toolCallId, toolName, input }],
        },
        {
          role: ROLE.TOOL,
          content: [{ type: AGENT_EVENT.TOOL_RESULT, toolCallId, toolName, output: wrapped }],
        },
      ];
    });
  }

  async _stream(pageContext) {
    const [{ accessToken }, room] = await Promise.all([loadIms(), this._getRoom()]);
    this._abortController = new AbortController();

    const resp = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: stripOrphanedToolCallMessages(this._messagesForAgent()),
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

    // Persist once the turn ends. A tool-only turn
    // produces no assistant text, so onText never fires — without this
    // its card would never be saved and would vanish on refresh.
    saveMessages(room, this._messages, this._sessionId);
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

    this._toolCards = new Map();

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
