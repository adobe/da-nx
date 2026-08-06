/* --- feature: figma->catalyst ----------------------------------------------
 * Routes a Figma-design turn from the EW canvas chat to a provisioned
 * Experience Catalyst deployment instead of CX Coworker / AO.
 *
 * Catalyst's Claude Code (llm-service) is the brain for these turns; it runs
 * the excat EDS-migration skills (figma-migration -> block-inventory ->
 * page-decomposition -> snowflake overlay) and can open a GitHub PR / write to
 * DA via its workspace-service.
 *
 * Wire contract mirrored 1:1 from Catalyst's own frontend
 * (aem-experience-catalyst/frontend/src/services/chatService.ts):
 *   POST /api/chat         { message, context, mode }
 *        -> body stream of `data: {content}` lines, terminated by `data: [DONE]`
 *   POST /api/chat/answer  { answers }   -> answer an AskUserQuestion prompt
 *   GET  /chat/history     -> { history, isProcessing, todos, pendingQuestion }
 *   GET  /api/events (SSE) / /workspace/events (SSE) -> agent/tool/file activity
 *        (optional, not wired here yet)
 *
 * Auth: Catalyst's own frontend patches fetch to inject the IMS bearer. We are
 * cross-origin, so we send `Authorization: Bearer <IMS token>` explicitly. The
 * IMS email must be provisioned in the Catalyst deployment's customer map, and
 * the deployment must allow this origin via CORS (ops-side, pending).
 *
 * DISABLE: set FIGMA_TO_CATALYST to false (single switch) to remove the route
 * and send every turn to the default controller.
 * ------------------------------------------------------------------------- */

import { loadIms } from '../../../utils/ims.js';
import { ROLE } from '../constants.js';

// Master toggle for the whole feature.
export const FIGMA_TO_CATALYST = true;

// Provisioned Catalyst deployment (the CORS-enabled one). Overridable at
// runtime with ?catalyst=<host>.
const DEFAULT_CATALYST_HOST = 'https://excat-stage.adobe.io';

function catalystHost() {
  const override = new URLSearchParams(window.location.search).get('catalyst');
  return (override || DEFAULT_CATALYST_HOST).replace(/\/$/, '');
}

/**
 * True when the turn is a Figma design job: a figma.com link in the text, or an
 * attached .fig / figma file. Everything else stays on the default controller.
 */
export function isFigmaInput(text, items = []) {
  if (typeof text === 'string' && /\bfigma\.com\//i.test(text)) return true;
  return (items || []).some((it) => {
    const name = (it?.fileName || it?.name || '').toLowerCase();
    const url = (it?.url || it?.contentUrl || '').toLowerCase();
    return name.endsWith('.fig') || /figma\.com\//i.test(url);
  });
}

async function imsToken() {
  const { accessToken } = await loadIms();
  return accessToken?.token;
}

/**
 * POST /api/chat and stream the assistant text back via onChunk. Mirrors
 * chatService.sendChatMessage's SSE-over-fetch-body parsing exactly.
 */
async function streamChat({
  host, token, message, context, mode = 'execute', onChunk, signal,
}) {
  const resp = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, context, mode }),
    signal,
  });
  if (!resp.ok) throw new Error(`Catalyst /api/chat failed: ${resp.status}`);

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('Catalyst /api/chat: no response body');
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // keep the last partial line
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) onChunk(parsed.content);
          } catch {
            // ignore keep-alive / non-JSON frames
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

async function getHistory(host, token) {
  const resp = await fetch(`${host}/api/chat/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) throw new Error(`Catalyst /api/chat/history ${resp.status}`);
  return resp.json();
}

async function postAnswer(host, token, answers) {
  await fetch(`${host}/api/chat/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ answers }),
  });
}

/** POST /api/chat/answer - answer a Catalyst AskUserQuestion prompt. */
export async function submitCatalystAnswer(answers) {
  await postAnswer(catalystHost(), await imsToken(), answers);
}

// Poll chat history while a turn runs; surface any AskUserQuestion to the UI so
// an interactive skill (e.g. map-vs-snowflake) doesn't hang. Returns a stop().
function startQuestionPolling(host, token, component) {
  let active = true;
  const seen = new Set();
  (async () => {
    while (active) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(2000);
      if (!active) break;
      let hist = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        hist = await getHistory(host, token);
      } catch {
        hist = null;
      }
      const pq = hist && hist.pendingQuestion;
      const key = pq && (pq.toolUseId || (pq.questions || []).map((q) => q.id).join(','));
      if (pq && key && !seen.has(key)) {
        seen.add(key);
        // eslint-disable-next-line no-underscore-dangle
        component._showCatalystQuestion(pq, (answers) => postAnswer(host, token, answers));
      }
    }
  })();
  return () => { active = false; };
}

