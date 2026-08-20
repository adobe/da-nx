import { loadIms } from '../../../utils/ims.js';
import { env } from '../../../scripts/nx.js';
import { daFetch } from '../../../utils/api.js';
import { DA_ADMIN } from '../../../utils/utils.js';
import {
  loadMessages, saveMessages, resetSession, getRoomKey,
} from '../utils/persistence.js';
import { buildSelectionContext, buildAttachmentsMeta } from '../utils/chat-helpers.js';
import { AO_EVENT, AO_FRAME, AO_TOOL_STATE } from './ao-constants.js';

const AO_REGION = 'va7';

const AO_WS_BASE = {
  prod: `wss://agent-orchestrator-prod-${AO_REGION}.adobe.io`,
  stage: `wss://agent-orchestrator-stage-${AO_REGION}.adobe.io`,
};

const AO_HTTP_BASE = {
  prod: `https://agent-orchestrator-prod-${AO_REGION}.adobe.io`,
  stage: `https://agent-orchestrator-stage-${AO_REGION}.adobe.io`,
};

const AO_MANIFEST_ID = 'experience-workspace';

function getOrgId(projectedProductContext) {
  return projectedProductContext?.find((p) => p.prodCtx?.owningEntity)?.prodCtx.owningEntity;
}

function isAoEpisodeId(id) {
  return id != null && /^\d+$/.test(String(id));
}

function parseToolArguments(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function summarizeToolInput(input, { json = false } = {}) {
  if (!input) return null;
  const {
    humanReadableSummary, sourcePath, destinationPath, path, skillId, name,
  } = input;
  return humanReadableSummary
    ?? (sourcePath && destinationPath ? `${sourcePath} → ${destinationPath}` : null)
    ?? path ?? skillId ?? name
    ?? (json ? JSON.stringify(input, null, 2) : null);
}

function toToolCardDisplay(card) {
  const { toolName, input, state } = card;
  return {
    toolName,
    detail: summarizeToolInput(input, { json: true }),
    hidden: state === AO_TOOL_STATE.APPROVAL_REQUESTED,
    failed: state === AO_TOOL_STATE.REJECTED,
    state,
  };
}

function toApprovalDisplay(toolCallId, card) {
  return { toolCallId, toolName: card.toolName, summary: summarizeToolInput(card.input) };
}

function base64ToBlob(base64, mediaType) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i += 1) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mediaType });
}

