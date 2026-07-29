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
};

// Manifest carrying the da-content skills (browse/create/update/delete/organize/
// versions/media/fragment-lookup/publish/site-config) — not targeted to any segment,
// so it must be selected explicitly per turn rather than relying on auto-selection.
const AO_MANIFEST_ID = 'experience-workspace';

// da-agent's own skills are per-site, dynamically loaded from a .da/skills config sheet
// (see loadSiteConfig) — AO has no equivalent per-site mechanism. This manifest's skills
// are static, baked into the da-content plugin (Adobe-AEM-Sites/experience-workspace-extensions),
// the same set for every site. Fetching them from AO's own API would hit the same
// CORS/entitlement wall the A2A transport did, so this is just the plugin's fixed list.
export const AO_SKILLS = [
  'da-content-browse',
  'da-content-create',
  'da-content-update',
  'da-content-delete',
  'da-content-organize',
  'da-content-versions',
  'da-content-media',
  'da-fragment-lookup',
  'da-content-publish',
  'da-site-config',
];

// ims.js's own `tenantId` is prodCtx.tenant_id (a human-readable label like "sitesinternal"),
// not the IMS Org ID AO's x-tenant-id expects (the "ORGID@AdobeOrg" shape). Pull that from
// owningEntity instead — it's the same value on every projectedProductContext entry.
function getOrgId(projectedProductContext) {
  return projectedProductContext?.find((p) => p.prodCtx?.owningEntity)?.prodCtx.owningEntity;
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

// There's no API for listing AO's skills that isn't behind the same CORS/entitlement
// wall as the rest of REST (see conversation history) — so this asks the agent to
// self-report, once per episode, and caches the answer as an override for AO_SKILLS.
// Inherently best-effort: it's an LLM describing itself in prose, not a real catalog
// lookup, so the parsed result is validated before ever replacing the static fallback.
const SKILLS_CACHE_PREFIX = 'da-chat-ao-skills--';
const SKILLS_PROBE_PROMPT = 'List every skill you currently have access to for this '
  + 'session for document authoring. Reply with ONLY a comma-separated list of their exact identifiers (e.g. '
  + 'da-content-create, da-content-update) and nothing else — no explanation, no numbering, '
  + 'no punctuation besides the commas.';

function loadCachedSkills(room) {
  try {
    const raw = localStorage.getItem(`${SKILLS_CACHE_PREFIX}${room}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.episodeId || !Array.isArray(parsed?.skills) || !parsed.skills.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveCachedSkills(room, episodeId, skills) {
  try {
    localStorage.setItem(`${SKILLS_CACHE_PREFIX}${room}`, JSON.stringify({ episodeId, skills }));
  } catch {
    // best-effort — localStorage can throw (quota, private mode); safe to ignore
  }
}

// Strips list markers/trailing punctuation and keeps only identifier-shaped tokens,
// so stray prose the model adds despite the prompt doesn't corrupt the cached list.
function parseSkillsResponse(text) {
  if (!text) return null;
  const ids = text
    .split(/[,\n]/)
    .map((s) => s.trim().replace(/^[-*\d.\s]+/, '').replace(/[.:]+$/, ''))
    .filter(Boolean)
    .filter((s) => /^[a-z0-9][a-z0-9_-]{1,60}$/i.test(s));
  return ids.length ? ids : null;
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
    const { messages, sessionId: episodeId } = await loadMessages(room);
    if (messages.length) this._messages = messages;
    this._episodeId = episodeId ?? undefined;
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
      probingSkills: this._probingSkills,
    });
  }

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

  // ui_artifact_created: AO's "a2ui" surface for rich, structured content (tables, etc.)
  // alongside plain text. Stored as its own message so renderers.js can render known
  // component types (starting with DataTable) and fall back to the artifact's own
  // text_fallback for anything we don't handle yet, rather than silently dropping it.
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

    if (evt.type === 'ui_artifact_created') {
      this._handleUiArtifactCreated(evt);
      return;
    }

    if (evt.type === 'turn_completed' || evt.type === 'turn_aborted') {
      this._done();
      return;
    }

    if (evt.type === 'turn_suspended') {
      // Fires after permission_request/user_question to formally mark the suspension.
      // If either already put up a popup, the *only* valid response channel is that
      // popup (PERMISSION_RESPONSE/QUESTION_RESPONSE) — re-enabling the plain chat
      // input here would let the user answer in two conflicting ways at once, and a
      // plain USER_INPUT sent while suspended just becomes a stray "injection" the
      // server drops. Only fall back to _done() if nothing is actually pending.
      const hasPendingApproval = [...(this._toolCards?.values() ?? [])]
        .some((c) => c.state === TOOL_STATE.APPROVAL_REQUESTED);
      if (!this._pendingQuestion && !hasPendingApproval) this._done();
      return;
    }

    if (evt.type === 'ERROR') {
      this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: `Error: ${evt.message}` }];
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

  // Current best-known skill list: the once-per-episode probed/cached answer if we
  // have one for this episode, else the static plugin-default fallback.
  getSkills() {
    return this._cachedSkills ?? AO_SKILLS;
  }

  // Reuses the cached list if it's still tied to the current episode; otherwise fires
  // the background probe. Never blocks connect() — runs fire-and-forget.
  async _syncSkillsCache() {
    const room = await this._getRoom();
    const cached = loadCachedSkills(room);
    if (cached && cached.episodeId === this._episodeId) {
      this._cachedSkills = cached.skills;
      return;
    }
    this._probeSkills(room);
  }

  // Asks the agent to self-report its skills on its own disposable connection/episode —
  // deliberately NOT the user's real one, so it (a) never blocks real messaging, since
  // AO allows only one turn at a time per connection, and (b) never becomes part of the
  // real episode's server-side history. probingSkills is UI-only (welcome-screen loader);
  // nothing here touches _thinking or the main _ws at all. Best-effort throughout: an
  // invalid/unparseable answer, timeout, or error just leaves the existing fallback
  // (cached or static) in place rather than corrupting the cache.
  async _probeSkills(room) {
    if (this._skillsProbeInFlight) return;
    this._skillsProbeInFlight = true;
    this._probingSkills = true;
    this._update();

    const text = await this._runSkillsProbeConnection();

    this._probingSkills = false;
    this._skillsProbeInFlight = false;
    this._update();

    const skills = parseSkillsResponse(text);
    if (skills) {
      this._cachedSkills = skills;
      saveCachedSkills(room, this._episodeId, skills);
    }
  }

  async _runSkillsProbeConnection() {
    const {
      accessToken, userId, tenantId, email, name, projectedProductContext,
    } = await loadIms();
    const orgId = getOrgId(projectedProductContext);
    const base = AO_WS_BASE[env] ?? AO_WS_BASE.stage;

    return new Promise((resolve) => {
      const ws = new WebSocket(`${base}/ws/sessions/new`);
      let text = '';
      let settled = false;
      let timeout;

      function finish(result) {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        try {
          ws.close();
        } catch {
          // already closing/closed — nothing to do
        }
        resolve(result);
      }

      // Generous but bounded — this is a background nicety, not something worth
      // hanging around for if AO never responds.
      timeout = setTimeout(() => finish(null), 15000);

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
        // Safe to send immediately after AUTH without waiting for an ack — the real
        // server (ws_handler.py) reads AUTH then the next message strictly in order
        // regardless of how quickly both arrive; WS delivery is ordered.
        ws.send(JSON.stringify({
          type: 'USER_INPUT',
          text: SKILLS_PROBE_PROMPT,
          manifestId: AO_MANIFEST_ID,
          debugMode: true,
        }));
      });

      ws.addEventListener('message', (event) => {
        const data = this._parse(event.data);
        if (!data) return;

        if (data.type === 'ERROR') {
          finish(null);
          return;
        }
        if (data.type === 'text_delta') {
          text += data.data?.content ?? '';
          return;
        }
        if (data.type === 'text_done') {
          text = data.data?.content ?? text;
          return;
        }
        if (data.type === 'turn_completed' || data.type === 'turn_aborted') {
          finish(text);
          return;
        }
        if (data.type === 'permission_request' || data.type === 'user_question') finish(null);
      });

      ws.addEventListener('close', () => finish(null));
      ws.addEventListener('error', () => finish(null));
    });
  }

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
    this._toolCards = new Map();
    // Old episode is gone — its cached skills answer doesn't apply to the fresh one
    // connect() is about to open; _syncSkillsCache() will re-probe once it has a
    // real episode id again.
    this._cachedSkills = null;
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

  // AO's USER_INPUT.attachments only accepts artifact ids from its own Files API
  // (raw bytes aren't a wire option — confirmed from UserInputOp: `attachments: list[str]`)
  // and that HTTP endpoint sits behind the same CORS/entitlement wall the A2A transport
  // hit. Upload straight to DA's own admin API instead — the same one da-live's own
  // editor already uses — and just tell the agent the resulting URL in the message text.
  async _uploadAttachment(attachment) {
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

  _describeAttachments(uploaded) {
    if (!uploaded.length) return '';
    const lines = uploaded.map((a) => (a.contentUrl
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

    this._ws.send(JSON.stringify({
      type: 'USER_INPUT',
      text: `${this._contextPrefix()}${this._describeSelectionContext(selectionContext)}`
        + `${this._describeAttachments(uploaded)}${message}`,
      manifestId: AO_MANIFEST_ID,
      // Required for manifestId to actually override auto-targeting — see
      // apply_control_plane_targeting in aep-ai: an explicit manifestId is only
      // honored when debugMode is also true, otherwise it's silently ignored.
      debugMode: true,
    }));
  }
}
