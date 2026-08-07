import { loadIms } from '../../utils/ims.js';
import { env } from '../../scripts/nx.js';
import { daFetch } from '../../utils/api.js';
import { DA_ADMIN } from '../../utils/utils.js';
import { ROLE, TOOL_STATE } from './constants.js';
import {
  loadMessages, saveMessages, resetSession, getRoomKey,
} from './utils/persistence.js';
import { buildSelectionContext } from './utils/chat-helpers.js';

// The /ws route skips AO's ingress-level IMS/entitlement check entirely (auth happens
// via the app-level AUTH frame instead, since browsers can't send custom headers during
// a WebSocket handshake) — unlike the A2A HTTP/SSE transport, which hit both a CORS wall
// and an AEP product-entitlement gate we don't have. Hence WebSocket here instead of fetch.
// Templated with the episode (context) id so a reload can reconnect to the same episode
// instead of always starting a fresh one — see _loadPersisted()/_openSocket().
const AO_WS_BASE = {
  prod: 'wss://agent-orchestrator-prod-va7.adobe.io',
  stage: 'wss://agent-orchestrator-stage-va7.adobe.io',
  // Local dev runs the bridge locally (claudebridge, plain ws:// on :8080).
  // With AGENT_TOKEN_VALIDATION_ENABLED=false it accepts the AUTH frame without
  // an IMS check, so the localhost staging token is a non-issue.
  dev: 'ws://localhost:8080',
};

const AO_HTTP_BASE = {
  prod: 'https://agent-orchestrator-prod-va7.adobe.io',
  stage: 'https://agent-orchestrator-stage-va7.adobe.io',
  dev: 'http://localhost:8080',
};

// Manifest carrying the da-content skills (browse/create/update/delete/organize/
// versions/media/fragment-lookup/publish/site-config) — not targeted to any segment,
// so it must be selected explicitly per turn rather than relying on auto-selection.
const AO_MANIFEST_ID = 'experience-workspace';

// ims.js's own `tenantId` is prodCtx.tenant_id (a human-readable label like "sitesinternal"),
// not the IMS Org ID AO's x-tenant-id expects (the "ORGID@AdobeOrg" shape). Pull that from
// owningEntity instead — it's the same value on every projectedProductContext entry.
function getOrgId(projectedProductContext) {
  return projectedProductContext?.find((p) => p.prodCtx?.owningEntity)?.prodCtx.owningEntity;
}

// AO's episode_id is a numeric Snowflake id (ws_handler.py accepts 'new' or a numeric
// string; anything else is resolved as an external session/context id, which only
// works if that id was previously mapped to an episode on this AO deployment). This
// same IndexedDB room key is also written by chat-controller.js (the non-AO chat
// path), which persists its own client-invented `crypto.randomUUID()` as sessionId —
// never registered with AO. Without this guard, a room that ever ran under the old
// controller hands that UUID back here as `this._episodeId`, sent straight to
// `/ws/sessions/{uuid}`, which AO correctly rejects as "Invalid episode_id".
function isAoEpisodeId(id) {
  return id != null && /^\d+$/.test(String(id));
}

// Public spec calls this event "question" with answers shaped {id, value} — the real
// server (aep_ai_runtime.agents.events.SessionEvent.user_question) emits "user_question"
// and expects answers shaped {question_id, selected_options: [...]} instead. Same mismatch
// pattern as SESSION_READY timing: verified straight from aep-ai source, not the docs.
function parseToolArguments(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function base64ToBlob(base64, mediaType) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i += 1) bytes[i] = byteChars.charCodeAt(i);
  return new Blob([bytes], { type: mediaType });
}

