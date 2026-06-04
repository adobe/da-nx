import { loadIms } from '../../utils/ims.js';
import { AGENT_EVENT, ROLE, TOOL_NAME, TOOL_STATE } from './constants.js';
import { readStream } from './utils/stream.js';
import { loadMessages, saveMessages, resetSession } from './utils/persistence.js';

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
  ? 'http://localhost:4200/chat'
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
    return org && site ? { org, site, path: path ?? '', view } : undefined;
  }

  async _getRoom() {
    if (this._room) return this._room;
    const { userId } = await loadIms();
    const { org, site } = this._context ?? {};
    this._room = org && site && userId ? `${org}--${site}--${userId}` : 'default';
    return this._room;
  }

  async loadInitialMessages() {
    this._messages = [];
    const room = await this._getRoom();
    const { messages: cached, sessionId } = await loadMessages(room);
    this._sessionId = sessionId ?? this._sessionId;
    if (!cached.length) return;
    this._messages = stripOrphanedToolCallMessages(cached);
    // Reconstruct tool cards from persisted approval messages so they render on reload.
    this._toolCards = new Map();
    for (const msg of this._messages) {
      if (msg.role === ROLE.ASSISTANT && Array.isArray(msg.content)) {
        const call = msg.content.find((p) => p.type === AGENT_EVENT.TOOL_CALL);
        if (call) {
          const { toolCallId, toolName, input } = call;
          this._toolCards.set(toolCallId, { toolName, input, state: TOOL_STATE.DONE });
        }
      }
    }
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
    } else {
      const prior = next.get(toolCallId) ?? { toolName, input: {} };
      const state = isError ? TOOL_STATE.ERROR : TOOL_STATE.DONE;
      next.set(toolCallId, { ...prior, state, output });
      if (state === TOOL_STATE.DONE) {
        // Skip if a real message already exists for this toolCallId (approval flow adds one).
        const hasApprovalMessage = this._messages.some(
          (m) => !m.virtual && Array.isArray(m.content) && m.content.some(
            (p) => p.type === AGENT_EVENT.TOOL_CALL && p.toolCallId === toolCallId,
          ),
        );
        if (!hasApprovalMessage) {
          // Virtual message: renders the tool card and persists across refreshes.
          // turnId + toolResult let _messagesForAgent() replay this read to the agent.
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
        }

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
      .filter((item) => typeof item.proseIndex === 'number' || item.blockName)
      .map(({ proseIndex, blockName, innerText }) => ({
        ...(typeof proseIndex === 'number' && { proseIndex }),
        ...(blockName && { blockName }),
        ...(innerText && { innerText }),
      }));

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
