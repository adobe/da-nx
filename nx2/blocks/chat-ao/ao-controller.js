/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { loadIms } from '../../utils/ims.js';
import {
  AO_FRAME, AO_EVENT, IGNORED_WHILE_INTERRUPTING, DEDICATED_SUMMARY_TOOLS,
} from './ao-constants.js';
import { buildFailedUploadsText, buildClientContext } from './utils/user-context.js';
import { uploadAttachment, getOrgId, resolveAoWsBase } from './utils/uploads.js';
import { resolveManifestId } from './utils/manifest.js';
import {
  fetchEpisodes, fetchEpisodeMessages, fetchEpisodeContext, warmSession, toUiArtifact,
  fetchTurnEvents, extractToolCalls,
} from './utils/episodes.js';
import { fetchSkills, loadCachedSkills } from './utils/skills.js';
import { buildSelectionContext, buildAttachmentsMeta } from '../chat/utils/chat-helpers.js';

const EPISODE_LIST_LIMIT = 10;

// Maps each server event to the AoChatController method that handles it —
// looked up by name (not a bound function reference) so handlers stay plain
// prototype methods with no per-instance binding step in the constructor.
const EVENT_HANDLERS = new Map([
  [AO_EVENT.SESSION_READY, '_onSessionReady'],
  [AO_EVENT.USER_MESSAGE, '_onUserMessage'],
  [AO_EVENT.TEXT_DELTA, '_onTextDelta'],
  [AO_EVENT.TEXT_DONE, '_onTextDone'],
  [AO_EVENT.UI_ARTIFACT_CREATED, '_onUiArtifactCreated'],
  [AO_EVENT.TOOL_CALL_DETECTED, '_onToolCallDetected'],
  [AO_EVENT.TOOL_CALL_START, '_onToolCallStart'],
  [AO_EVENT.TOOL_CALL_END, '_onToolCallEnd'],
  [AO_EVENT.TURN_COMPLETED, '_onTurnCompleted'],
  [AO_EVENT.TURN_ABORTED, '_onTurnCompleted'],
  [AO_EVENT.EPISODE_TITLE_UPDATED, '_onEpisodeTitleUpdated'],
  [AO_EVENT.USER_QUESTION, '_onUserQuestion'],
  [AO_EVENT.USER_QUESTION_RESPONSE, '_onUserQuestionResponse'],
  [AO_EVENT.PLAN_APPROVAL_REQUEST, '_onPlanApprovalRequest'],
  [AO_EVENT.PERMISSION_REQUEST, '_onPermissionRequest'],
  [AO_EVENT.ERROR_CONNECTION, '_onSessionError'],
  [AO_EVENT.ERROR_SESSION, '_onSessionError'],
]);

export default class AoChatController {
  constructor({ onUpdate }) {
    this._onUpdate = onUpdate;
    this._messages = [];
    this._streaming = '';
    this._episodes = [];
    this._skills = [];
  }

  setContext(context) {
    this._context = context;
  }

  _update() {
    this._onUpdate({
      messages: this._messages,
      thinking: this._thinking,
      streamingText: this._streamingText,
      episodes: this._episodes,
      episodeId: this._episodeId,
      pendingQuestion: this._pendingQuestion,
      pendingPlanApproval: this._pendingPlanApproval,
      pendingPermission: this._pendingPermission,
      loadingEpisode: this._loadingEpisode,
    });
  }

  _fetchEpisodes() { return fetchEpisodes(EPISODE_LIST_LIMIT); }

  _fetchEpisodeMessages(episodeId) { return fetchEpisodeMessages(episodeId); }

  _fetchEpisodeContext(episodeId) { return fetchEpisodeContext(episodeId); }

  _fetchWarmSession(episodeId) { return warmSession(episodeId); }

  // Pre-warms the current episode's AO session while the user types. Existing
  // episodes only, at most once per episode — see docs/chat-ao-component.md#session-warming.
  async warmSession() {
    if (!this._episodeId || this._thinking || this._warmedEpisodeId === this._episodeId) return;
    this._warmedEpisodeId = this._episodeId;
    try {
      await this._fetchWarmSession(this._episodeId);
      await this._attach();
    } catch {
      // best-effort — sendMessage retries the connection normally on send
    }
  }

