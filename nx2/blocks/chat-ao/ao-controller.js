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
import { AO_FRAME, AO_EVENT, AO_MANIFEST_ID } from './ao-constants.js';
import { buildSelectionText, buildFailedUploadsText, buildPageContextText } from './utils/user-context.js';
import { uploadAttachment, getOrgId, resolveAoWsBase } from './utils/uploads.js';
import {
  fetchEpisodes, fetchEpisodeMessages, fetchEpisodeContext, warmSession,
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
    this._thinking = !!pendingInteraction;
    this._loadingEpisode = false;
    this._update();
  }

  async _refreshEpisodeList() {
    this._episodes = await this._fetchEpisodes();
    this._update();
  }

  // A pending question/plan is suspended, not streaming — safe to abandon and
  // resume later. Only real in-flight generation should block switching away.
  get _blockedByActiveTurn() {
    return this._thinking && !this._pendingQuestion && !this._pendingPlanApproval;
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
        if (this._thinking) {
          this._messages = [...this._messages, { role: 'assistant', content: 'Error: connection closed' }];
          this._done();
        }
      });

      ws.addEventListener('error', () => {
        if (!isCurrent()) return;
        reject(new Error('AO WebSocket error'));
      });
    });
  }

  _handleServerEvent(evt) {
    if (evt.type === AO_EVENT.SESSION_READY) {
      const isNewEpisode = evt.episode_id && evt.episode_id !== this._episodeId;
      this._episodeId = evt.episode_id ?? this._episodeId;
      if (isNewEpisode) this._refreshEpisodeList();
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

    if (evt.type === AO_EVENT.TURN_COMPLETED || evt.type === AO_EVENT.TURN_ABORTED) {
      this._done();
      return;
    }

    if (evt.type === AO_EVENT.EPISODE_TITLE_UPDATED) {
      const { episode_id: episodeId, title } = evt.data ?? {};
      this._episodes = this._episodes.map((ep) => (ep.id === episodeId ? { ...ep, title } : ep));
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

    if (evt.type === AO_EVENT.ERROR_CONNECTION || evt.type === AO_EVENT.ERROR_SESSION) {
      // Idle means nothing was actually asked of AO — e.g. a background warm
      // attempt failing. Only surface errors during an actual turn.
      if (!this._thinking) return;
      const message = evt.data?.message ?? evt.message ?? 'Something went wrong.';
      this._messages = [...this._messages, { role: 'assistant', content: `Error: ${message}` }];
      this._done();
    }
  }

  _done() {
    this._thinking = false;
    this._streamingText = undefined;
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

  async sendMessage(message, items = [], attachments = []) {
    if (!message || (this._thinking && !this._pendingPlanApproval)) return;

    const selectionContext = buildSelectionContext(items);
    const attachmentsMeta = buildAttachmentsMeta(attachments);

    this._messages = [...this._messages, {
      role: 'user',
      content: message,
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
        text: `${buildPageContextText(this._context)}${buildSelectionText(items)}${buildFailedUploadsText(failed)}${message}`,
        manifestId: AO_MANIFEST_ID,
        debugMode: true,
        ...(artifactIds.length && { attachments: artifactIds }),
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
