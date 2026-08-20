import { loadIms } from '../../../utils/ims.js';
import { daFetch } from '../../../utils/api.js';
import { DA_ADMIN } from '../../../utils/utils.js';
import { buildSelectionContext, buildAttachmentsMeta } from '../utils/chat-helpers.js';
import { AO_EVENT, AO_FRAME, AO_TOOL_STATE } from './ao-constants.js';
import { getOrgId, resolveAoWsBase, uploadAttachment } from '../../chat-ao/utils/uploads.js';
import { buildPageContextText, buildSelectionText } from '../../chat-ao/utils/user-context.js';
import { AO_MANIFEST_ID } from '../../chat-ao/ao-constants.js';

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

/**
 * Talks to Adobe's Agent Orchestrator (AO) over its WebSocket transport (see
 * https://aep-ao.pages.adobeitc.com/api-reference/spec/) instead of da-agent.
 * Handles message-in/message-out, tool-call permission requests, plan approval,
 * and a2ui artifacts. User questions moved to nx-chat-ao (question-card.js),
 * skill lookup moved to nx-chat-ao (chat-ao/utils/skills.js) — neither is
 * handled here.
 *
 * Public surface used by chat.js mirrors chat-controller.js's (connect,
 * setContext, loadInitialMessages, sendMessage, approveToolCall, clear,
 * setMcpConfig, stop, destroy) plus the AO-only respondToPlanApproval chat.js
 * gates on — da-agent's controller has no equivalent, since it has no concept
 * of plans.
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
  }

  async loadInitialMessages() {
    this._messages = this._messages ?? [];
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
    this._update();
  }

  _handleServerEvent(evt) {
    if (evt.type === AO_EVENT.SESSION_READY) {
      // Arrives after the first USER_INPUT is processed (see _openSocket's grace-timer comment).
      this._episodeId = evt.episode_id ?? this._episodeId;
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
      this._update();
      return;
    }

    if (evt.type === AO_EVENT.PERMISSION_REQUEST) {
      this._handlePermissionRequest(evt);
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
      // Fires after permission_request/plan_approval_request to formally mark the
      // suspension. If either already put up a popup, that's the only valid response
      // channel — only fall back to _done() if nothing is actually pending.
      const hasPendingApproval = [...(this._toolCards?.values() ?? [])]
        .some((c) => c.state === AO_TOOL_STATE.APPROVAL_REQUESTED);
      if (!hasPendingApproval && !this._pendingPlanApproval) {
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

    return new Promise((resolve, reject) => {
      const base = resolveAoWsBase(projectedProductContext);
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
    this._pendingPlanApproval = null;
    this._toolCards = new Map();
    this._update();
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

  // Tries AO's own Files API first so the attachment becomes a real
  // USER_INPUT.attachments entry the agent can read directly. Falls back to
  // uploading straight to DA's own admin API and describing the resulting URL in the
  // message text, for whenever AO's Files API isn't reachable or the upload fails.
  async _uploadAttachment(attachment) {
    const artifactId = attachment.dataBase64 ? await uploadAttachment(attachment) : null;
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
      text: `${buildPageContextText(this._context)}${buildSelectionText(selectionContext)}`
        + `${this._describeAttachments(uploaded)}${message}`,
      manifestId: AO_MANIFEST_ID,
      // Required for manifestId to actually override auto-targeting — an explicit
      // manifestId is only honored when debugMode is also true, otherwise it's
      // silently ignored.
      debugMode: true,
      ...(artifactIds.length && { attachments: artifactIds }),
    }));
  }
}