  async _attach() {
    await this._ensureSocket();
    this._ws?.send(JSON.stringify({ type: AO_FRAME.ATTACH }));
  }

  // See docs/chat-ao-component.md#connection-recovery for why this exists
  // and isn't gated by _warmedEpisodeId like warmSession() is.
  async reattachIfIdle() {
    if (!this._episodeId || this._thinking || this._ws?.readyState === WebSocket.OPEN) return;
    try {
      await this._attach();
    } catch {
      // best-effort — the next visibility change, keystroke, or send retries
    }
  }

  _fetchSkills() { return fetchSkills(this._context ?? {}); }

  _loadCachedSkills() { return loadCachedSkills(); }

  getSkills() {
    return this._skills;
  }

  async loadSkills() {
    const cached = await this._loadCachedSkills();
    if (cached) this._skills = cached;
    const fresh = await this._fetchSkills();
    if (fresh) this._skills = fresh;
  }

  _fetchTurnEvents(turnId) { return fetchTurnEvents(turnId); }

  // See docs/chat-ao-component.md#tool-call-activity for why this is by id, not index.
  _patchToolCall(toolCallId, patch) {
    this._messages = this._messages.map((m) => (m.toolCall?.toolCallId === toolCallId
      ? { ...m, toolCall: { ...m.toolCall, ...patch } } : m));
    this._update();
  }

  async hydrateToolCall(toolCallId) {
    const entry = this._messages.find((m) => m.toolCall?.toolCallId === toolCallId);
    if (!entry || entry.toolCall.status !== 'summary') return;
    if (entry.toolCall.calls || entry.toolCall.loadingCalls) return;
    const { turnId } = entry.toolCall;

    this._patchToolCall(toolCallId, { loadingCalls: true });

    const events = await this._fetchTurnEvents(turnId);
    const calls = extractToolCalls(events);

    // See docs/chat-ao-component.md#tool-call-activity — loadingCalls is
    // dropped, not set false, once hydration finishes.
    this._messages = this._messages.map((m) => {
      if (m.toolCall?.toolCallId !== toolCallId) return m;
      const { loadingCalls: _, ...toolCall } = m.toolCall;
      return { ...m, toolCall: { ...toolCall, ...(calls.length && { calls }) } };
    });
    this._update();
  }

  async loadEpisodes() {
    this._episodes = await this._fetchEpisodes();
    const latest = this._episodes[0];
    if (latest) await this._loadEpisode(latest.id);
    else this._update();
  }

  async _loadEpisode(episodeId) {
    this._episodeId = episodeId;
    // Clear + show a spinner immediately rather than leaving stale messages up.
    this._messages = [];
    this._pendingQuestion = undefined;
    this._pendingPlanApproval = undefined;
    this._pendingPermission = undefined;
    this._thinking = false;
    this._loadingEpisode = true;
    this._update();

    const [messages, pendingInteraction] = await Promise.all([
      this._fetchEpisodeMessages(episodeId),
      this._fetchEpisodeContext(episodeId),
    ]);
    this._messages = messages;
    this._pendingQuestion = pendingInteraction?.type === 'question' ? pendingInteraction : undefined;
    this._pendingPlanApproval = pendingInteraction?.type === 'plan' ? pendingInteraction : undefined;
    // See docs/chat-ao-component.md#permission-requests — decisions always
    // starts empty on rehydration.
    this._pendingPermission = pendingInteraction?.type === 'permission'
      ? { turnId: pendingInteraction.turnId, calls: pendingInteraction.calls, decisions: {} }
      : undefined;
    this._thinking = !!pendingInteraction;
    this._loadingEpisode = false;
    this._update();
    // See docs/chat-ao-component.md#connection-recovery — attaches now, not
    // just once the user types, so cross-client updates arrive live.
    this.warmSession();
  }

