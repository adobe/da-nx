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
import { AO_FRAME, AO_EVENT } from './ao-constants.js';
import { buildFailedUploadsText, buildClientContext } from './utils/user-context.js';
import { uploadAttachment, getOrgId, resolveAoWsBase } from './utils/uploads.js';
import {
  fetchEpisodes, fetchEpisodeMessages, fetchEpisodeContext, warmSession, toUiArtifact,
  fetchTurnEvents, extractToolCalls,
} from './utils/episodes.js';
import { fetchSkills, loadCachedSkills } from './utils/skills.js';
import { buildSelectionContext, buildAttachmentsMeta } from '../chat/utils/chat-helpers.js';

const EPISODE_LIST_LIMIT = 10;

export default class AoChatController {
  constructor({ onUpdate }) {
    this._onUpdate = onUpdate;
    this._messages = [];
    this._streaming = '';
    this._episodes = [];
    this._skills = loadCachedSkills() ?? [];
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
    await this._fetchWarmSession(this._episodeId);
    try {
      await this._ensureSocket();
      this._ws?.send(JSON.stringify({ type: AO_FRAME.ATTACH }));
    } catch {
      // best-effort — sendMessage retries the connection normally on send
    }
  }

  _fetchSkills() { return fetchSkills(); }

  getSkills() {
    return this._skills;
  }

  async loadSkills() {
    const fresh = await this._fetchSkills();
    if (fresh) this._skills = fresh;
  }

  _fetchTurnEvents(turnId) { return fetchTurnEvents(turnId); }

  // Looked up by toolCallId, not index — _messages may be replaced elsewhere
  // while a caller's own await (e.g. hydrateToolCall's fetch) is in flight.
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

    this._turnEventsCache ??= new Map();
    if (!this._turnEventsCache.has(turnId)) {
      this._turnEventsCache.set(turnId, this._fetchTurnEvents(turnId));
    }
    const events = await this._turnEventsCache.get(turnId);
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
    // decisions always starts empty on rehydration — any partial local
    // progress from before the switch/reload wasn't submitted, so it's gone.
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

