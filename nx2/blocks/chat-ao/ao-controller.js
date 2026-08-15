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
import { env } from '../../scripts/nx.js';
import {
  AO_WS_BASE, AO_FRAME, AO_EVENT, AO_MANIFEST_ID,
} from './ao-constants.js';
import { buildSelectionText, buildFailedUploadsText, buildPageContextText } from './utils/user-context.js';
import { uploadAttachment, getOrgId } from './utils/uploads.js';
import { fetchEpisodes, fetchEpisodeMessages } from './utils/episodes.js';

const EPISODE_LIST_LIMIT = 10;

export default class AoChatController {
  constructor({ onUpdate }) {
    this._onUpdate = onUpdate;
    this._messages = [];
    this._streaming = '';
    this._episodes = [];
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
    });
  }

  _fetchEpisodes() { return fetchEpisodes(EPISODE_LIST_LIMIT); }

  _fetchEpisodeMessages(episodeId) { return fetchEpisodeMessages(episodeId); }

  async loadEpisodes() {
    this._episodes = await this._fetchEpisodes();
    const latest = this._episodes[0];
    if (latest) await this._loadEpisode(latest.id);
    else this._update();
  }

  async _loadEpisode(episodeId) {
    this._episodeId = episodeId;
    this._messages = await this._fetchEpisodeMessages(episodeId);
    this._update();
  }

  async _refreshEpisodeList() {
    this._episodes = await this._fetchEpisodes();
    this._update();
  }

  async switchEpisode(episodeId) {
    if (!episodeId || episodeId === this._episodeId || this._thinking) return;
    this._ws?.close();
    this._ws = null;
    this._streaming = '';
    this._streamingText = undefined;
    await this._loadEpisode(episodeId);
  }

  startNewEpisode() {
    if (this._thinking) return;
    this._ws?.close();
    this._ws = null;
    this._episodeId = undefined;
    this._messages = [];
    this._streaming = '';
    this._streamingText = undefined;
    this._update();
  }

  async _authFrame() {
    const {
      accessToken, userId, tenantId, email, name, projectedProductContext,
    } = await loadIms();
    return {
      type: AO_FRAME.AUTH,
      authorization: `Bearer ${accessToken?.token}`,
      'x-org-name': tenantId,
      'x-tenant-id': getOrgId(projectedProductContext),
      'x-user-email': email,
      'x-user-id': userId,
      'x-user-name': name,
    };
  }

  async _ensureSocket() {
    if (this._ws?.readyState === WebSocket.OPEN) return;

    await new Promise((resolve, reject) => {
      const base = AO_WS_BASE[env] ?? AO_WS_BASE.stage;
      const ws = new WebSocket(`${base}/ws/sessions/${this._episodeId ?? 'new'}`);
      this._ws = ws;

      // Guards against a stale socket if clear()/a later _ensureSocket() call replaces it.
      const isCurrent = () => this._ws === ws;

      ws.addEventListener('open', () => { if (isCurrent()) resolve(); });

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

    if (evt.type === AO_EVENT.ERROR_CONNECTION || evt.type === AO_EVENT.ERROR_SESSION) {
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

  async sendMessage(message, items = [], attachments = []) {
    if (!message || this._thinking) return;

    this._messages = [...this._messages, { role: 'user', content: message }];
    this._thinking = true;
    this._update();

    try {
      const uploaded = await Promise.all(attachments.map(async (a) => (
        { ...a, artifactId: await uploadAttachment(a) }
      )));
      const artifactIds = uploaded.map((a) => a.artifactId).filter(Boolean);
      const failed = uploaded.filter((a) => !a.artifactId);

      await this._ensureSocket();
      this._ws.send(JSON.stringify(await this._authFrame()));
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