// AO's own Files API, confirmed directly from aep-ai source (apps/a2a/api/routes/files.py
// + filesystem/upload_service.py) — the public docs page's schema for POST /upload is
// wrong (it documents multipart/binary; the real handler takes JSON metadata and hands
// back a presigned URL for the actual bytes):
//   1. POST /api/v1/files/upload  { filename, content_type, scope }
//        -> { file_id, artifact_id, upload_url, expires_at }
//   2. PUT <upload_url>  — raw bytes, direct to blob storage, not proxied through AO
//   3. POST /api/v1/files/{file_id}/finalize -> { artifact_id, ... }
// artifact_id is the string USER_INPUT.attachments expects. Best-effort throughout: any
// failed step just returns null so the caller falls back to the DA-admin-upload workaround.
async function uploadAttachmentToAo({ fileName, mediaType, dataBase64 }) {
  if (!dataBase64) return null;
  const { accessToken, projectedProductContext } = await loadIms();
  const orgId = getOrgId(projectedProductContext);
  const base = AO_HTTP_BASE[env] ?? AO_HTTP_BASE.stage;
  const headers = {
    authorization: `Bearer ${accessToken?.token}`,
    // 'x-org-name': tenantId,
    'x-tenant-id': orgId,
    // 'x-user-email': email,
    // 'x-user-id': userId,
    // 'x-user-name': name,
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
        // Azure's "Put Blob" REST operation requires this on a direct single-PUT
        // upload (as opposed to Put Block/Put Block List) — without it, Azure returns
        // 400 MissingRequiredHeader, which is indistinguishable from a CORS block in
        // the browser (the response body isn't readable either way) until proxied.
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

// GET /api/v1/skills?manifest_id={manifest_id} — confirmed from aep-ai's
// apps/a2a/api/routes/skills/routes.py (list_skills), whose own docstring says it merges
// platform + tenant/org + OWNER-SPECIFIC (personal) skills from identity headers, and is
// what Coworker's own chat page uses. Deliberately used instead of the narrower
// /manifests/{id}/skills/discovered (a manifest-config listing with no identity-scoping
// at all, so it can never include personal skills — that's the gap this replaces).
// Shape: { skills: [{ name, directory_name, hidden, user_invocable, ... }], count }.
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

// A Turn (aep-ai's memory/turn/models.py) is one request/response cycle with
// user_input and final_response as sibling fields — not separate role-tagged
// messages like our own _messages array. Split each into a user + assistant
// entry (skipping either when empty, e.g. an open/aborted turn with no
// response yet) to rebuild history the way chat-controller-ao already expects it.
function turnsToMessages(turns) {
  const messages = [];
  (turns ?? []).forEach((turn) => {
    if (turn?.user_input) messages.push({ role: ROLE.USER, content: turn.user_input });
    if (turn?.final_response) messages.push({ role: ROLE.ASSISTANT, content: turn.final_response });
  });
  return messages;
}

// Tied to the manifest, not the conversation — unlike the old LLM self-report probe,
// a GET is cheap enough to just refresh every connect(), so this is stale-while-
// revalidate rather than a once-per-episode cache: shows the last-known list
// immediately, then _syncSkillsCache() overwrites it once a fresh fetch lands.
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
 * Exploration variant of ChatController that talks to Adobe's Agent Orchestrator (AO)
 * over its WebSocket transport (see https://aep-ao.pages.adobeitc.com/api-reference/spec/)
 * instead of da-agent. Handles message-in/message-out, tool-call permission requests
 * (reusing the same approval-card UI as chat-controller.js), and user_question prompts.
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

  // Loads persisted messages + episode id exactly once, however loadInitialMessages()/
  // connect() end up ordering relative to each other (chat.js calls connect() first,
  // but _openSocket() needs the episode id before it opens the socket).
  async _loadPersisted() {
    if (this._persistedLoaded) return;
    this._persistedLoaded = true;
    const room = await this._getRoom();
    const { messages, sessionId: episodeId, clearedSessionId } = await loadMessages(room);
    if (messages.length) this._messages = messages;
    this._episodeId = isAoEpisodeId(episodeId) ? episodeId : undefined;
    // fix: clear-persist (upstream candidate, not demo-only)
    this._clearedEpisodeId = clearedSessionId ? String(clearedSessionId) : undefined;
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
    this._onUpdate({
      messages: this._messages,
      thinking: this._thinking,
      streamingText: this._streamingText,
      connected: this._connected,
      toolCards: this._toolCards,
      pendingQuestion: this._pendingQuestion,
      pendingPlanApproval: this._pendingPlanApproval,
      newerEpisodeAvailable: this._newerEpisodeAvailable,
    });
  }

  /* --- feature: figma->catalyst — let the Catalyst path own its messages in
   * this store, so the EMA conversation renders, persists, and isn't wiped by a
   * later controller update. `appendMessage` adds one; `refreshMessages` re-emits
   * after a message object was mutated in place (e.g. streaming). --- */
  appendMessage(msg) {
    this._messages = [...(this._messages ?? []), msg];
    this._persist();
    this._update();
    return msg;
  }

  refreshMessages({ persist = false } = {}) {
    this._messages = [...(this._messages ?? [])];
    if (persist) this._persist();
    this._update();
  }
  /* --- end feature: figma->catalyst --- */

  _parse(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  // permission_request: maps AO's pending_calls onto the same toolCards Map +
  // TOOL_STATE.APPROVAL_REQUESTED the original da-agent controller uses, so the
  // existing approval-card UI (renderApprovalCard/approveToolCall) just works.
  _handlePermissionRequest(evt) {
    const turnId = evt.data?.turn_id ?? evt.turn_id;
    const pendingCalls = (evt.data?.pending_calls ?? [])
      .filter((c) => c.needs_permission !== false);
    const next = new Map(this._toolCards ?? []);
    pendingCalls.forEach((call) => {
      next.set(call.id, {
        toolName: call.name,
        input: parseToolArguments(call.arguments),
        state: TOOL_STATE.APPROVAL_REQUESTED,
        approvalId: call.id,
        turnId,
      });
    });
    this._toolCards = next;
    this._update();
  }

  // user_question: stores the pending question set for the question-card UI
  // (renderQuestionCard/answerQuestion/declineQuestion) to answer.
  _handleUserQuestion(evt) {
    this._pendingQuestion = {
      turnId: evt.data?.turn_id ?? evt.turn_id,
      questions: evt.data?.questions ?? [],
      context: evt.data?.context,
    };
    this._update();
  }

  // plan_approval_request: the agent drafted a plan and suspended the turn pending
  // review — stores it for the plan-approval-card UI (renderPlanApprovalCard/
  // respondToPlanApproval) to approve or reject.
  _handlePlanApprovalRequest(evt) {
    this._pendingPlanApproval = {
      turnId: evt.data?.turn_id ?? evt.turn_id,
      planContent: evt.data?.plan_content ?? '',
      planFilePath: evt.data?.plan_file_path,
    };
    this._update();
  }

  // ui_artifact_created: AO's "a2ui" surface for rich, structured content (tables,
  // plan cards, etc.) alongside plain text. Stored as its own message so renderers.js
  // can render known component types (DataTable, Markdown) and fall back to the
  // artifact's own text_fallback for anything we don't handle yet, rather than
  // silently dropping it.
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

  // Concatenates text_delta chunks, finalizes on text_done, and ends the turn on any
  // terminal event. Everything else (reasoning, usage) is intentionally ignored per
  // this variant's scope.
  _handleServerEvent(evt) {
    if (evt.type === 'SESSION_READY') {
      // Arrives after the first USER_INPUT is processed (see _openSocket's grace-timer
      // comment) — carries the episode id a future reload should reconnect to.
      this._episodeId = evt.episode_id ?? this._episodeId;
      this._persist();
      return;
    }

    if (evt.type === 'text_delta') {
      this._streaming += evt.data?.content ?? '';
      this._streamingText = this._streaming;
      this._update();
      return;
    }

    if (evt.type === 'text_done') {
      // A turn can emit several text_done segments interleaved with tool calls —
      // this closes one text segment, not the whole turn. Ending "thinking" here
      // re-enables the input mid-turn, and a message sent in that window gets
      // queued as a mid-turn injection into a still-active turn (see the
      // "turn did not complete in time" investigation). Only the genuine
      // terminal events below should call _done().
      this._messages = [...this._messages, {
        role: ROLE.ASSISTANT,
        content: evt.data?.content ?? this._streaming,
      }];
      this._streaming = '';
      // _done() used to clear this as a side effect; now that text_done no longer
      // calls _done() (see comment above), clear it explicitly — otherwise chat.js
      // renders the just-finalized text a second time as a stale "still streaming"
      // bubble, which only stops duplicating once the *next* segment's deltas
      // happen to overwrite it.
      this._streamingText = undefined;
      this._persist();
      this._update();
      return;
    }

    if (evt.type === 'permission_request') {
      this._handlePermissionRequest(evt);
      return;
    }

    if (evt.type === 'user_question') {
      this._handleUserQuestion(evt);
      return;
    }

    if (evt.type === 'plan_approval_request') {
      this._handlePlanApprovalRequest(evt);
      return;
    }

    if (evt.type === 'ui_artifact_created') {
      this._handleUiArtifactCreated(evt);
      return;
    }

    if (evt.type === 'turn_completed' || evt.type === 'turn_aborted') {
      this._done();
      return;
    }

    if (evt.type === 'turn_suspended') {
      // Fires after permission_request/user_question/plan_approval_request to formally
      // mark the suspension. If any of those already put up a popup, the *only* valid
      // response channel is that popup (PERMISSION_RESPONSE/QUESTION_RESPONSE/the
      // plan-response RESUME frame) — re-enabling the plain chat input here would let
      // the user answer in two conflicting ways at once, and a plain USER_INPUT sent
      // while suspended just becomes a stray "injection" the server drops. Only fall
      // back to _done() if nothing is actually pending.
      const hasPendingApproval = [...(this._toolCards?.values() ?? [])]
        .some((c) => c.state === TOOL_STATE.APPROVAL_REQUESTED);
      if (!this._pendingQuestion && !hasPendingApproval && !this._pendingPlanApproval) {
        this._done();
      }
      return;
    }

    // 'ERROR' (connection-level, e.g. pre-auth failures) and 'error' (a genuine
    // SessionEvent, e.g. the model provider being unreachable mid-turn) are two
    // different frames with the message in different places — miss either one and
    // the turn never resolves client-side: _done() never fires, so _thinking stays
    // true and the chat looks stuck even though the server has already given up.
    if (evt.type === 'ERROR' || evt.type === 'error') {
      const message = evt.data?.message ?? evt.message ?? 'Something went wrong.';
      this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: `Error: ${message}` }];
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
      }, 3000);
      const settle = (fn) => (arg) => {
        if (settled) return;
        settled = true;
        clearTimeout(graceTimer);
        fn(arg);
      };
      const rejectAuth = settle(reject);

      ws.addEventListener('open', () => {
        ws.send(JSON.stringify({
          type: 'AUTH',
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
          if (data.type === 'ERROR') rejectAuth(new Error(data.message ?? 'AO auth failed'));
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
          this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: 'Error: connection closed' }];
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
  // we have one, else empty — no static fallback list anymore, since a hardcoded guess
  // (the old 10-item da-* list) doesn't reflect what a manifest actually exposes (this
  // one has 27, across multiple plugins) and would be actively misleading to show.
  getSkills() {
    return this._cachedSkills ?? [];
  }

  // Real catalog lookup — both the IMS entitlement wall and CORS that used to block
  // this are resolved, so this calls AO directly now. Still best-effort: a network
  // error or unexpected response shape just returns null, leaving whatever's already
  // cached (or []) in place rather than throwing or caching garbage.
  async _fetchSkillsFromApi() {
    const {
      accessToken, projectedProductContext,
    } = await loadIms();
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
  // No probe/self-report fallback anymore — if the API call fails, the stale cached
  // list (or [] if there never was one) just stays until the next connect() retries.
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

  // GET /api/v1/episodes?limit=1 — episodes are returned most-recent-first (aep-ai's
  // list_episodes via get_recent_episodes), so the first entry is authoritative for
  // "what's the latest conversation this owner has, on any client". Best-effort:
  // network/shape failures return null rather than throwing.
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
      // fix: clear-persist — don't resurrect an episode the user explicitly cleared in this room.
      if (this._clearedEpisodeId && latestId === this._clearedEpisodeId) return;
      this._messages = await this._fetchEpisodeMessages(latestId);
      this._episodeId = latestId;
      this._persist();
      this._update();
      return;
    }

    if (String(this._episodeId) === latestId) {
      const hasPendingApproval = [...(this._toolCards?.values() ?? [])]
        .some((c) => c.state === TOOL_STATE.APPROVAL_REQUESTED);
      if (this._thinking
        || this._pendingQuestion || this._pendingPlanApproval || hasPendingApproval) {
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
    this._thinking = false;
    this._streamingText = undefined;
    this._update();
  }

  stop() {
    if (this._ready) this._ws?.send(JSON.stringify({ type: 'INTERRUPT' }));
    this._done();
  }

  async clear() {
    if (this._thinking) this.stop();
    /* --- fix: clear-persist (upstream candidate, not demo-only) ---
     * Remember the dismissed episode so a fresh controller on reload doesn't
     * silently resume it from the server via _reconcileWithLatestEpisode. */
    const clearedEpisodeId = this._episodeId ? String(this._episodeId) : undefined;
    this._clearedEpisodeId = clearedEpisodeId;
    /* --- end fix: clear-persist --- */
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
    resetSession(room, undefined, clearedEpisodeId); // fix: clear-persist
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
  // response arrives, so partial/staggered responses aren't supported — see
  // handle_permission_response in aep-ai).
  approveToolCall = (toolCallId, approved, always = false) => {
    const card = this._toolCards?.get(toolCallId);
    if (!card) return;

    const next = new Map(this._toolCards);
    next.set(toolCallId, { ...card, state: approved ? TOOL_STATE.APPROVED : TOOL_STATE.REJECTED });
    const decisions = { [toolCallId]: { approved } };

    if (always && approved) {
      for (const [id, c] of next) {
        const isSameToolPending = c.toolName === card.toolName
          && c.state === TOOL_STATE.APPROVAL_REQUESTED;
        if (id !== toolCallId && isSameToolPending) {
          next.set(id, { ...c, state: TOOL_STATE.APPROVED });
          decisions[id] = { approved: true };
        }
      }
    }

    this._toolCards = next;
    this._update();

    this._ws?.send(JSON.stringify({
      type: 'PERMISSION_RESPONSE',
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
      type: 'QUESTION_RESPONSE',
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
      type: 'QUESTION_RESPONSE',
      turn_id: turnId,
      answers: [],
      declined: true,
    }));
  };

  // Plan approval has no dedicated WS frame type of its own (unlike
  // PERMISSION_RESPONSE/QUESTION_RESPONSE) — the server dispatches by DataPart
  // "type" inside the generic RESUME op (build_resume_op in aep-ai), so this sends
  // a "plan-response" part wrapped in a RESUME frame instead.
  respondToPlanApproval = (decision, feedback = '') => {
    if (!this._pendingPlanApproval) return;
    const { turnId } = this._pendingPlanApproval;
    this._pendingPlanApproval = null;
    this._update();
    this._ws?.send(JSON.stringify({
      type: 'RESUME',
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

  // AO has no resolved channel for page context yet (see experience-workspace-extensions'
  // README, "Open dependency: page context") — so until that lands, prefix it onto the
  // wire text ourselves. Kept out of the UI-visible message; only the outgoing frame gets it.
  _contextPrefix() {
    const { org, site, path } = this._context ?? {};
    if (!org || !site) return '';
    return `[Current document — org: ${org}, site: ${site}, path: ${path || '/'}]\n`;
  }

  // Same gap as page context: AO's USER_INPUT has no structured field for "the block/
  // text the user picked in the canvas", so describe it inline in the wire text too.
  // selectionContext itself still gets attached to the stored message for the existing
  // pill UI (renderSelectionPills) — this only affects what the agent is told.
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
  // uploading straight to DA's own admin API — the same one da-live's own editor already
  // uses — and describing the resulting URL in the message text, for whenever AO's Files
  // API isn't reachable yet (CORS rollout in progress) or the upload otherwise fails.
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
  // (artifactId set) are passed via USER_INPUT.attachments instead, where the agent can
  // read them directly rather than needing a URL mentioned in prose.
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
    // in the background (browsers can't send WS pings to prevent this — see the
    // close handler's auto-reconnect). Reconnect before sending if that happened,
    // rather than throwing on a closed socket and losing the message.
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
      type: 'USER_INPUT',
      text: `${this._contextPrefix()}${this._describeSelectionContext(selectionContext)}`
        + `${this._describeAttachments(uploaded)}${message}`,
      manifestId: AO_MANIFEST_ID,
      // Required for manifestId to actually override auto-targeting — see
      // apply_control_plane_targeting in aep-ai: an explicit manifestId is only
      // honored when debugMode is also true, otherwise it's silently ignored.
      debugMode: true,
      ...(artifactIds.length && { attachments: artifactIds }),
    }));
  }
}
