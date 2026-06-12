import { loadIms } from '../../../utils/ims.js';
import {
  AGENT_EVENT, FINISH_REASON, ROLE, TOOL_NAME, TOOL_SCOPE, TOOL_STATE,
} from '../constants.js';
import { readStream } from '../utils/stream.js';
import { loadMessages, saveMessages, resetSession } from '../utils/persistence.js';
import { buildAgentMessages, stripOrphanedToolCallMessages, buildUserMessage, wrapOutput } from '../utils/messages.js';
import { affectedFolders } from '../utils/tools.js';
import Turn from './turn.js';

const AGENT_URL = new URLSearchParams(window.location.search).get('ref') === 'local'
  ? 'http://localhost:4200/chat'
  : 'https://agent.da.live/chat';

const emptyBatch = () => ({ toolCalls: [], approvalRequests: [] });

export default class ChatController {
  constructor({ onUpdate, onToolDone }) {
    this._onUpdate = onUpdate;
    this._onToolDone = onToolDone;
    this._sessionId = crypto.randomUUID();
    this._turn = new Turn();
    this._pendingBatch = emptyBatch();
  }

  setContext(context) {
    this._context = context;
    this._room = null;
  }

  setMcpConfig(mcpServers, mcpServerHeaders) {
    this._mcpServers = mcpServers;
    this._mcpServerHeaders = mcpServerHeaders;
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

  async sendMessage(message, context = [], { requestedSkills = [], attachments = [] } = {}) {
    if (this._turn.isActive || !this._connected) return;

    this._turn.begin();
    this._pendingBatch = emptyBatch();
    this._requestedSkills = requestedSkills;
    this._pendingAttachments = attachments;
    this._messages = [...(this._messages ?? []), buildUserMessage(message, context, attachments)];
    this._toolCards = new Map();
    this._skippedToolCallIds = undefined;
    this._update();

    try {
      await this._stream();
    } catch (err) {
      if (err.name !== 'AbortError') {
        this._messages = [
          ...this._messages,
          { role: ROLE.ASSISTANT, content: `Error: ${err.message}` },
        ];
      }
    } finally {
      this._done();
      this._persistMessages();
    }
  }

  approveToolCall = async (toolCallId, approved, always = false) => {
    const card = this._toolCards?.get(toolCallId);
    if (!card?.approvalId) return;

    if (always) {
      this._autoApprovedTools ??= new Set();
      this._autoApprovedTools.add(card.toolName);
    }

    const bulkCards = (always && approved)
      ? [...(this._toolCards ?? [])].filter(([id, c]) => (
        id !== toolCallId && c.toolName === card.toolName
        && c.state === TOOL_STATE.APPROVAL_REQUESTED && c.approvalId
      ))
      : [];

    const next = new Map(this._toolCards ?? []);
    next.set(toolCallId, { ...card, state: approved ? TOOL_STATE.APPROVED : TOOL_STATE.REJECTED });
    for (const [id, c] of bulkCards) {
      next.set(id, { ...c, state: TOOL_STATE.APPROVED });
    }
    this._toolCards = next;

    // Cards that stay APPROVED after the stream had their tool executed server-side without
    // a result being streamed back. Add synthetic tool-results post-stream so the next
    // payload treats them as resolved and doesn't re-trigger the tool.
    const justApproved = approved
      ? new Set([toolCallId, ...bulkCards.map(([id]) => id)])
      : new Set();

    const toResponse = (approvalId, wasApproved) => ({
      role: ROLE.TOOL,
      content: [{ type: AGENT_EVENT.TOOL_APPROVAL_RESPONSE, approvalId, approved: wasApproved }],
    });
    this._messages = [
      ...this._messages,
      toResponse(card.approvalId, approved),
      ...bulkCards.map(([, c]) => toResponse(c.approvalId, true)),
    ];

    // Stream per approval — batching all approvals causes the agent to execute tools
    // internally without streaming results back, so the client never receives them.
    this._turn.resume();
    this._update();

    // Counter (not boolean) so overlapping approval streams don't clear each other's guard.
    this._activeApprovalStreams = (this._activeApprovalStreams ?? 0) + 1;
    let streamErrored = false;
    try {
      await this._stream();
    } catch (err) {
      streamErrored = true;
      if (err.name !== 'AbortError') {
        this._messages = [
          ...this._messages,
          { role: ROLE.ASSISTANT, content: `Error: ${err.message}` },
        ];
      }
    } finally {
      this._activeApprovalStreams -= 1;
      // Close out any approved cards whose tool-results weren't returned by the stream.
      if (!streamErrored) {
        for (const cardId of justApproved) {
          const current = this._toolCards?.get(cardId);
          if (current?.state === TOOL_STATE.APPROVED) {
            const successOutput = wrapOutput({ success: true });
            const updatedCards = new Map(this._toolCards ?? []);
            updatedCards.set(cardId, {
              ...current, state: TOOL_STATE.DONE, output: { success: true },
            });
            this._toolCards = updatedCards;
            this._messages = [
              ...this._messages,
              {
                role: ROLE.TOOL,
                content: [{
                  type: AGENT_EVENT.TOOL_RESULT,
                  toolCallId: cardId,
                  toolName: current.toolName,
                  output: successOutput,
                }],
              },
            ];
            const scope = TOOL_SCOPE[current.toolName];
            this._onToolDone?.(scope, affectedFolders(current.toolName, current.input));
          }
        }
      }
      this._done();
      this._persistMessages();
    }
  };

  stop() {
    this._abortController?.abort();
    this._abortController = null;
    this._streamingText = undefined;
    this._pendingContinuation = false;
    this._turn.cancel();
    this._update();
  }

  async clear() {
    if (this._turn.isActive) this.stop();
    this._messages = undefined;
    this._streamingText = undefined;
    this._toolCards = new Map();
    this._autoApprovedTools = new Set();
    this._pendingBatch = emptyBatch();
    this._pendingContinuation = false;
    this._sessionId = crypto.randomUUID();
    this._activeApprovalStreams = 0;
    this._turn.cancel();
    this._update();
    const room = await this._getRoom();
    resetSession(room, this._sessionId);
  }

  destroy() {
    clearTimeout(this._retryTimeout);
    this.stop();
  }

  async _stream() {
    const [{ accessToken }, room] = await Promise.all([loadIms(), this._getRoom()]);
    this._abortController = new AbortController();

    const payload = this._buildPayload(room, accessToken);

    const resp = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
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
      onFinish: (finishReason) => this._onStreamFinish(room, finishReason),
    });
  }

  _buildPayload(room, accessToken) {
    const liveToolCallIds = new Set(
      [...(this._toolCards ?? [])].filter(([, c]) => (
        c.state !== TOOL_STATE.DONE && c.state !== TOOL_STATE.ERROR
      )).map(([id]) => id),
    );
    return {
      messages: buildAgentMessages(this._messages ?? [], { liveToolCallIds }),
      pageContext: this._pageContextForAgent(),
      imsToken: accessToken?.token ?? null,
      room,
      sessionId: this._sessionId,
      ...(this._requestedSkills?.length ? { requestedSkills: this._requestedSkills } : {}),
      ...(this._pendingAttachments?.length ? { attachments: this._pendingAttachments } : {}),
      ...(this._mcpServers && Object.keys(this._mcpServers).length
        ? { mcpServers: this._mcpServers } : {}),
      ...(this._mcpServerHeaders && Object.keys(this._mcpServerHeaders).length
        ? { mcpServerHeaders: this._mcpServerHeaders } : {}),
    };
  }

  _done() {
    this._abortController = null;
    this._streamingText = undefined;
    if (this._pendingContinuation) {
      this._continueTurn(); return;
    }
    this._pendingBatch = emptyBatch();
    // Turn ends only when all approval streams have finished and no cards are awaiting decision.
    const hasPendingCards = [...(this._toolCards ?? [])].some(
      ([, c]) => c.state === TOOL_STATE.APPROVAL_REQUESTED,
    );
    if (!this._activeApprovalStreams && !hasPendingCards) this._turn.end();
    this._update();
  }

  _continueTurn() {
    this._pendingContinuation = false;
    this._pendingBatch = emptyBatch();
    this._turn.resume();
    this._update();
    this._stream().catch((err) => {
      if (err.name !== 'AbortError') {
        this._messages = [
          ...this._messages,
          { role: ROLE.ASSISTANT, content: `Error: ${err.message}` },
        ];
      }
    }).finally(() => this._done());
  }

  _onToolEvent = ({
    type, toolCallId, toolName, input, output, isError, approvalId, scope,
  }) => {
    if (type === AGENT_EVENT.TOOL_CALL) this._onToolCall(toolCallId, toolName, input);
    else if (type === AGENT_EVENT.TOOL_APPROVAL_REQUEST) {
      this._onApprovalRequest(toolCallId, toolName, approvalId);
    } else {
      this._onToolResult(toolCallId, toolName, output, isError, scope);
    }
  };

  _onToolCall(toolCallId, toolName, input) {
    const isDuplicate = this._toolCards?.has(toolCallId);

    // Same toolName+path in one LLM step is a model error — skip the duplicate and block
    // its _onApprovalRequest to keep it out of message history.
    const pathKey = input?.path ?? input?.destinationPath;
    const isPathDuplicate = !isDuplicate && !!pathKey
      && [...(this._toolCards ?? [])].some(([, c]) => (
        c.toolName === toolName
        && (c.input?.path ?? c.input?.destinationPath) === pathKey
        && (c.state === TOOL_STATE.RUNNING
          || c.state === TOOL_STATE.APPROVAL_REQUESTED
          || c.state === TOOL_STATE.APPROVED)
      ));

    if (isDuplicate || isPathDuplicate) {
      if (isPathDuplicate) {
        this._skippedToolCallIds ??= new Set();
        this._skippedToolCallIds.add(toolCallId);
      }
      return;
    }
    const next = new Map(this._toolCards ?? []);
    next.set(toolCallId, { toolName, input, state: TOOL_STATE.RUNNING });
    this._pendingBatch.toolCalls.push({ toolCallId, toolName, input });
    this._toolCards = next;
    this._update();
  }

  _onApprovalRequest(toolCallId, toolName, approvalId) {
    if (this._skippedToolCallIds?.has(toolCallId)) return;
    const existingCard = this._toolCards?.get(toolCallId);
    const settled = existingCard?.state;
    if (settled && settled !== TOOL_STATE.RUNNING) return;
    // prior carries toolName/input from the earlier TOOL_CALL event.
    const prior = existingCard ?? { toolName, input: {} };
    const autoApprove = this._autoApprovedTools?.has(prior.toolName ?? toolName);
    this._pendingBatch.approvalRequests.push({ approvalId, toolCallId });
    this._turn.pause();
    const next = new Map(this._toolCards ?? []);
    next.set(toolCallId, {
      ...prior,
      state: autoApprove ? TOOL_STATE.APPROVED : TOOL_STATE.APPROVAL_REQUESTED,
      approvalId,
    });
    this._toolCards = next;

    // Commit immediately — waiting until _onStreamFinish risks the user approving before the
    // message is in _messages, which orphans the response and causes a prefill error.
    const toolCallPart = {
      type: AGENT_EVENT.TOOL_CALL,
      toolCallId,
      toolName: prior.toolName,
      input: prior.input,
    };
    const approvalRequestPart = { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId, toolCallId };
    // Remove this tool-call from the pending batch so _onStreamFinish doesn't re-commit it.
    this._pendingBatch.toolCalls = this._pendingBatch.toolCalls
      .filter((c) => c.toolCallId !== toolCallId);
    this._appendAssistantMessage([toolCallPart, approvalRequestPart]);
    this._update();
  }

  _onToolResult(toolCallId, toolName, output, isError, scope) {
    const prior = this._toolCards?.get(toolCallId) ?? { toolName, input: {} };
    const state = isError ? TOOL_STATE.ERROR : TOOL_STATE.DONE;
    const next = new Map(this._toolCards ?? []);
    next.set(toolCallId, { ...prior, state, output });
    this._toolCards = next;

    // Evict from batch regardless of outcome — error results must not bleed into a later commit.
    const pendingCall = this._pendingBatch.toolCalls.find((c) => c.toolCallId === toolCallId);
    this._pendingBatch.toolCalls = this._pendingBatch.toolCalls
      .filter((c) => c.toolCallId !== toolCallId);

    if (state === TOOL_STATE.DONE) {
      const wrapped = wrapOutput(output);
      if (pendingCall) {
        // Non-approval tool: commit call+result, merging with any preceding text message.
        const toolCallPart = {
          type: AGENT_EVENT.TOOL_CALL,
          toolCallId,
          toolName: pendingCall.toolName,
          input: pendingCall.input,
        };
        const toolResultMsg = {
          role: ROLE.TOOL,
          content: [{
            type: AGENT_EVENT.TOOL_RESULT,
            toolCallId,
            toolName: pendingCall.toolName,
            output: wrapped,
          }],
        };
        this._appendAssistantMessage([toolCallPart], toolResultMsg);
      } else {
        // Approval tool result arriving in the continuation stream.
        this._messages = [
          ...this._messages,
          {
            role: ROLE.TOOL,
            content: [{
              type: AGENT_EVENT.TOOL_RESULT,
              toolCallId,
              toolName: prior.toolName,
              output: wrapped,
            }],
          },
        ];
      }

      this._replaceUploadRef(prior, output);
      this._onToolDone?.(scope, affectedFolders(toolName, prior.input));
    }

    this._update();
  }

  // Handle stream finish: approval messages were already committed eagerly in _onApprovalRequest,
  // so here we only need to add auto-approve responses and set the continuation flag.
  _onStreamFinish(room, finishReason) {
    const { approvalRequests } = this._pendingBatch;
    this._pendingBatch = emptyBatch();
    if (approvalRequests.length) {
      // Auto-approved: add responses and continue. Skip any already added by approveToolCall
      // (race: user approved before this stream ended).
      const autoApproved = approvalRequests.filter(({ toolCallId }) => (
        this._toolCards?.get(toolCallId)?.state === TOOL_STATE.APPROVED
      ));
      if (autoApproved.length === approvalRequests.length) {
        let added = 0;
        for (const { approvalId } of autoApproved) {
          const alreadyResponded = this._messages.some(
            (m) => m.role === ROLE.TOOL && Array.isArray(m.content)
              && m.content.some((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_RESPONSE
                && p.approvalId === approvalId),
          );
          if (!alreadyResponded) {
            this._messages = [
              ...this._messages,
              {
                role: ROLE.TOOL,
                content: [{ type: AGENT_EVENT.TOOL_APPROVAL_RESPONSE, approvalId, approved: true }],
              },
            ];
            added += 1;
          }
        }
        if (added > 0) this._pendingContinuation = true;
      }
      this._update();
    }

    const lastRole = this._messages[this._messages.length - 1]?.role;
    if (!this._pendingContinuation && !approvalRequests.length
      && finishReason === FINISH_REASON.TOOL_CALLS
      && lastRole !== ROLE.ASSISTANT) {
      this._pendingContinuation = true;
    }

    saveMessages(room, this._messages, this._sessionId);
  }

  // Appends an assistant message whose content is `parts`, merging into the preceding
  // text-only assistant message if one exists (consecutive assistant messages are rejected).
  _appendAssistantMessage(parts, ...trailing) {
    const prev = this._messages[this._messages.length - 1];
    if (prev?.role === ROLE.ASSISTANT && typeof prev.content === 'string') {
      this._messages = [
        ...this._messages.slice(0, -1),
        { role: ROLE.ASSISTANT, content: [{ type: 'text', text: prev.content }, ...parts] },
        ...trailing,
      ];
    } else {
      this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: parts }, ...trailing];
    }
  }

  // Once content_upload succeeds, replace dataBase64 with contentUrl so
  // continuation POSTs don't retransmit bytes already in storage.
  _replaceUploadRef(prior, output) {
    const contentUrl = output?.source?.contentUrl;
    if (prior.toolName !== TOOL_NAME.CONTENT_UPLOAD || !prior.input?.attachmentRef || !contentUrl) {
      return;
    }
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

  // Persists current messages. Called at stream end (success or error) so that the user's
  // input and any error message survive a page reload even when no text was streamed.
  _persistMessages() {
    if (!this._messages) return;
    this._getRoom().then((room) => saveMessages(room, this._messages, this._sessionId));
  }

  _update() {
    this._onUpdate({
      messages: this._messages,
      thinking: this._turn.isActive,
      streamingText: this._streamingText,
      connected: this._connected,
      toolCards: this._toolCards,
    });
  }

  async _getRoom() {
    if (this._room) return this._room;
    const { userId } = await loadIms();
    const { org, site } = this._context ?? {};
    this._room = org && site && userId ? `${org}--${site}--${userId}` : 'default';
    return this._room;
  }

  _pageContextForAgent() {
    const { org, site, path, view } = this._context ?? {};
    return org && site ? { org, site, path: path ?? '', view } : undefined;
  }
}