async function uploadAttachmentToAo({ fileName, mediaType, dataBase64 }) {
  if (!dataBase64) return null;
  const { accessToken, projectedProductContext } = await loadIms();
  const orgId = getOrgId(projectedProductContext);
  const base = AO_HTTP_BASE[env] ?? AO_HTTP_BASE.stage;

  try {
    // Single multipart POST — matches the deployed backend's `POST /api/v1/files`
    // (multipart field name "file"), which returns 201 with
    // [{ id, filename, mime_type, size_bytes, created_at }]. `id` is used verbatim
    // as the USER_INPUT.attachments[].artifactId. (The previous two-phase
    // initiate/PUT/finalize presigned flow was never implemented server-side, so
    // every upload failed and fell back to inlining — which 400s on large files.)
    const form = new FormData();
    form.append('file', base64ToBlob(dataBase64, mediaType), fileName);
    const resp = await fetch(`${base}/api/v1/files`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken?.token}`,
        'x-tenant-id': orgId,
        // No x-user-id: the Files API only requires Authorization + x-tenant-id
        // (claudebridge requireAuthHeaders), and the endpoint's CORS policy does
        // not allow x-user-id — sending it fails the preflight. (x-user-id is
        // only needed by the Skills API's requireSkillAuthHeaders.)
        // No content-type — fetch derives the multipart boundary from FormData.
      },
      body: form,
    });
    if (!resp.ok) return null;
    const files = await resp.json();
    const id = Array.isArray(files) ? files[0]?.id : files?.id;
    return id ?? null;
  } catch {
    return null;
  }
}

/**
 * Talks to Adobe's Agent Orchestrator (AO) over its WebSocket transport (see
 * https://aep-ao.pages.adobeitc.com/api-reference/spec/) instead of da-agent.
 * Handles message-in/message-out, tool-call permission requests, user questions,
 * plan approval, and a2ui artifacts.
 *
 * Public surface used by chat.js mirrors chat-controller.js's (connect,
 * setContext, loadInitialMessages, sendMessage, approveToolCall, clear,
 * setMcpConfig, stop, destroy) plus AO-only additions chat.js gates on
 * (answerQuestion, declineQuestion, respondToPlanApproval) — da-agent's
 * controller has no equivalent of these, since it has no concept of
 * questions/plans. Skill lookup (getSkills) moved to nx-chat-ao
 * (chat-ao/utils/skills.js), not handled here.
 *
 * Output boundary: `_update()` only ever hands chat.js backend-neutral shapes
 * (see toToolCardDisplay/toApprovalDisplay above) — AO's own state names never
 * leak past this file.
 */
export default class ChatControllerAO {
  constructor({ onUpdate }) {
    this._onUpdate = onUpdate;
  }

  setContext(context) {
    this._context = context;
    this._room = null;
  }

  async _getRoom() {
    if (this._room) return this._room;
    const { userId } = await loadIms();
    const { org, site } = this._context ?? {};
    this._room = getRoomKey({ org, site, userId });
    return this._room;
  }

  async _loadPersisted() {
    if (this._persistedLoaded) return;
    this._persistedLoaded = true;
    const room = await this._getRoom();
    const { messages, sessionId: episodeId } = await loadMessages(room);
    if (messages.length) this._messages = messages;
    this._episodeId = isAoEpisodeId(episodeId) ? episodeId : undefined;
  }

  _persist() {
    this._getRoom().then((room) => saveMessages(room, this._messages, this._episodeId));
  }

  async loadInitialMessages() {
    this._messages = this._messages ?? [];
    await this._loadPersisted();
    this._update();
  }

  _update() {
    const toolCards = new Map();
    let pendingApproval = null;
    (this._toolCards ?? new Map()).forEach((card, toolCallId) => {
      toolCards.set(toolCallId, toToolCardDisplay(card));
      if (!pendingApproval && card.state === AO_TOOL_STATE.APPROVAL_REQUESTED) {
        pendingApproval = toApprovalDisplay(toolCallId, card);
      }
    });

    this._onUpdate({
      messages: this._messages,
      thinking: this._thinking,
      streamingText: this._streamingText,
      connected: this._connected,
      toolCards,
      pendingApproval,
      pendingQuestion: this._pendingQuestion,
      pendingPlanApproval: this._pendingPlanApproval,
    });
  }

  _parse(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  _handlePermissionRequest(evt) {
    const turnId = evt.data?.turn_id ?? evt.turn_id;
    const pendingCalls = (evt.data?.pending_calls ?? [])
      .filter((c) => c.needs_permission !== false);
    const next = new Map(this._toolCards ?? []);
    pendingCalls.forEach((call) => {
      next.set(call.id, {
        toolName: call.name,
        input: parseToolArguments(call.arguments),
        state: AO_TOOL_STATE.APPROVAL_REQUESTED,
        turnId,
      });
    });
    this._toolCards = next;
    this._update();
  }

  _handleUserQuestion(evt) {
    this._pendingQuestion = {
      turnId: evt.data?.turn_id ?? evt.turn_id,
      questions: evt.data?.questions ?? [],
      context: evt.data?.context,
    };
    this._update();
  }

  _handlePlanApprovalRequest(evt) {
    this._pendingPlanApproval = {
      turnId: evt.data?.turn_id ?? evt.turn_id,
      planContent: evt.data?.plan_content ?? '',
      planFilePath: evt.data?.plan_file_path,
    };
    this._update();
  }

  _handleUiArtifactCreated(evt) {
    const artifact = evt.data?.artifact;
    if (!artifact) return;
    this._messages = [...this._messages, {
      role: 'assistant',
      uiArtifact: {
        id: artifact.id,
        components: artifact.a2ui_surface?.components ?? [],
        textFallback: artifact.text_fallback,
        title: artifact.display_hints?.title,
      },
    }];
    this._persist();
    this._update();
  }

  _handleServerEvent(evt) {
    if (evt.type === AO_EVENT.SESSION_READY) {
      // Arrives after the first USER_INPUT is processed (see _openSocket's grace-timer
      // comment) — carries the episode id a future reload should reconnect to.
      this._episodeId = evt.episode_id ?? this._episodeId;
      this._persist();
      return;
    }

    if (evt.type === AO_EVENT.TEXT_DELTA) {
      this._streaming += evt.data?.content ?? '';
      this._streamingText = this._streaming;
      this._update();
      return;
    }

    if (evt.type === AO_EVENT.TEXT_DONE) {
      this._messages = [...this._messages, {
        role: 'assistant',
        content: evt.data?.content ?? this._streaming,
      }];
      this._streaming = '';
      this._streamingText = undefined;
      this._persist();
      this._update();
      return;
    }

    if (evt.type === AO_EVENT.PERMISSION_REQUEST) {
      this._handlePermissionRequest(evt);
      return;
    }

    if (evt.type === AO_EVENT.USER_QUESTION) {
      this._handleUserQuestion(evt);
      return;
    }

    if (evt.type === AO_EVENT.PLAN_APPROVAL_REQUEST) {
      this._handlePlanApprovalRequest(evt);
      return;
    }

    if (evt.type === AO_EVENT.UI_ARTIFACT_CREATED) {
      this._handleUiArtifactCreated(evt);
      return;
    }

    if (evt.type === AO_EVENT.TURN_COMPLETED || evt.type === AO_EVENT.TURN_ABORTED) {
      this._done();
      return;
    }

    if (evt.type === AO_EVENT.TURN_SUSPENDED) {
      // Fires after permission_request/user_question/plan_approval_request to formally
      // mark the suspension. If any of those already put up a popup, the *only* valid
      // response channel is that popup — re-enabling the plain chat input here would let
      // the user answer in two conflicting ways at once. Only fall back to _done() if
      // nothing is actually pending.
      const hasPendingApproval = [...(this._toolCards?.values() ?? [])]
        .some((c) => c.state === AO_TOOL_STATE.APPROVAL_REQUESTED);
      if (!this._pendingQuestion && !hasPendingApproval && !this._pendingPlanApproval) {
        this._done();
      }
      return;
    }

    // 'ERROR' (connection-level, e.g. pre-auth failures) and 'error' (a genuine
    // SessionEvent, e.g. the model provider being unreachable mid-turn) are two
    // different frames with the message in different places.
    if (evt.type === AO_EVENT.ERROR_CONNECTION || evt.type === AO_EVENT.ERROR_SESSION) {
      const message = evt.data?.message ?? evt.message ?? 'Something went wrong.';
      this._messages = [...this._messages, { role: 'assistant', content: `Error: ${message}` }];
      this._done();
    }
  }

  async _openSocket() {
    const {
      accessToken, userId, tenantId, email, name, projectedProductContext,
    } = await loadIms();
    const orgId = getOrgId(projectedProductContext);
    await this._loadPersisted();
    // Show persisted history immediately rather than waiting for the WS handshake
    // (AUTH round-trip + grace timer) to finish — that gate is seconds away, while
    // this IndexedDB read is effectively instant. Without this, the welcome screen
    // flashes before the real history pops in.
    this._update();

    return new Promise((resolve, reject) => {
      const base = AO_WS_BASE[env] ?? AO_WS_BASE.stage;
      const wsTarget = `${base}/ws/sessions/${this._episodeId ?? 'new'}`;
      const ws = new WebSocket(wsTarget);
      this._ws = ws;
      this._ready = false;
      this._streaming = '';

      // AO's real server (ws_handler.py) sends no confirmation frame on successful
      // AUTH — it silently waits for the client's next message (USER_INPUT) and only
      // sends SESSION_READY after that. So: wait briefly for an early ERROR, then
      // optimistically treat the connection as ready if nothing rejects it.
      let settled = false;
      const graceTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this._ready = true;
        resolve();
      }, 1000);
      const settle = (fn) => (arg) => {
        if (settled) return;
        settled = true;
        clearTimeout(graceTimer);
        fn(arg);
      };
      const rejectAuth = settle(reject);

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: AO_FRAME.AUTH,
          authorization: `Bearer ${accessToken?.token}`,
          'x-org-name': tenantId,
          'x-tenant-id': orgId,
          'x-user-email': email,
          'x-user-id': userId,
          'x-user-name': name,
        }));
      });

      // Guard every handler against a stale socket: clear()/destroy() can replace
      // this._ws with a new connection before this one's async close/error fires.
      const isCurrent = () => this._ws === ws;

      ws.addEventListener('message', (event) => {
        if (!isCurrent()) return;
        const data = this._parse(event.data);
        if (!data) return;

        if (!this._ready) {
          if (data.type === AO_EVENT.ERROR_CONNECTION) rejectAuth(new Error(data.message ?? 'AO auth failed'));
          return;
        }

        this._handleServerEvent(data);
      });

      ws.addEventListener('close', (event) => {
        if (!isCurrent()) return;
        const wasReady = this._ready;
        this._ready = false;
        this._connected = false;
        if (this._thinking) {
          this._messages = [...this._messages, { role: 'assistant', content: 'Error: connection closed' }];
          this._done();
        }
        if (!wasReady) {
          rejectAuth(new Error(`WebSocket closed before auth resolved (code ${event.code})`));
        } else if (!this._closingIntentionally && !this._destroyed) {
          // Browsers can't send WS ping frames, and AO's own docs note intermediary
          // proxies drop idle connections after 30-60s — so a connection that was
          // fine a moment ago can die with no warning. Without this, the chat would
          // stay permanently disabled (connected=false) until a full page reload.
          this.connect();
        }
        this._update();
      });

      ws.addEventListener('error', () => {
        if (!isCurrent()) return;
        if (!this._ready) rejectAuth(new Error('AO WebSocket error'));
      });
    });
  }

  async connect(attempt = 0) {
    // A fresh connect() attempt supersedes any earlier "intentional close" state.
    this._closingIntentionally = false;
    try {
      await this._openSocket();
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
    this._thinking = false;
    this._streamingText = undefined;
    this._update();
  }

  stop() {
    if (this._ready) this._ws?.send(JSON.stringify({ type: AO_FRAME.INTERRUPT }));
    this._done();
  }

  async clear() {
    if (this._thinking) this.stop();
    // Suppress the close handler's auto-reconnect — clear() drives its own
    // reconnect below (which resets this flag), so we don't want two racing
    // connect() calls. Left true here; connect() clears it once it actually runs.
    this._closingIntentionally = true;
    this._ws?.close();
    this._messages = [];
    this._streamingText = undefined;
    this._connected = false;
    this._episodeId = undefined;
    this._pendingQuestion = null;
    this._pendingPlanApproval = null;
    this._toolCards = new Map();
    this._update();
    const room = await this._getRoom();
    resetSession(room, undefined);
    await this.connect();
  }

  destroy() {
    this._destroyed = true;
    clearTimeout(this._retryTimeout);
    this._ws?.close();
  }

  // Mirrors chat-controller.js's approveToolCall: resolves the clicked card, bulk-approves
  // any other pending cards with the same tool name on "always approve", then answers all
  // of those decisions in one PERMISSION_RESPONSE frame (AO resumes the turn as soon as any
  // response arrives, so partial/staggered responses aren't supported).
  approveToolCall = (toolCallId, approved, always = false) => {
    const card = this._toolCards?.get(toolCallId);
    if (!card) return;

    const next = new Map(this._toolCards);
    next.set(toolCallId, {
      ...card, state: approved ? AO_TOOL_STATE.APPROVED : AO_TOOL_STATE.REJECTED,
    });
    const decisions = { [toolCallId]: { approved } };

    if (always && approved) {
      for (const [id, c] of next) {
        const isSameToolPending = c.toolName === card.toolName
          && c.state === AO_TOOL_STATE.APPROVAL_REQUESTED;
        if (id !== toolCallId && isSameToolPending) {
          next.set(id, { ...c, state: AO_TOOL_STATE.APPROVED });
          decisions[id] = { approved: true };
        }
      }
    }

    this._toolCards = next;
    this._update();

    this._ws?.send(JSON.stringify({
      type: AO_FRAME.PERMISSION_RESPONSE,
      turn_id: card.turnId,
      decisions,
    }));
  };

  // answersByQuestionId: { [questionId]: string[] } — selected option labels plus any
  // free-text answer, already merged by the question-card UI.
  answerQuestion = (answersByQuestionId) => {
    if (!this._pendingQuestion) return;
    const { turnId, questions } = this._pendingQuestion;
    const answers = questions.map((q) => ({
      question_id: q.id,
      selected_options: answersByQuestionId[q.id] ?? [],
    }));
    this._pendingQuestion = null;
    this._update();
    this._ws?.send(JSON.stringify({
      type: AO_FRAME.QUESTION_RESPONSE,
      turn_id: turnId,
      answers,
      declined: false,
    }));
  };

  declineQuestion = () => {
    if (!this._pendingQuestion) return;
    const { turnId } = this._pendingQuestion;
    this._pendingQuestion = null;
    this._update();
    this._ws?.send(JSON.stringify({
      type: AO_FRAME.QUESTION_RESPONSE,
      turn_id: turnId,
      answers: [],
      declined: true,
    }));
  };

  // Plan approval has no dedicated WS frame type of its own — the server dispatches
  // by DataPart "type" inside the generic RESUME op, so this sends a "plan-response"
  // part wrapped in a RESUME frame instead.
  respondToPlanApproval = (decision, feedback = '') => {
    if (!this._pendingPlanApproval) return;
    const { turnId } = this._pendingPlanApproval;
    this._pendingPlanApproval = null;
    this._update();
    this._ws?.send(JSON.stringify({
      type: AO_FRAME.RESUME,
      turn_id: turnId,
      data: {
        type: 'plan-response',
        decision,
        feedback,
        edited_plan_content: null,
      },
    }));
  };

  // No MCP config surface yet.
  setMcpConfig() { }

  // AO has no resolved channel for page context yet — so until that lands, prefix it
  // onto the wire text ourselves. Kept out of the UI-visible message; only the
  // outgoing frame gets it.
  _contextPrefix() {
    const { org, site, path } = this._context ?? {};
    if (!org || !site) return '';
    return `[Current document — org: ${org}, site: ${site}, path: ${path || '/'}]\n`;
  }

  // Same gap as page context: AO's USER_INPUT has no structured field for "the block/
  // text the user picked in the canvas", so describe it inline in the wire text too.
  _describeSelectionContext(selectionContext) {
    if (!selectionContext.length) return '';
    const lines = selectionContext.map((item) => {
      if (item.type === 'text') {
        const plain = item.innerHTML.replace(/<[^>]+>/g, '').trim();
        return `- Selected text: "${plain}"`;
      }
      const label = item.innerText ? ` — "${item.innerText}"` : '';
      return `- Selected ${item.type}: ${item.blockName}${label}`;
    });
    return `[Selected context]\n${lines.join('\n')}\n`;
  }

  // Tries AO's own Files API first (see uploadAttachmentToAo) so the attachment becomes
  // a real USER_INPUT.attachments entry the agent can read directly. Falls back to
  // uploading straight to DA's own admin API and describing the resulting URL in the
  // message text, for whenever AO's Files API isn't reachable or the upload fails.
  async _uploadAttachment(attachment) {
    const artifactId = await uploadAttachmentToAo(attachment);
    if (artifactId) return { ...attachment, artifactId, contentUrl: null };

    const { fileName, mediaType, dataBase64 } = attachment;
    const { org, site } = this._context ?? {};
    if (!org || !site || !dataBase64) return { ...attachment, contentUrl: null };

    const path = `/${org}/${site}/.da-chat-uploads/${Date.now()}-${fileName}`;
    try {
      const formData = new FormData();
      formData.append('data', base64ToBlob(dataBase64, mediaType));
      const resp = await daFetch({ url: `${DA_ADMIN}/source${path}`, opts: { method: 'PUT', body: formData } });
      if (!resp.ok) return { ...attachment, contentUrl: null };
      const json = await resp.json().catch(() => null);
      return { ...attachment, contentUrl: json?.source?.contentUrl ?? null };
    } catch {
      return { ...attachment, contentUrl: null };
    }
  }

  // Only the DA-admin fallback needs describing in text — natively-uploaded attachments
  // (artifactId set) are passed via USER_INPUT.attachments instead.
  _describeAttachments(uploaded) {
    const fallback = uploaded.filter((a) => !a.artifactId);
    if (!fallback.length) return '';
    const lines = fallback.map((a) => (a.contentUrl
      ? `- Attached file: ${a.fileName} — uploaded to: ${a.contentUrl}`
      : `- Attached file: ${a.fileName} — upload failed`));
    return `[Attachments]\n${lines.join('\n')}\n`;
  }

  async sendMessage(message, context = [], { attachments = [] } = {}) {
    if (this._thinking || !this._connected || !this._ready) return;

    const selectionContext = buildSelectionContext(context);
    const attachmentsMeta = buildAttachmentsMeta(attachments);

    this._messages = [...(this._messages ?? []), {
      role: 'user',
      content: message,
      ...(selectionContext.length && { selectionContext }),
      ...(attachmentsMeta.length && { attachmentsMeta }),
    }];
    this._thinking = true;
    this._update();
    this._persist();

    const uploaded = await Promise.all(attachments.map((a) => this._uploadAttachment(a)));

    // The upload above can take long enough for an idle-timeout to drop the socket
    // in the background (browsers can't send WS pings to prevent this). Reconnect
    // before sending if that happened, rather than throwing on a closed socket.
    if (this._ws?.readyState !== WebSocket.OPEN) {
      await this.connect();
      if (!this._ready) {
        this._messages = [...this._messages, {
          role: 'assistant',
          content: 'Error: connection lost while sending. Please try again.',
        }];
        this._done();
        return;
      }
    }

    const artifactIds = uploaded.map((a) => a.artifactId).filter(Boolean);

    this._ws.send(JSON.stringify({
      type: AO_FRAME.USER_INPUT,
      text: `${this._contextPrefix()}${this._describeSelectionContext(selectionContext)}`
        + `${this._describeAttachments(uploaded)}${message}`,
      manifestId: AO_MANIFEST_ID,
      // Required for manifestId to actually override auto-targeting — an explicit
      // manifestId is only honored when debugMode is also true, otherwise it's
      // silently ignored.
      debugMode: true,
      ...(artifactIds.length && { attachments: artifactIds.map((artifactId) => ({ artifactId })) }),
    }));
  }
}
