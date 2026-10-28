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

import BaseChatController from './base-chat-controller.js';
import { AO_COMPONENT_CATALOG_URL } from './ao-constants.js';
import {
  fetchEpisodes, fetchEpisodeMessages, fetchEpisodeContext, warmSession,
} from './utils/episodes.js';

const EPISODE_LIST_LIMIT = 10;

// See docs/chat-ao-component.md#episode-switching — beyond this, don't
// auto-resume; offer it as an explicit choice from the welcome view instead.
const STALE_EPISODE_MS = 24 * 60 * 60 * 1000;

// AO-direct / CX Coworker harness: episode history comes from the orchestrator
// REST API (list + messages + warm session). See docs/chat-ao-controller-decoupling.md.
export default class CoworkerChatController extends BaseChatController {
  _fetchEpisodes() { return fetchEpisodes(EPISODE_LIST_LIMIT); }

  _fetchEpisodeMessages(episodeId) { return fetchEpisodeMessages(episodeId); }

  _fetchEpisodeContext(episodeId) { return fetchEpisodeContext(episodeId); }

  _fetchWarmSession(episodeId) { return warmSession(episodeId); }

  _catalogUrl() { return AO_COMPONENT_CATALOG_URL; }

  // Coworker warm also hits the REST warm endpoint before attaching (AO caches
  // the rehydrated session); Base.warmSession covers the attach-only case.
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

  async loadEpisodes() {
    this._episodes = await this._fetchEpisodes();
    const latest = this._episodes[0];
    const age = latest ? Date.now() - new Date(latest.updated_at).getTime() : NaN;
    if (latest && !(age > STALE_EPISODE_MS)) {
      await this._loadEpisode(latest.id);
    } else {
      this._staleEpisode = age > STALE_EPISODE_MS ? latest : undefined;
      this._update();
    }
  }

  async _loadEpisode(episodeId) {
    this._episodeId = episodeId;
    this._staleEpisode = undefined;
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

  async switchEpisode(episodeId) {
    if (!episodeId || episodeId === this._episodeId || this._blockedByActiveTurn) return;
    this._ws?.close();
    this._ws = null;
    this._streaming = '';
    this._streamingText = undefined;
    await this._loadEpisode(episodeId);
  }
}
