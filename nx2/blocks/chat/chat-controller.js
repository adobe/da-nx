import { loadIms } from '../../utils/ims.js';
import { AGENT_EVENT, ROLE, TOOL_STATE } from './constants.js';
import { readStream } from './utils.js';
import { loadMessages, saveMessages, clearMessages } from './persistence.js';
// ==== THIS IS PART OF SKILLS EDITOR V1 ====
import { loadMcpServerConfig } from './api.js';

// ─── skill suggestion block parser ───────────────────────────────────────────
const SUGGESTION_OPEN = '[SKILL_SUGGESTION]';
const SKILL_ID_RE = /^SKILL_ID:\s*(.+)$/m;
const CONTENT_START = '---SKILL_CONTENT_START---';
const CONTENT_END = '---SKILL_CONTENT_END---';
const SUGGEST_KEY = 'da-skills-editor-suggestion';
const LEGACY_SUGGEST_KEY = 'da-skills-lab-suggest-handoff';
const SUGGEST_EVENT = 'da-skills-editor-suggestion-handoff';
const LEGACY_SUGGEST_EVENT = 'da-skills-lab-suggestion-handoff';

/**
 * If `text` contains a [SKILL_SUGGESTION] block, extracts it, fires the
 * handoff events so the skills editor can open the form, and returns the
 * stripped visible text. Returns `null` when no block is present.
 *
 * @param {string} text
 * @returns {{ visible: string, id: string, body: string } | null}
 */
export function extractSkillSuggestion(text) {
  const blockStart = text.indexOf(SUGGESTION_OPEN);
  if (blockStart === -1) return null;

  const block = text.slice(blockStart);
  const idMatch = block.match(SKILL_ID_RE);
  const id = idMatch ? idMatch[1].trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') : '';

  const csIdx = block.indexOf(CONTENT_START);
  const ceIdx = block.indexOf(CONTENT_END);
  const body = csIdx !== -1 && ceIdx > csIdx
    ? block.slice(csIdx + CONTENT_START.length, ceIdx).trim()
    : '';

  // Everything before the block is the human-readable intro (may be empty).
  const prose = text.slice(0, blockStart).trim();

  // Persist for skills-editor to pick up (same shape as setSuggestionHandoff).
  try {
    const serialized = JSON.stringify({ prose, id, body });
    sessionStorage.setItem(SUGGEST_KEY, serialized);
    sessionStorage.setItem(LEGACY_SUGGEST_KEY, serialized);
  } catch { /* noop */ }

  // Notify any in-page skills editor instance.
  const detail = { prose, id, body };
  window.dispatchEvent(new CustomEvent(SUGGEST_EVENT, { detail, bubbles: true }));
  window.dispatchEvent(new CustomEvent(LEGACY_SUGGEST_EVENT, { detail, bubbles: true }));

  return { visible: prose, id, body };
}

// ==== END SKILLS EDITOR V1 ====

// ==== THIS IS PART OF SKILLS EDITOR V1 ====
// ?ref=local routes to a local da-agent dev server (port 4002).

const AGENT_URL = new URLSearchParams(window.location.search).get('ref') === 'local'
  ? 'http://localhost:4002/chat'
  : 'https://da-agent.adobeaem.workers.dev/chat';

export default class ChatController {
  constructor({ onUpdate, onToolDone }) {
    this._onUpdate = onUpdate;
    this._onToolDone = onToolDone;
  }

  setContext(context) {
    this._context = context;
    this._room = null;
  }

  // ==== THIS IS PART OF SKILLS EDITOR V1 ====
  async _getMcpConfig() {
    const { org, site } = this._context ?? {};
    if (!org || !site) return { servers: {}, serverHeaders: {} };
    return loadMcpServerConfig(org, site);
  }
  // ==== END SKILLS EDITOR V1 ====

  _pageContextForAgent() {
    const { org, site, path, view } = this._context ?? {};
    // ==== THIS IS PART OF SKILLS EDITOR V1 ====
    return org && site ? { org, site, path: path ?? '', view } : undefined;
  }

