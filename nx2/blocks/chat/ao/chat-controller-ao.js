import { loadIms } from '../../../utils/ims.js';
import { env } from '../../../scripts/nx.js';
import { daFetch } from '../../../utils/api.js';
import { DA_ADMIN } from '../../../utils/utils.js';
import { ROLE } from '../constants.js';
import {
  loadMessages, saveMessages, resetSession, getRoomKey,
} from '../utils/persistence.js';
import { buildSelectionContext } from '../utils/chat-helpers.js';
import { AO_EVENT, AO_FRAME, AO_TOOL_STATE } from './ao-constants.js';

// The /ws route skips AO's ingress-level IMS/entitlement check entirely (auth happens
// via the app-level AUTH frame instead, since browsers can't send custom headers during
// a WebSocket handshake) — unlike the A2A HTTP/SSE transport, which hit both a CORS wall
// and an AEP product-entitlement gate we don't have. Hence WebSocket here instead of fetch.
// Templated with the episode (context) id so a reload can reconnect to the same episode
// instead of always starting a fresh one — see _loadPersisted()/_openSocket().
//
// AO is deployed per-region (va7, aus5, can2, che2, gbr9, ind2, nld2, ...), each with
// its own isolated data store — an org's episodes/turns live in exactly one region, not
// behind a shared front door. Coworker never hardcodes this: its browser calls its own
// same-origin API, and the server resolves the real AO host from deployment config. EW
// has no server of its own to do the equivalent, so this is pinned to the region our
// current tenants are actually provisioned in — not a durable per-org resolution. If EW
// ever serves an org provisioned in a different region, this single constant is where
// that needs to change (see the region write-up shared with the Coworker/AO team).
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
  const headers = {
    authorization: `Bearer ${accessToken?.token}`,
    'x-tenant-id': orgId,
  };

  try {
    const initiateResp = await fetch(`${base}/api/v1/files/upload`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ filename: fileName, content_type: mediaType, scope: 'user' }),
    });
    if (!initiateResp.ok) return null;
    const { file_id: fileId, upload_url: uploadUrl } = await initiateResp.json();
    if (!fileId || !uploadUrl) return null;

    const putResp = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'content-type': mediaType,
        'x-ms-blob-type': 'BlockBlob',
      },
      body: base64ToBlob(dataBase64, mediaType),
    });
    if (!putResp.ok) return null;

    const finalizeResp = await fetch(`${base}/api/v1/files/${fileId}/finalize`, {
      method: 'POST',
      headers,
    });
    if (!finalizeResp.ok) return null;
    const { artifact_id: artifactId } = await finalizeResp.json();
    return artifactId ?? null;
  } catch {
    return null;
  }
}

const SKILLS_CACHE_PREFIX = 'da-chat-ao-skills--';

function parseSkillsListResponse(json) {
  const skills = Array.isArray(json?.skills) ? json.skills : null;
  if (!skills) return null;
  const ids = skills
    .filter((s) => !s?.hidden && s?.user_invocable !== false)
    .map((s) => s?.name)
    .filter((s) => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9][a-z0-9_-]{1,60}$/i.test(s));
  return ids.length ? ids : null;
}

function turnsToMessages(turns) {
  const messages = [];
  (turns ?? []).forEach((turn) => {
    if (turn?.user_input) messages.push({ role: ROLE.USER, content: turn.user_input });
    if (turn?.final_response) messages.push({ role: ROLE.ASSISTANT, content: turn.final_response });
  });
  return messages;
}

function loadCachedSkills(room) {
  try {
    const raw = localStorage.getItem(`${SKILLS_CACHE_PREFIX}${room}`);
    if (!raw) return null;
    const skills = JSON.parse(raw);
    return Array.isArray(skills) && skills.length ? skills : null;
  } catch {
    return null;
  }
}