  // See docs/chat-ao-component.md#episode-switching — an empty result here
  // can only mean the fetch itself failed, never a real empty state.
  async _refreshEpisodeList() {
    const episodes = await this._fetchEpisodes();
    if (!episodes.length && this._episodes.length) return;
    this._episodes = episodes;
    this._update();
  }

  // See docs/chat-ao-component.md#episode-switching for why only real
  // in-flight generation blocks switching away.
  get _blockedByActiveTurn() {
    return this._thinking && !this._pendingQuestion
      && !this._pendingPlanApproval && !this._pendingPermission;
  }

  async switchEpisode(episodeId) {
    if (!episodeId || episodeId === this._episodeId || this._blockedByActiveTurn) return;
    this._ws?.close();
    this._ws = null;
    this._streaming = '';
    this._streamingText = undefined;
    await this._loadEpisode(episodeId);
  }

  startNewEpisode() {
    if (this._blockedByActiveTurn) return;
    this._ws?.close();
    this._ws = null;
    this._episodeId = undefined;
    this._messages = [];
    this._streaming = '';
    this._streamingText = undefined;
    this._pendingQuestion = undefined;
    this._pendingPlanApproval = undefined;
    this._pendingPermission = undefined;
    this._thinking = false;
    this._update();
  }

  async _connectionInfo() {
    const {
      accessToken, userId, tenantId, email, name, projectedProductContext,
    } = await loadIms();
    return {
      authFrame: {
        type: AO_FRAME.AUTH,
        authorization: `Bearer ${accessToken?.token}`,
        'x-org-name': tenantId,
        'x-tenant-id': getOrgId(projectedProductContext),
        'x-user-email': email,
        'x-user-id': userId,
        'x-user-name': name,
      },
      wsBase: resolveAoWsBase(projectedProductContext),
    };
  }

  // Coalesces concurrent callers onto one in-flight connection attempt.
  async _ensureSocket() {
    if (this._ws?.readyState === WebSocket.OPEN) return;
    if (this._connecting) {
      await this._connecting;
      return;
    }

    this._connecting = this._connect();
    try {
      await this._connecting;
    } finally {
      this._connecting = null;
    }
  }

  async _connect() {
    const { authFrame, wsBase } = await this._connectionInfo();

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`${wsBase}/ws/sessions/${this._episodeId ?? 'new'}`);
      this._ws = ws;

      // Guards against a stale socket if clear()/a later _ensureSocket() call replaces it.
      const isCurrent = () => this._ws === ws;

      ws.addEventListener('open', () => {
        if (!isCurrent()) return;
        ws.send(JSON.stringify(authFrame));
        resolve();
      });

