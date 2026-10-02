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
import BaseChatController from './base-chat-controller.js';
import { AO_FRAME, CMA_BRIDGE_WS_BASE } from './ao-constants.js';
import { getOrgId } from './utils/uploads.js';
import { fetchSkills } from './utils/skills.js';

// The alternate-harness (CMA bridge) rejects the AUTH frame with terse,
// internal-sounding messages. Map those to tester-facing copy; leave any other
// backend error untouched. See docs/chat-ao-alt-harness.md.
function friendlyBackendError(message) {
  if (typeof message !== 'string') return 'Something went wrong.';
  if (/activation key/i.test(message)) {
    return 'This site isn\'t enabled for the alternate assistant yet, or its activation key is wrong. Check the site\'s ew.altHarness config.';
  }
  if (/gate misconfigured/i.test(message)) {
    return 'The alternate assistant is temporarily unavailable. Please try again shortly.';
  }
  return message;
}

// CMA bridge harness: WS-only (no REST episode list/history). The bridge replays
// a session's history on attach, so reload-resume is driven by a per-site
// pointer in sessionStorage rather than an orchestrator episode list.
// See docs/chat-ao-controller-decoupling.md and docs/chat-ao-alt-harness.md.
export default class CmaChatController extends BaseChatController {
  constructor({ onUpdate, activationKey } = {}) {
    super({ onUpdate });
    this.setActivationKey(activationKey);
  }

  // Activation key from the `ew.altHarness` site-config flag — rides the AUTH
  // frame for server-side validation. Trim: config-sheet values often carry
  // stray whitespace, and the bridge compares the frame key exactly.
  setActivationKey(key) {
    const trimmed = typeof key === 'string' ? key.trim() : key;
    this._activationKey = trimmed || null;
  }

  async _connectionInfo() {
    const {
      accessToken, userId, tenantId, email, name, projectedProductContext,
    } = await loadIms();
    const { org, site } = this._context ?? {};
    const siteId = org && site ? `${org}/${site}` : undefined;
    return {
      authFrame: {
        type: AO_FRAME.AUTH,
        authorization: `Bearer ${accessToken?.token}`,
        'x-org-name': tenantId,
        'x-tenant-id': getOrgId(projectedProductContext),
        'x-user-email': email,
        'x-user-id': userId,
        'x-user-name': name,
        // x-site scopes the session per-site (S12); activationKey authorizes
        // and routes to the bridge. Both ride the one AUTH frame.
        ...(siteId ? { 'x-site': siteId } : {}),
        ...(this._activationKey ? { activationKey: this._activationKey } : {}),
      },
      wsBase: CMA_BRIDGE_WS_BASE,
    };
  }

  _fetchSkills() {
    return fetchSkills({ ...(this._context ?? {}), altHarnessKey: this._activationKey });
  }

  // Per-site resume pointer: the id of the session last active in THIS tab for
  // the current site, so a page reload reconnects to it (the bridge replays its
  // history) instead of starting a new session. Keyed by site so it can't
  // surface another site's conversation (the bridge rejects a cross-site attach
  // anyway — see the S12 site guard). sessionStorage survives reload (same tab)
  // and clears when the tab closes.
  _episodeStorageKey() {
    const { org, site } = this._context ?? {};
    return org && site ? `nx2:cma-episode:${org}/${site}` : null;
  }

  _storeEpisodeId(id) {
    const key = this._episodeStorageKey();
    if (!key) return;
    try {
      if (id) sessionStorage.setItem(key, id);
      else sessionStorage.removeItem(key);
    } catch { /* storage disabled — no-op */ }
  }

  _restoreEpisodeId() {
    const key = this._episodeStorageKey();
    if (!key) return undefined;
    try {
      return sessionStorage.getItem(key) || undefined;
    } catch {
      return undefined;
    }
  }

  // WS-only: no episode list to fetch. Resume the session last used in this tab
  // for the current site so a reload doesn't lose the conversation.
  async loadEpisodes() {
    const stored = this._restoreEpisodeId();
    if (stored) {
      this._resuming = true;
      await this._loadEpisode(stored);
    } else {
      this._update();
    }
  }

  // Lean resume: point at the stored session and attach — the bridge replays
  // history over the socket. No REST messages/context fetch (there is none).
  async _loadEpisode(episodeId) {
    this._episodeId = episodeId;
    this._messages = [];
    this._pendingQuestion = undefined;
    this._pendingPlanApproval = undefined;
    this._pendingPermission = undefined;
    this._thinking = false;
    this._loadingEpisode = true;
    this._update();
    try {
      await this._attach();
    } catch {
      // resume failed to connect — _onSessionError clears the stale pointer
    }
  }

  _onSessionReady(evt) {
    this._episodeId = evt.episode_id ?? this._episodeId;
    this._resuming = false; // resume (or new session) succeeded
    this._loadingEpisode = false;
    this._storeEpisodeId(this._episodeId); // persist so a reload resumes this session
    this._update();
  }

  _onSessionError(evt) {
    // A resume attempt (reload reconnecting to the stored session) can be
    // rejected if that session is gone or isn't ours (the bridge's
    // site/tenant/user guard). Drop the stale pointer and start fresh rather
    // than leaving a dead session the user can't recover from.
    if (this._resuming) {
      this._resuming = false;
      this._loadingEpisode = false;
      this._storeEpisodeId(undefined);
      this.startNewEpisode();
      return;
    }
    // Idle means nothing was actually asked of the bridge (e.g. a background
    // warm attempt failing) — only surface errors during an actual turn.
    if (!this._blockedByActiveTurn) return;
    const message = friendlyBackendError(evt.data?.message ?? evt.message);
    this._messages = [...this._messages, { role: 'assistant', content: `Error: ${message}` }];
    this._done();
  }

  startNewEpisode() {
    if (this._blockedByActiveTurn) return;
    this._resuming = false;
    this._storeEpisodeId(undefined); // drop the resume pointer for this site
    super.startNewEpisode();
  }
}