function saveCachedSkills(room, skills) {
  try {
    localStorage.setItem(`${SKILLS_CACHE_PREFIX}${room}`, JSON.stringify(skills));
  } catch {
    // best-effort — localStorage can throw (quota, private mode); safe to ignore
  }
}

/**
 * Talks to Adobe's Agent Orchestrator (AO) over its WebSocket transport (see
 * https://aep-ao.pages.adobeitc.com/api-reference/spec/) instead of da-agent.
 * Handles message-in/message-out, tool-call permission requests, user questions,
 * plan approval, a2ui artifacts, and cross-surface episode continuity.
 *
 * Public surface used by chat.js mirrors chat-controller.js's (connect,
 * setContext, loadInitialMessages, sendMessage, approveToolCall, clear,
 * setMcpConfig, stop, destroy) plus AO-only additions chat.js gates on
 * (getSkills, answerQuestion, declineQuestion, respondToPlanApproval,
 * switchToLatestEpisode, dismissNewerEpisode) — da-agent's controller has no
 * equivalent of these, since it has no concept of questions/plans/episodes.
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
      newerEpisodeAvailable: this._newerEpisodeAvailable,
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
      role: ROLE.ASSISTANT,
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
        role: ROLE.ASSISTANT,
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
      if (!this._hasPendingInteraction()) {
        this._done();
      }
      return;
    }

    // 'ERROR' (connection-level, e.g. pre-auth failures) and 'error' (a genuine
    // SessionEvent, e.g. the model provider being unreachable mid-turn) are two
    // different frames with the message in different places.
    if (evt.type === AO_EVENT.ERROR_CONNECTION || evt.type === AO_EVENT.ERROR_SESSION) {
      const message = evt.data?.message ?? evt.message ?? 'Something went wrong.';
      // _done() first, so any partial streamed response it flushes lands in
      // history before this error message, not after it.
      this._done();
      this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: `Error: ${message}` }];
      this._update();
    }
  }

  // True only while a turn is genuinely suspended waiting for a permission/question/
  // plan reply. Used by the "don't clobber/auto-resume over live state" checks — e.g.
  // don't treat a turn as done, or silently reconcile onto a newer episode, or show a
  // spurious connection error, while the user still has something pending to answer.
  _hasPendingInteraction() {
    const hasPendingApproval = [...(this._toolCards?.values() ?? [])]
      .some((c) => c.state === AO_TOOL_STATE.APPROVAL_REQUESTED);
    return !!(this._pendingQuestion || this._pendingPlanApproval || hasPendingApproval);
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
        // _thinking stays true across a pending question/approval/plan (see the
        // turn_suspended handler) purely to keep the plain input disabled while a
        // popup is the only valid response channel — it does NOT mean a turn is
        // still actively in flight. AO tears down the episode's worker almost
        // immediately after suspending a turn to ask something, so the socket
        // closing right here is the normal, expected shape of "waiting on the
        // user," not a dropped connection — don't show an error for it. The
        // pending card stays up; answering it still works (it reconnects and
        // sends via RESUME).
        if (this._thinking && !this._hasPendingInteraction()) {
          // _done() first, so any partial streamed response it flushes lands in
          // history before this error message, not after it.
          this._done();
          this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: 'Error: connection closed' }];
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
      // Only once per controller lifetime, on genuine first load — not on retry
      // attempts, and not on the reconnect that follows an explicit clear().
      // clear() means "start over"; re-running this there would immediately
      // resume Coworker's latest episode and make Clear unable to ever produce
      // an actual blank chat. Case 3 (auto-resume into an empty room) only
      // applies to a tab that's never had a local conversation at all.
      if (attempt === 0 && !this._reconciledOnce) {
        this._reconciledOnce = true;
        await this._loadPersisted();
        await this._reconcileWithLatestEpisode();
      }
      await this._openSocket();
      this._connected = true;
      this._syncSkillsCache();
    } catch {
      this._connected = false;
      const delay = 1000 * 2 ** attempt;
      if (delay < 30000) this._retryTimeout = setTimeout(() => this.connect(attempt + 1), delay);
    } finally {
      this._update();
    }
  }

  // Current best-known skill list: the once-per-episode cached/discovered answer if
  // we have one, else empty — no static fallback list, since a hardcoded guess doesn't
  // reflect what a manifest actually exposes and would be actively misleading to show.
  getSkills() {
    return this._cachedSkills ?? [];
  }

  // Real catalog lookup. Best-effort: a network error or unexpected response shape
  // just returns null, leaving whatever's already cached (or []) in place rather than
  // throwing or caching garbage.
  async _fetchSkillsFromApi() {
    const { accessToken, projectedProductContext } = await loadIms();
    const orgId = getOrgId(projectedProductContext);
    const base = AO_HTTP_BASE[env] ?? AO_HTTP_BASE.stage;
    try {
      const resp = await fetch(`${base}/api/v1/skills?manifest_id=${AO_MANIFEST_ID}`, {
        headers: {
          authorization: `Bearer ${accessToken?.token}`,
          'x-tenant-id': orgId,
        },
      });
      if (!resp.ok) return null;
      return parseSkillsListResponse(await resp.json());
    } catch {
      return null;
    }
  }

  // Stale-while-revalidate: shows the last-known list immediately (so the slash-menu
  // isn't empty while this resolves), then refreshes from the real API in the
  // background and updates both the in-memory list and localStorage once that lands.
  // Never blocks connect() — runs fire-and-forget.
  async _syncSkillsCache() {
    const room = await this._getRoom();
    const cached = loadCachedSkills(room);
    if (cached) this._cachedSkills = cached;

    const apiSkills = await this._fetchSkillsFromApi();
    if (apiSkills) {
      this._cachedSkills = apiSkills;
      saveCachedSkills(room, apiSkills);
    }
  }

  // GET /api/v1/episodes?limit=1 — episodes are returned most-recent-first, so the
  // first entry is authoritative for "what's the latest conversation this owner has,
  // on any client". Best-effort: network/shape failures return null rather than throwing.
  async _fetchLatestEpisode() {
    const { accessToken, projectedProductContext } = await loadIms();
    const orgId = getOrgId(projectedProductContext);
    const base = AO_HTTP_BASE[env] ?? AO_HTTP_BASE.stage;
    try {
      const resp = await fetch(`${base}/api/v1/episodes?limit=1`, {
        headers: {
          authorization: `Bearer ${accessToken?.token}`,
          'x-tenant-id': orgId,
        },
      });
      if (!resp.ok) return null;
      const { episodes } = await resp.json();
      return episodes?.[0] ?? null;
    } catch {
      return null;
    }
  }

  // GET /api/v1/episodes/{id}/turns?root_only=true — root_only drops sub-agent turns
  // (chat history only cares about the main thread); omitting `limit` returns the
  // whole episode per the endpoint's documented legacy behavior.
  async _fetchEpisodeMessages(episodeId) {
    const { accessToken, projectedProductContext } = await loadIms();
    const orgId = getOrgId(projectedProductContext);
    const base = AO_HTTP_BASE[env] ?? AO_HTTP_BASE.stage;
    try {
      const resp = await fetch(`${base}/api/v1/episodes/${episodeId}/turns?root_only=true`, {
        headers: {
          authorization: `Bearer ${accessToken?.token}`,
          'x-tenant-id': orgId,
        },
      });
      if (!resp.ok) return [];
      const { turns } = await resp.json();
      return turnsToMessages(turns);
    } catch {
      return [];
    }
  }

  // Cross-surface continuity: Coworker and this chat both resume episodes by the
  // same numeric id, so we can tell when the owner's most-recently-active
  // conversation lives on a different client and react per case:
  //  - nothing local yet (fresh room)              -> silently resume it here
  //  - local episode already IS the latest one      -> silently pull in anything
  //    that happened over there since we last loaded (unless something in this
  //    tab is actively pending — never clobber live state under the user)
  //  - local episode is a DIFFERENT, older one       -> leave it alone and just
  //    surface the option; switchToLatestEpisode() opts in explicitly
  // Awaited from connect() before _openSocket() so case 1 can steer which
  // episode id the socket resumes, rather than opening on 'new' and then
  // realizing there was somewhere to resume.
  async _reconcileWithLatestEpisode() {
    const latest = await this._fetchLatestEpisode();
    if (!latest) return;
    const latestId = String(latest.id);

    if (!this._episodeId) {
      this._messages = await this._fetchEpisodeMessages(latestId);
      this._episodeId = latestId;
      this._persist();
      this._update();
      return;
    }

    if (String(this._episodeId) === latestId) {
      if (this._thinking || this._hasPendingInteraction()) {
        return;
      }
      this._messages = await this._fetchEpisodeMessages(latestId);
      this._persist();
      this._update();
      return;
    }

    this._newerEpisodeAvailable = {
      id: latestId,
      title: latest.title,
      updatedAt: latest.updated_at,
    };
    this._update();
  }

  // Opts into the newer conversation surfaced by _reconcileWithLatestEpisode(): drops
  // this tab's live socket/turn (if any) and reopens on the other episode's id, after
  // hydrating its history the same way case 1/2 above do.
  switchToLatestEpisode = async () => {
    const pending = this._newerEpisodeAvailable;
    if (!pending) return;
    this._newerEpisodeAvailable = null;
    if (this._thinking) this.stop();
    this._closingIntentionally = true;
    this._ws?.close();

    this._messages = await this._fetchEpisodeMessages(pending.id);
    this._episodeId = pending.id;
    this._streamingText = undefined;
    this._connected = false;
    this._pendingQuestion = null;
    this._pendingPlanApproval = null;
    this._toolCards = new Map();
    this._persist();
    this._update();

    await this.connect();
  };

  dismissNewerEpisode = () => {
    this._newerEpisodeAvailable = null;
    this._update();
  };

  _done() {
    // A turn can end (error, abort, or a dropped connection) before its text_done
    // event ever arrives. Flush whatever streamed in so far into a real message
    // first — otherwise clearing _streamingText below silently discards it, and
    // the assistant's (partial) response just vanishes from history instead of
    // showing whatever was actually received.
    if (this._streaming) {
      this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: this._streaming }];
      this._streaming = '';
    }
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
    this._newerEpisodeAvailable = null;
    this._toolCards = new Map();
    // _cachedSkills is deliberately left as-is — it's tied to the manifest, not the
    // episode being cleared, so the slash-menu keeps showing it through the reconnect
    // rather than blanking until _syncSkillsCache() re-fetches.
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

  // Every interaction-response method below sends through this instead of a bare
  // this._ws.send(...): AO's session for an episode goes idle almost immediately
  // once a turn suspends, so the socket has commonly already silently reconnected
  // by the time the user actually answers. Reconnect first if needed, same as
  // sendMessage() already does for its own upload-delay case.
  async _ensureReady() {
    if (this._ws?.readyState === WebSocket.OPEN && this._ready) return true;
    await this.connect();
    return !!this._ready;
  }

  _reportUndeliverable() {
    this._messages = [...this._messages, {
      role: ROLE.ASSISTANT,
      content: 'Error: could not deliver your response. Please try again.',
    }];
    this._update();
  }

  // Mirrors chat-controller.js's approveToolCall: resolves the clicked card, bulk-approves
  // any other pending cards with the same tool name on "always approve", then answers all
  // of those decisions in one permission-response DataPart (AO resumes the turn as soon as
  // any response arrives, so partial/staggered responses aren't supported). Sent via the
  // generic RESUME op rather than the dedicated PERMISSION_RESPONSE frame: RESUME is a
  // valid *first* op on a fresh connection (the server dispatches on the DataPart's own
  // "type"), while PERMISSION_RESPONSE is only ever valid as a *later* op — and per
  // _ensureReady above, the connection here is commonly fresh. manifestId/debugMode are
  // required on RESUME too, not just USER_INPUT: AO re-resolves the episode's manifest
  // from each op's own fields (confirmed directly against aep-ai source) — omitting them
  // silently rebuilds (or discards a live, cached session for) the worker under AO's
  // default manifest instead of experience-workspace, dropping the da-content plugin's
  // MCP servers entirely.
  approveToolCall = async (toolCallId, approved, always = false) => {
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

    if (!(await this._ensureReady())) {
      this._reportUndeliverable();
      return;
    }
    this._ws.send(JSON.stringify({
      type: AO_FRAME.RESUME,
      turn_id: card.turnId,
      data: { type: 'permission-response', decisions },
      manifestId: AO_MANIFEST_ID,
      debugMode: true,
    }));
  };

  // answersByQuestionId: { [questionId]: string[] } — selected option labels plus any
  // free-text answer, already merged by the question-card UI. Sent via RESUME, same
  // reasoning as approveToolCall above.
  answerQuestion = async (answersByQuestionId) => {
    if (!this._pendingQuestion) return;
    const { turnId, questions } = this._pendingQuestion;
    const answers = questions.map((q) => ({
      question_id: q.id,
      selected_options: answersByQuestionId[q.id] ?? [],
    }));
    this._pendingQuestion = null;
    this._update();

    if (!(await this._ensureReady())) {
      this._reportUndeliverable();
      return;
    }
    this._ws.send(JSON.stringify({
      type: AO_FRAME.RESUME,
      turn_id: turnId,
      data: { type: 'question-response', answers, declined: false },
      manifestId: AO_MANIFEST_ID,
      debugMode: true,
    }));
  };

  declineQuestion = async () => {
    if (!this._pendingQuestion) return;
    const { turnId } = this._pendingQuestion;
    this._pendingQuestion = null;
    this._update();

    if (!(await this._ensureReady())) {
      this._reportUndeliverable();
      return;
    }
    this._ws.send(JSON.stringify({
      type: AO_FRAME.RESUME,
      turn_id: turnId,
      data: { type: 'question-response', answers: [], declined: true },
      manifestId: AO_MANIFEST_ID,
      debugMode: true,
    }));
  };

  // Plan approval has no dedicated WS frame type of its own — the server dispatches
  // by DataPart "type" inside the generic RESUME op, so this sends a "plan-response"
  // part wrapped in a RESUME frame instead. See approveToolCall above: RESUME
  // re-resolves the manifest per-op, so manifestId/debugMode must be repeated here too.
  respondToPlanApproval = async (decision, feedback = '') => {
    if (!this._pendingPlanApproval) return;
    const { turnId } = this._pendingPlanApproval;
    this._pendingPlanApproval = null;
    this._update();

    if (!(await this._ensureReady())) {
      this._reportUndeliverable();
      return;
    }
    this._ws.send(JSON.stringify({
      type: AO_FRAME.RESUME,
      turn_id: turnId,
      data: {
        type: 'plan-response',
        decision,
        feedback,
        edited_plan_content: null,
      },
      manifestId: AO_MANIFEST_ID,
      debugMode: true,
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
    const attachmentsMeta = attachments.map(({
      id, fileName, mediaType, sizeBytes,
    }) => ({
      id, fileName, mediaType, ...(typeof sizeBytes === 'number' ? { sizeBytes } : {}),
    }));

    this._messages = [...(this._messages ?? []), {
      role: ROLE.USER,
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
          role: ROLE.ASSISTANT,
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
      ...(artifactIds.length && { attachments: artifactIds }),
    }));
  }
}