  // A pending question/plan/permission is suspended, not streaming — safe to
  // abandon and resume later. Only real in-flight generation should block
  // switching away.
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
        if (!this._destroyed) this._recoverFromClose();
      });

      ws.addEventListener('error', () => {
        if (!isCurrent()) return;
        reject(new Error('AO WebSocket error'));
      });
    });
  }

  // See docs/chat-ao-component.md#connection-recovery — reattaches on any
  // drop, mid-turn or idle, so cross-client updates keep arriving live; only
  // a mid-turn failure is surfaced to the user.
  async _recoverFromClose() {
    if (!this._episodeId) return;
    try {
      await this._ensureSocket();
      this._ws.send(JSON.stringify({ type: AO_FRAME.ATTACH }));
    } catch (err) {
      if (!this._thinking) return;
      this._messages = [...this._messages, { role: 'assistant', content: `Error: ${err.message}` }];
      this._done();
    }
  }

  _handleServerEvent(evt) {
    if (evt.type === AO_EVENT.SESSION_READY) {
      const isNewEpisode = evt.episode_id && evt.episode_id !== this._episodeId;
      this._episodeId = evt.episode_id ?? this._episodeId;
      if (isNewEpisode) this._refreshEpisodeList();
      return;
    }

    // See docs/chat-ao-component.md#connection-recovery — AO broadcasts this
    // to every attached connection including the sender's own, so a matching
    // clientMessageId means we already rendered it optimistically in sendMessage.
    if (evt.type === AO_EVENT.USER_MESSAGE) {
      const { text, client_message_id: clientMessageId } = evt.data ?? {};
      const isOwnEcho = clientMessageId
        && this._messages.some((m) => m.clientMessageId === clientMessageId);
      if (isOwnEcho) return;
      this._messages = [...this._messages, { role: 'user', content: text }];
      this._update();
      return;
    }

    if (evt.type === AO_EVENT.TEXT_DELTA) {
      // See docs/chat-ao-component.md#plan-approval — clears a stale card left
      // over from a conversational (non-button) resolution.
      this._pendingPlanApproval = undefined;
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

    if (evt.type === AO_EVENT.UI_ARTIFACT_CREATED) {
      const artifact = evt.data?.artifact;
      if (!artifact) return;
      this._messages = [...this._messages, { role: 'assistant', uiArtifact: toUiArtifact(artifact) }];
      this._update();
      return;
    }

    // See docs/chat-ao-component.md#tool-call-activity — patches the same
    // message entry across detected/start/end rather than appending a row
    // per event.
    if (evt.type === AO_EVENT.TOOL_CALL_DETECTED) {
      const { tool_call_id: toolCallId, tool_name: toolName } = evt.data ?? {};
      this._messages = [...this._messages, {
        role: 'assistant', toolCall: { toolCallId, toolName, status: 'detected' },
      }];
      this._update();
      return;
    }

    if (evt.type === AO_EVENT.TOOL_CALL_START) {
      const {
        tool_call_id: toolCallId, tool_name: toolName, arguments: args, metadata,
      } = evt.data ?? {};
      const title = metadata?.skill_title;
      const patch = { toolName, status: 'running', arguments: args, ...(title && { title }) };
      if (this._messages.some((m) => m.toolCall?.toolCallId === toolCallId)) {
        this._patchToolCall(toolCallId, patch);
      } else {
        this._messages = [...this._messages, { role: 'assistant', toolCall: { toolCallId, ...patch } }];
        this._update();
      }
      return;
    }

    if (evt.type === AO_EVENT.TOOL_CALL_END) {
      const {
        tool_call_id: toolCallId, result, success, duration_s: durationS, metadata,
      } = evt.data ?? {};
      this._messages = this._messages.map((m) => {
        if (m.toolCall?.toolCallId !== toolCallId) return m;
        const title = m.toolCall.title ?? metadata?.skill_title;
        return {
          ...m,
          toolCall: {
            ...m.toolCall, status: success ? 'success' : 'error', result, durationS, ...(title && { title }),
          },
        };
      });
      this._update();
      return;
    }

    if (evt.type === AO_EVENT.TURN_COMPLETED || evt.type === AO_EVENT.TURN_ABORTED) {
      this._done();
      return;
    }

    // See docs/chat-ao-component.md#episode-switching — upserts rather than
    // only patching, so a title doesn't get silently dropped when it beats
    // (or outlives a failed) _refreshEpisodeList to adding the episode first.
    if (evt.type === AO_EVENT.EPISODE_TITLE_UPDATED) {
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
      return;
    }

    if (evt.type === AO_EVENT.USER_QUESTION) {
      this._pendingQuestion = {
        turnId: evt.turn_id,
        context: evt.data?.context ?? null,
        questions: evt.data?.questions ?? [],
      };
      this._update();
      return;
    }

    if (evt.type === AO_EVENT.PLAN_APPROVAL_REQUEST) {
      this._pendingPlanApproval = {
        turnId: evt.data?.turn_id ?? evt.turn_id,
        planContent: evt.data?.plan_content ?? '',
        planFilePath: evt.data?.plan_file_path ?? null,
      };
      this._update();
      return;
    }

    // See docs/chat-ao-component.md#permission-requests for the wire shapes.
    if (evt.type === AO_EVENT.PERMISSION_REQUEST) {
      this._pendingPermission = {
        turnId: evt.data?.turn_id ?? evt.turn_id,
        calls: (evt.data?.pending_calls ?? []).map((c) => ({
          toolCallId: c.id, toolName: c.name, arguments: c.arguments,
        })),
        decisions: {},
      };
      this._update();
      return;
    }

    if (evt.type === AO_EVENT.ERROR_CONNECTION || evt.type === AO_EVENT.ERROR_SESSION) {
      // Idle means nothing was actually asked of AO — e.g. a background warm
      // attempt failing. Only surface errors during an actual turn.
      if (!this._thinking) return;
      const message = evt.data?.message ?? evt.message ?? 'Something went wrong.';
      this._messages = [...this._messages, { role: 'assistant', content: `Error: ${message}` }];
      this._done();
    }
  }

  // A suspended turn (question/plan/permission) that gets interrupted still
  // reaches here via TURN_ABORTED — clear whichever card was pending so it
  // doesn't linger after the turn it belonged to is gone.
  _done() {
    this._thinking = false;
    this._streamingText = undefined;
    this._pendingQuestion = undefined;
    this._pendingPlanApproval = undefined;
    this._pendingPermission = undefined;
    this._update();
  }

  stop() {
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
    this._pendingQuestion = undefined;
    this._update();

    try {
      await this._ensureSocket();
      const frame = wasAlreadyOpen
        ? { type: AO_FRAME.QUESTION_RESPONSE, turn_id: turnId, answers, declined }
        : { type: AO_FRAME.RESUME, turn_id: turnId, data: { type: 'question-response', answers, declined } };
      this._ws.send(JSON.stringify(frame));
    } catch (err) {
      this._messages = [...this._messages, { role: 'assistant', content: `Error: ${err.message}` }];
      this._done();
    }
  }

  answerQuestion(answers) {
    return this._respondToQuestion(answers, false);
  }

  declineQuestion() {
    return this._respondToQuestion([], true);
  }

  // Plan approval has no dedicated response frame — the server dispatches by
  // DataPart "type" inside the generic RESUME op, which (unlike QUESTION_RESPONSE)
  // is always a valid first op, so no cold/warm connection distinction is needed here.
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
      this._messages = [...this._messages, { role: 'assistant', content: `Error: ${err.message}` }];
      this._done();
    }
  }

  // One-shot: AO auto-denies any pending call not present in `decisions` the
  // moment this is sent (see docs/chat-ao-component.md#permission-requests),
  // so decisions are collected locally per call and only sent once every
  // pending call in the turn has one — never streamed one at a time.
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
      this._messages = [...this._messages, { role: 'assistant', content: `Error: ${err.message}` }];
      this._done();
    }
  }

  async sendMessage(message, items = [], attachments = []) {
    if (!message || (this._thinking && !this._pendingPlanApproval)) return;

    const selectionContext = buildSelectionContext(items);
    const attachmentsMeta = buildAttachmentsMeta(attachments);
    // See docs/chat-ao-component.md#connection-recovery — AO echoes every
    // USER_MESSAGE back to every attached connection, including this one;
    // clientMessageId is how we recognize and skip our own echo.
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

      await this._ensureSocket();
      this._ws.send(JSON.stringify({
        type: AO_FRAME.USER_INPUT,
        text: `${buildFailedUploadsText(failed)}${message}`,
        clientMessageId,
        ...(artifactIds.length && { attachments: artifactIds }),
        client_context: buildClientContext(this._context, items),
      }));
    } catch (err) {
      this._messages = [...this._messages, { role: 'assistant', content: `Error: ${err.message}` }];
      this._done();
    }
  }

  destroy() {
    this._destroyed = true;
    this._ws?.close();
  }
}