      ws.addEventListener('message', (event) => {
        if (!isCurrent()) return;
        let data;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }
        this._handleServerEvent(data);
      });

      ws.addEventListener('close', () => {
        if (!isCurrent()) return;
        this._ws = null;
        if (this._shouldReattachOnClose()) this._recoverFromClose();
      });

      ws.addEventListener('error', () => {
        if (!isCurrent()) return;
        reject(new Error('AO WebSocket error'));
      });
    });
  }

  // See docs/chat-ao-component.md#connection-recovery for why this is mid-turn
  // only, and why a suspended turn (pending question/plan/permission) doesn't count.
  _shouldReattachOnClose() {
    return !this._destroyed && this._blockedByActiveTurn;
  }

  async _recoverFromClose() {
    if (!this._episodeId) return;
    try {
      await this._attach();
    } catch (err) {
      this._messages = [...this._messages, { role: 'assistant', content: `Error: ${err.message}` }];
      this._done();
    }
  }

  _handleServerEvent(evt) {
    if (this._interrupting && IGNORED_WHILE_INTERRUPTING.has(evt.type)) return;
    const handlerName = EVENT_HANDLERS.get(evt.type);
    if (handlerName) this[handlerName](evt);
  }

  _onSessionReady(evt) {
    const isNewEpisode = evt.episode_id && evt.episode_id !== this._episodeId;
    this._episodeId = evt.episode_id ?? this._episodeId;
    if (isNewEpisode) this._refreshEpisodeList().catch(() => { });
  }

  // See docs/chat-ao-component.md#connection-recovery for the clientMessageId dedup.
  _onUserMessage(evt) {
    const { text, client_message_id: clientMessageId } = evt.data ?? {};
    const isOwnEcho = clientMessageId
      && this._messages.some((m) => m.clientMessageId === clientMessageId);
    if (isOwnEcho) return;
    this._messages = [...this._messages, { role: 'user', content: text }];
    this._update();
  }

  _onTextDelta(evt) {
    // See docs/chat-ao-component.md#plan-approval — clears a stale card left
    // over from a conversational (non-button) resolution.
    this._pendingPlanApproval = undefined;
    this._streaming += evt.data?.content ?? '';
    this._streamingText = this._streaming;
    this._update();
  }

  _onTextDone(evt) {
    this._messages = [...this._messages, {
      role: 'assistant',
      content: evt.data?.content ?? this._streaming,
    }];
    this._streaming = '';
    this._streamingText = undefined;
    this._update();
  }

  _onUiArtifactCreated(evt) {
    const artifact = evt.data?.artifact;
    if (!artifact) return;
    this._messages = [...this._messages, { role: 'assistant', uiArtifact: toUiArtifact(artifact) }];
    this._update();
  }

  // See docs/chat-ao-component.md#tool-call-activity for the detected/start/end patching.
  _onToolCallDetected(evt) {
    const { tool_call_id: toolCallId, tool_name: toolName } = evt.data ?? {};
    if (DEDICATED_SUMMARY_TOOLS.has(toolName)) return;
    this._messages = [...this._messages, {
      role: 'assistant', toolCall: { toolCallId, toolName, status: 'detected' },
    }];
    this._update();
  }

  _onToolCallStart(evt) {
    const {
      tool_call_id: toolCallId, tool_name: toolName, arguments: args, metadata,
    } = evt.data ?? {};
    if (DEDICATED_SUMMARY_TOOLS.has(toolName)) return;
    const title = metadata?.skill_title;
    const patch = { toolName, status: 'running', arguments: args, ...(title && { title }) };
    if (this._messages.some((m) => m.toolCall?.toolCallId === toolCallId)) {
      this._patchToolCall(toolCallId, patch);
    } else {
      this._messages = [...this._messages, { role: 'assistant', toolCall: { toolCallId, ...patch } }];
      this._update();
    }
  }

  _onToolCallEnd(evt) {
    const {
      tool_call_id: toolCallId, result, success, duration_s: durationS, metadata,
    } = evt.data ?? {};
    const status = success ? 'success' : 'error';
    this._messages = this._messages.map((m) => {
      if (m.toolCall?.toolCallId !== toolCallId) return m;
      const title = m.toolCall.title ?? metadata?.skill_title;
      return {
        ...m,
        toolCall: {
          ...m.toolCall, status, result, durationS, ...(title && { title }),
        },
      };
    });
    this._update();
  }

  _onTurnCompleted() {
    this._interrupting = false;
    this._done();
  }

  // See docs/chat-ao-component.md#episode-switching for why this upserts, not just patches.
  _onEpisodeTitleUpdated(evt) {
    const { episode_id: episodeId, title } = evt.data ?? {};
    const exists = this._episodes.some((ep) => ep.id === episodeId);
    if (exists) {
      this._episodes = this._episodes.map((ep) => (ep.id === episodeId ? { ...ep, title } : ep));
    } else if (title) {
      this._episodes = [{ id: episodeId, title }, ...this._episodes];
    } else {
      return;
    }
    this._update();
  }

  _onUserQuestion(evt) {
    this._pendingQuestion = {
      turnId: evt.turn_id,
      context: evt.data?.context ?? null,
      questions: evt.data?.questions ?? [],
    };
    this._update();
  }

  // Replaces the question card with a durable summary of what was answered —
  // see docs/chat-ao-component.md#question-flow. `pendingQuestion` carries
  // the original questions/context; `answers`/`declined` is what's being (or
  // was) sent back, so the summary is correct even before AO's own echo
  // confirms it.
  _buildQuestionResponseMessage(pendingQuestion, answers, declined) {
    return {
      role: 'assistant',
      questionResponse: {
        context: pendingQuestion.context,
        questions: pendingQuestion.questions,
        answers,
        declined,
      },
    };
  }

  // Fires for every client on the episode, including the one that answered —
  // only act here if this client's own pendingQuestion is still set, meaning
  // a *different* client answered first (this client already rendered its
  // own summary optimistically in _respondToQuestion otherwise). AO's echo
  // carries only `answers`, no `declined` flag, so an empty list is treated
  // as declined — true for a real decline and for a required question
  // answered with nothing, which shouldn't happen in practice.
  _onUserQuestionResponse(evt) {
    const turnId = evt.data?.turn_id ?? evt.turn_id;
    if (!this._pendingQuestion || this._pendingQuestion.turnId !== turnId) return;
    const answers = evt.data?.answers ?? [];
    this._messages = [
      ...this._messages,
      this._buildQuestionResponseMessage(this._pendingQuestion, answers, answers.length === 0),
    ];
    this._pendingQuestion = undefined;
    this._update();
  }

  _onPlanApprovalRequest(evt) {
    this._pendingPlanApproval = {
      turnId: evt.data?.turn_id ?? evt.turn_id,
      planContent: evt.data?.plan_content ?? '',
      planFilePath: evt.data?.plan_file_path ?? null,
    };
    this._update();
  }

  // See docs/chat-ao-component.md#permission-requests for the wire shapes.
  _onPermissionRequest(evt) {
    this._pendingPermission = {
      turnId: evt.data?.turn_id ?? evt.turn_id,
      calls: (evt.data?.pending_calls ?? []).map((c) => ({
        toolCallId: c.id, toolName: c.name, arguments: c.arguments,
      })),
      decisions: {},
    };
    this._update();
  }

  _onSessionError(evt) {
    // See docs/chat-ao-component.md#session-warming for why idle stays silent,
    // and #connection-recovery for why a suspended turn stays silent too — AO
    // legitimately reports the episode as idle while it's waiting on the user,
    // and the pending question/plan/permission popover already works without
    // a live socket.
    if (!this._blockedByActiveTurn) return;
    const message = evt.data?.message ?? evt.message ?? 'Something went wrong.';
    this._messages = [...this._messages, { role: 'assistant', content: `Error: ${message}` }];
    this._done();
  }

  // See docs/chat-ao-component.md#stop--interrupt for why this also fires on TURN_ABORTED.
  _done() {
    this._thinking = false;
    this._streamingText = undefined;
    this._pendingQuestion = undefined;
    this._pendingPlanApproval = undefined;
    this._pendingPermission = undefined;
    this._update();
  }

  _pushError(err) {
    this._messages = [...this._messages, { role: 'assistant', content: `Error: ${err.message}` }];
    this._done();
  }

  stop() {
    this._interrupting = true;
    if (this._ws?.readyState === WebSocket.OPEN) {
      this._ws.send(JSON.stringify({ type: AO_FRAME.INTERRUPT }));
    }
    this._done();
  }

  // A cold connection must wrap the response in RESUME instead of sending
  // QUESTION_RESPONSE directly — see docs/chat-ao-component.md#question-flow.
  async _respondToQuestion(answers, declined) {
    if (!this._pendingQuestion) return;
    const { turnId } = this._pendingQuestion;
    const wasAlreadyOpen = this._ws?.readyState === WebSocket.OPEN;
    this._messages = [
      ...this._messages,
      this._buildQuestionResponseMessage(this._pendingQuestion, answers, declined),
    ];
    this._pendingQuestion = undefined;
    this._update();

    try {
      await this._ensureSocket();
      const frame = wasAlreadyOpen
        ? { type: AO_FRAME.QUESTION_RESPONSE, turn_id: turnId, answers, declined }
        : { type: AO_FRAME.RESUME, turn_id: turnId, data: { type: 'question-response', answers, declined } };
      this._ws.send(JSON.stringify(frame));
    } catch (err) {
      this._pushError(err);
    }
  }

  answerQuestion(answers) {
    return this._respondToQuestion(answers, false);
  }

  declineQuestion() {
    return this._respondToQuestion([], true);
  }

  // See docs/chat-ao-component.md#plan-approval for why this always uses RESUME.
  async respondToPlanApproval(decision, feedback = '') {
    if (!this._pendingPlanApproval) return;
    const { turnId } = this._pendingPlanApproval;
    this._pendingPlanApproval = undefined;
    this._update();

    try {
      await this._ensureSocket();
      this._ws.send(JSON.stringify({
        type: AO_FRAME.RESUME,
        turn_id: turnId,
        data: {
          type: 'plan-response', decision, feedback, edited_plan_content: null,
        },
      }));
    } catch (err) {
      this._pushError(err);
    }
  }

  // See docs/chat-ao-component.md#permission-requests — one-shot, so decisions
  // are collected locally and only sent once every pending call has one.
  async respondToPermission(toolCallId, approved) {
    if (!this._pendingPermission) return;
    const decisions = { ...this._pendingPermission.decisions, [toolCallId]: approved };
    if (!this._pendingPermission.calls.every((c) => c.toolCallId in decisions)) {
      this._pendingPermission = { ...this._pendingPermission, decisions };
      this._update();
      return;
    }

    const { turnId } = this._pendingPermission;
    const wasAlreadyOpen = this._ws?.readyState === WebSocket.OPEN;
    this._pendingPermission = undefined;
    this._update();

    const decisionsPayload = Object.fromEntries(Object.entries(decisions).map(
      ([id, ok]) => [id, { tool_call_id: id, approved: ok }],
    ));
    try {
      await this._ensureSocket();
      const frame = wasAlreadyOpen
        ? { type: AO_FRAME.PERMISSION_RESPONSE, turn_id: turnId, decisions: decisionsPayload }
        : {
          type: AO_FRAME.RESUME,
          turn_id: turnId,
          data: { type: 'permission-response', decisions: decisionsPayload },
        };
      this._ws.send(JSON.stringify(frame));
    } catch (err) {
      this._pushError(err);
    }
  }

  _resolveManifest(search = window.location.search) {
    const { org, site } = this._context ?? {};
    return resolveManifestId({ org, site, search });
  }

  async sendMessage(message, items = [], attachments = []) {
    if (!message || (this._thinking && !this._pendingPlanApproval)) return;
    this._interrupting = false;

    const selectionContext = buildSelectionContext(items);
    const attachmentsMeta = buildAttachmentsMeta(attachments);
    // See docs/chat-ao-component.md#connection-recovery for the clientMessageId dedup.
    const clientMessageId = crypto.randomUUID();

    this._messages = [...this._messages, {
      role: 'user',
      content: message,
      clientMessageId,
      ...(selectionContext.length && { selectionContext }),
      ...(attachmentsMeta.length && { attachmentsMeta }),
    }];
    this._thinking = true;
    this._update();

    try {
      const uploaded = await Promise.all(attachments.map(async (a) => (
        { ...a, artifactId: await uploadAttachment(a) }
      )));
      const artifactIds = uploaded.map((a) => a.artifactId).filter(Boolean);
      const failed = uploaded.filter((a) => !a.artifactId);
      const { manifestId, debugMode } = await this._resolveManifest();

      await this._ensureSocket();
      this._ws.send(JSON.stringify({
        type: AO_FRAME.USER_INPUT,
        text: `${buildFailedUploadsText(failed)}${message}`,
        manifestId,
        debugMode,
        clientMessageId,
        ...(artifactIds.length && { attachments: artifactIds }),
        client_context: buildClientContext(this._context, items),
      }));
    } catch (err) {
      this._pushError(err);
    }
  }

  destroy() {
    this._destroyed = true;
    this._ws?.close();
  }
}