  async _getRoom() {
    if (this._room) return this._room;
    const { userId } = await loadIms();
    const { org, site } = this._context ?? {};
    this._room = org && site && userId ? `${org}--${site}--${userId}` : 'default';
    return this._room;
  }

  async loadInitialMessages() {
    this._messages = [];
    const room = await this._getRoom();
    const cached = await loadMessages(room);
    if (!cached.length) return;
    // Strip orphaned tool-calls (assistant array-content without a tool-approval-request).
    // These are from sessions before the current fix — they have no matching tool-result
    // and cause "Tool result is missing". Complete approval sequences are kept so users
    // see what the agent approved and did in prior conversations.
    this._messages = cached.filter(
      (msg) => !(msg.role === ROLE.ASSISTANT && Array.isArray(msg.content)
        && !msg.virtual
        && !msg.content.some((p) => p.type === AGENT_EVENT.TOOL_APPROVAL_REQUEST)),
    );
    // Reconstruct tool cards from persisted approval messages so they render on reload.
    this._toolCards = new Map();
    for (const msg of this._messages) {
      if (msg.role === ROLE.ASSISTANT && Array.isArray(msg.content)) {
        const call = msg.content.find((p) => p.type === AGENT_EVENT.TOOL_CALL);
        if (call) {
          this._toolCards.set(call.toolCallId, {
            toolName: call.toolName, input: call.input, state: TOOL_STATE.DONE,
          });
        }
      }
    }
    this._update();
  }

  _update() {
    this._onUpdate({
      messages: this._messages,
      thinking: this._thinking,
      streamingText: this._streamingText,
      connected: this._connected,
      toolCards: this._toolCards,
    });
  }

  async connect(attempt = 0) {
    try {
      await fetch(AGENT_URL, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
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
    this._abortController = null;
    this._thinking = false;
    this._streamingText = undefined;
    this._update();
  }

  stop() {
    this._abortController?.abort();
    this._done();
  }

  async clear() {
    if (this._thinking) this.stop();
    this._messages = undefined;
    this._streamingText = undefined;
    this._toolCards = new Map();
    this._autoApprovedTools = new Set();
    this._update();
    const room = await this._getRoom();
    clearMessages(room);
  }

  destroy() {
    clearTimeout(this._retryTimeout);
    this.stop();
  }

  _onToolEvent = ({
    type, toolCallId, toolName, input, output, isError, approvalId,
  }) => {
    const next = new Map(this._toolCards ?? []);

    if (type === AGENT_EVENT.TOOL_CALL) {
      if (next.has(toolCallId)) return; // duplicate — ignore
      next.set(toolCallId, { toolName, input, state: TOOL_STATE.RUNNING });
    } else if (type === AGENT_EVENT.TOOL_APPROVAL_REQUEST) {
      const autoApprove = this._autoApprovedTools?.has(toolName);
      // Promote to _messages now that we know approval is needed.
      // Both parts go in one message — resolveApprovals() matches tool-approval-request
      // to tool-call by toolCallId within the same assistant message.
      const prior = next.get(toolCallId) ?? { toolName, input: {} };
      this._messages = [
        ...this._messages,
        {
          role: ROLE.ASSISTANT,
          content: [
            {
              type: AGENT_EVENT.TOOL_CALL,
              toolCallId,
              toolName: prior.toolName,
              input: prior.input,
            },
            { type: AGENT_EVENT.TOOL_APPROVAL_REQUEST, approvalId, toolCallId },
          ],
        },
      ];
      const state = autoApprove ? TOOL_STATE.APPROVED : TOOL_STATE.APPROVAL_REQUESTED;
      next.set(toolCallId, { ...prior, state, approvalId });
      this._toolCards = next;
      this._update();
      if (autoApprove) queueMicrotask(() => this.approveToolCall(toolCallId, true));
      return;
    } else {
      const prior = next.get(toolCallId) ?? { toolName, input: {} };
      const state = isError ? TOOL_STATE.ERROR : TOOL_STATE.DONE;
      next.set(toolCallId, { ...prior, state, output });
      if (state === TOOL_STATE.DONE) {
        // Add a virtual message so the tool renders in the conversation at the right
        // position and persists across refreshes, without being sent back to the agent.
        this._messages = [
          ...this._messages,
          {
            role: ROLE.ASSISTANT,
            virtual: true,
            content: [{ type: AGENT_EVENT.TOOL_CALL, toolCallId, toolName: prior.toolName }],
          },
        ];
        if (prior.toolName === 'da_create_skill') {
          window.dispatchEvent(new CustomEvent('da-skills-changed', { bubbles: true }));
        }
        this._onToolDone?.();
      }
    }

    this._toolCards = next;
    this._update();
  };

  approveToolCall = async (toolCallId, approved, always = false) => {
    const card = this._toolCards.get(toolCallId);
    if (!card?.approvalId) return;

    if (always) {
      this._autoApprovedTools ??= new Set();
      this._autoApprovedTools.add(card.toolName);
    }

    const next = new Map(this._toolCards ?? []);
    next.set(toolCallId, { ...card, state: approved ? TOOL_STATE.APPROVED : TOOL_STATE.REJECTED });
    this._toolCards = next;

    this._messages = [
      ...this._messages,
      {
        role: ROLE.TOOL,
        content: [{
          type: AGENT_EVENT.TOOL_APPROVAL_RESPONSE, approvalId: card.approvalId, approved,
        }],
      },
    ];
    this._thinking = approved;
    this._update();

    if (approved) {
      try {
        await this._stream(this._pageContextForAgent());
      } catch (err) {
        if (err.name !== 'AbortError') {
          this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: `Error: ${err.message}` }];
        }
      } finally {
        this._done();
      }
    } else {
      this._done();
    }
  };