/* --- feature: figma->catalyst (result preview) ---
 * Best-effort: pull result links out of Catalyst's streamed text so EW can
 * offer a preview + PR link. Refine the patterns once we watch a real run. */
const RE_DA_EDIT = /da\.live\/edit#(\/[^\s)]+)/i;
const RE_DA_PATH = /(?:^|\s)(\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9/_-]+)/i;
const RE_PR = /(https?:\/\/github\.com\/\S+\/pull\/\d+)/i;
const RE_PREVIEW = /(https?:\/\/[\w-]+--[\w-]+--[\w-]+\.aem\.(?:page|live)\/\S*)/i;

function firstMatch(text, re) {
  const m = text.match(re);
  return m ? m[1] : null;
}

function extractResultLinks(text) {
  return {
    daPath: firstMatch(text, RE_DA_EDIT) || firstMatch(text, RE_DA_PATH),
    prUrl: firstMatch(text, RE_PR),
    previewUrl: firstMatch(text, RE_PREVIEW),
  };
}

// On completion, auto-open the new page in the canvas (no manual step) by
// navigating to its DA path, and note the path + PR/branch-preview links.
function announceAndOpen(component, { daPath, prUrl, previewUrl }) {
  const extras = [];
  if (previewUrl) extras.push(`[branch preview](${previewUrl})`);
  if (prUrl) extras.push(`[PR](${prUrl})`);
  const suffix = extras.length ? ` · ${extras.join(' · ')}` : '';
  const push = (content) => {
    component.messages = [...component.messages, { role: ROLE.ASSISTANT, content }];
    component.requestUpdate();
  };
  if (daPath) {
    push(`**Opening the new page in the canvas:** \`${daPath}\`${suffix}`);
    // Auto-preview: point the canvas at the new DA path. hashChange swaps the
    // previewed doc in place, keeping the chat panel.
    window.location.hash = daPath;
  } else if (extras.length) {
    push(`**Result:**${suffix}`);
  }
}
/* --- end feature --- */

/**
 * Run one Figma turn against Catalyst, rendering into the existing chat UI.
 * `component` is the <nx-chat> LitElement (uses its reactive messages/thinking).
 *
 * Note: this streams the assistant text (POST /api/chat). Rich tool/todo
 * activity (GET /api/events) and interactive AskUserQuestion prompts are TODO -
 * wire once CORS is live and we can watch a real run. See module header.
 */
export async function runFigmaTurn({ component, message, context = [] }) {
  const host = catalystHost();
  const assistant = { role: ROLE.ASSISTANT, content: '', streaming: true };
  component.messages = [
    ...(component.messages ?? []),
    { role: ROLE.USER, content: message },
    assistant,
  ];
  component.thinking = true;
  component.requestUpdate();

  let token = null;
  try {
    token = await imsToken();
  } catch {
    token = null;
  }
  if (!token) {
    assistant.content = '_Catalyst error: no IMS token_';
    assistant.streaming = false;
    component.thinking = false;
    component.requestUpdate();
    return;
  }

  // Poll for interactive questions in parallel — the /api/chat stream won't
  // resolve while the skill is waiting on an answer.
  const stopPolling = startQuestionPolling(host, token, component);
  const controller = new AbortController();
  // Let the chat's Stop button cancel THIS turn (not the AO controller, which
  // would send an INTERRUPT to a non-existent AO session).
  /* eslint-disable no-underscore-dangle */
  component._catalystActive = true;
  component._catalystStop = () => {
    controller.abort();
    stopPolling();
  };
  /* eslint-enable no-underscore-dangle */
  try {
    await streamChat({
      host,
      token,
      message,
      context,
      signal: controller.signal,
      onChunk: (chunk) => {
        assistant.content += chunk;
        component.requestUpdate();
      },
    });
    /* --- feature: figma->catalyst (auto-preview) --- */
    announceAndOpen(component, extractResultLinks(assistant.content));
    /* --- end feature --- */
  } catch (err) {
    if (err.name !== 'AbortError') {
      assistant.content += `\n\n_Catalyst error: ${err.message}_`;
    }
  } finally {
    stopPolling();
    // eslint-disable-next-line no-underscore-dangle
    component._catalystActive = false;
    assistant.streaming = false;
    component.thinking = false;
    component.requestUpdate();
  }
}
/* --- end feature: figma->catalyst ---------------------------------------- */
