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

// Provisioned Catalyst deployment. Overridable at runtime with ?catalyst=<host>.
const DEFAULT_CATALYST_HOST = 'https://excat-experimental4.adobe.io';

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

/** POST /api/chat/answer - answer a Catalyst AskUserQuestion prompt. */
export async function submitCatalystAnswer(answers) {
  const host = catalystHost();
  const token = await imsToken();
  await fetch(`${host}/api/chat/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ answers }),
  });
}

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

  try {
    const token = await imsToken();
    if (!token) throw new Error('No IMS token for Catalyst');
    await streamChat({
      host,
      token,
      message,
      context,
      onChunk: (chunk) => {
        assistant.content += chunk;
        component.requestUpdate();
      },
    });
  } catch (err) {
    assistant.content += `\n\n_Catalyst error: ${err.message}_`;
  } finally {
    assistant.streaming = false;
    component.thinking = false;
    component.requestUpdate();
  }
}
/* --- end feature: figma->catalyst ---------------------------------------- */