  async _stream(pageContext) {
    // ==== THIS IS PART OF SKILLS EDITOR V1 ====
    const [{ accessToken }, room, mcpConfig] = await Promise.all([
      loadIms(),
      this._getRoom(),
      this._getMcpConfig(),
    ]);
    // ==== END SKILLS EDITOR V1 ====
    this._abortController = new AbortController();

    const resp = await fetch(AGENT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: this._messages.filter((msg) => !msg.virtual),
        pageContext,
        context: this._pendingContext ?? [],
        imsToken: accessToken?.token ?? null,
        room,
        // ==== THIS IS PART OF SKILLS EDITOR V1 ====
        mcpServers: mcpConfig?.servers ?? {},
        mcpServerHeaders: mcpConfig?.serverHeaders ?? {},
        // ==== END SKILLS EDITOR V1 ====
      }),
      signal: this._abortController.signal,
    });

    this._pendingContext = [];

    if (!resp.ok) {
      throw new Error(`Agent responded with ${resp.status}: ${await resp.text()}`);
    }

    await readStream(resp.body, {
      // ==== THIS IS PART OF SKILLS EDITOR V1 ====
      onDelta: (next) => {
        // Hide the raw [SKILL_SUGGESTION] block from the streaming preview.
        const blockStart = next.indexOf(SUGGESTION_OPEN);
        this._streamingText = blockStart !== -1 ? next.slice(0, blockStart) : next;
        this._update();
      },
      // ==== END SKILLS EDITOR V1 ====
      onText: (text) => {
        // ==== THIS IS PART OF SKILLS EDITOR V1 ====
        const suggestion = extractSkillSuggestion(text);
        const visible = suggestion ? suggestion.visible : text;
        this._messages = [...this._messages, { role: ROLE.ASSISTANT, content: visible }];
        // ==== END SKILLS EDITOR V1 ====
        this._streamingText = '';
        this._update();
        saveMessages(room, this._messages);
      },
      onTool: this._onToolEvent,
    });
  }

  async sendMessage(message, context = []) {
    if (this._thinking || !this._connected) return;

    this._pendingContext = context;
    this._messages = [...(this._messages ?? []), { role: ROLE.USER, content: message }];
    this._thinking = true;
    this._update();

    this._toolCards = new Map();

    try {
      await this._stream(this._pageContextForAgent());
    } catch (err) {
      if (err.name !== 'AbortError') {
        this._messages = [
          ...this._messages,
          { role: ROLE.ASSISTANT, content: `Error: ${err.message}` },
        ];
      }
    } finally {
      this._done();
    }
  }
}
