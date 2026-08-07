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

// The AO controller owns the message store. Route Catalyst messages through it
// so the EMA conversation renders, persists, and isn't overwritten by a later
// controller update. Falls back to component.messages if no such controller.
function addMsg(component, msg) {
  // eslint-disable-next-line no-underscore-dangle
  const c = component._controller;
  if (c && typeof c.appendMessage === 'function') {
    c.appendMessage(msg);
    return;
  }
  component.messages = [...(component.messages ?? []), msg];
  component.requestUpdate();
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
    // Bound the wait so an unreachable backend fails fast (~10s) instead of
    // hanging out a full TCP timeout.
    signal: AbortSignal.timeout(10000),
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
function startQuestionPolling(host, token, component, onSettled, flags) {
  let active = true;
  const seen = new Set();
  let everBusy = false;
  let everAsked = false;
  let idle = 0;
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
      if (pq) {
        if (key && !seen.has(key)) {
          seen.add(key);
          everAsked = true;
          // eslint-disable-next-line no-underscore-dangle
          component._showCatalystQuestion(pq, (answers) => postAnswer(host, token, answers));
        }
        idle = 0; // a question on screen is not idle
      } else if (hist && hist.isProcessing) {
        everBusy = true;
        idle = 0;
      } else {
        idle += 1;
      }
      // eslint-disable-next-line no-underscore-dangle
      component._setCatalystProgress(hist);
      // Finalize a turn whose /api/chat stream Catalyst left open after going
      // idle (e.g. an enable-only turn), so the UI doesn't spin forever.
      if ((everBusy || everAsked || (flags && flags.dropped)) && idle >= 2) {
        active = false;
        onSettled();
      }
    }
  })();
  return () => { active = false; };
}

// Live activity via the /api/events SSE (fetch-based so we can send the Bearer).
// Best-effort + fully isolated: any event carrying todos updates the determinate
// progress; any event carrying a text label updates the step line. A shape
// mismatch or stream error never affects the turn.
// A raw tool identifier (e.g. "api_request", "read_file") sometimes arrives as the
// event status — never show that to the user; fall back to a generic phrase.
function looksLikeToolId(s) {
  return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(s);
}

function humanizeActivity(s) {
  return looksLikeToolId(s) ? 'Working on your page…' : s;
}

function applyCatalystEvent(component, chunk) {
  let data = '';
  chunk.split('\n').forEach((line) => {
    if (line.startsWith('data:')) data += line.slice(5).trim();
  });
  if (!data || data === '[DONE]') return;
  let p = null;
  try {
    p = JSON.parse(data);
  } catch {
    return;
  }
  const d = (p && p.data) || p || {};
  const todos = d.todos || (Array.isArray(d) ? d : null);
  // eslint-disable-next-line no-underscore-dangle
  if (todos) component._setCatalystTodos(todos);
  const label = d.activeForm || d.content || d.text || d.message || d.status;
  if (typeof label === 'string' && label.trim()) {
    // eslint-disable-next-line no-underscore-dangle
    component._setCatalystActivity(humanizeActivity(label.trim()).slice(0, 140));
  }
}

function startEventStream(host, token, component) {
  const ctrl = new AbortController();
  (async () => {
    let resp = null;
    try {
      resp = await fetch(`${host}/api/events`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
        signal: ctrl.signal,
      });
    } catch {
      return;
    }
    if (!resp || !resp.ok || !resp.body) return;
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() ?? '';
        chunks.forEach((chunk) => applyCatalystEvent(component, chunk));
      }
    } catch {
      // aborted or stream closed
    }
  })();
  return () => ctrl.abort();
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

// The user names the target DA path in their message (e.g. "...in path /test-ema-figma").
// Pull the first standalone slash-path (URLs don't match: their path isn't space-led).
function extractTargetPath(message) {
  const m = (message || '').match(/(?:^|\s)(\/[a-z0-9][a-z0-9/_-]*)/i);
  return m ? m[1].replace(/\/+$/, '') : null;
}

// Auto-open should land on the page the user asked for, not whatever link EMA
// happened to echo (it often points at /index or the site root). If we know the
// target leaf, graft it onto the org/repo we can see (from an edit link or the
// current canvas hash) so we navigate to the real new page.
function preferTargetPath(extractedDaPath, targetPath) {
  if (!targetPath) return extractedDaPath;
  const leaf = targetPath.replace(/^\/+/, '');
  const base = (() => {
    const parts = (extractedDaPath || '').split('/').filter(Boolean);
    if (parts.length >= 2) return `/${parts[0]}/${parts[1]}`;
    const hash = (window.location.hash || '').replace(/^#/, '').split('/').filter(Boolean);
    if (hash.length >= 2) return `/${hash[0]}/${hash[1]}`;
    return '';
  })();
  return base ? `${base}/${leaf}` : targetPath;
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
function announceAndOpen(component, {
  daPath: rawDaPath, prUrl, previewUrl, targetPath,
}) {
  const daPath = preferTargetPath(rawDaPath, targetPath);
  const extras = [];
  if (previewUrl) extras.push(`[branch preview](${previewUrl})`);
  if (prUrl) extras.push(`[PR](${prUrl})`);
  const suffix = extras.length ? ` · ${extras.join(' · ')}` : '';
  const push = (content) => {
    addMsg(component, { role: ROLE.ASSISTANT, content });
  };
  // Notify the inbox so a user who stepped away sees a badge and can come back.
  /* eslint-disable no-underscore-dangle */
  const notify = (title, body, path) => {
    if (typeof component._pushNotification === 'function') {
      component._pushNotification({ title, body, daPath: path });
    }
  };
  /* eslint-enable no-underscore-dangle */
  if (daPath) {
    push(`**Opening the new page in the canvas:** \`${daPath}\`${suffix}`);
    notify('Your page is ready', `Open ${daPath}`, daPath);
    // Auto-preview: point the canvas at the new DA path. hashChange swaps the
    // previewed doc in place, keeping the chat panel.
    window.location.hash = daPath;
  } else if (extras.length) {
    push(`**Result:**${suffix}`);
    notify('Migration finished', 'Result links are in the chat.', '');
  }
}
/* --- end feature --- */

// Run marker (localStorage): lets reopening the canvas re-attach to a run that
// was in flight, so the user can leave and come back. Keyed by the chat room.
const RUN_MARKER = 'nx-catalyst-run';
function roomKey() {
  return window.location.hash || '';
}
function setRunMarker(message) {
  try {
    localStorage.setItem(
      RUN_MARKER,
      JSON.stringify({ room: roomKey(), message, at: Date.now() }),
    );
  } catch {
    // storage unavailable — resume-on-return just won't fire
  }
}
function clearRunMarker() {
  try {
    localStorage.removeItem(RUN_MARKER);
  } catch {
    // ignore
  }
}
function readRunMarker() {
  try {
    return JSON.parse(localStorage.getItem(RUN_MARKER) || 'null');
  } catch {
    return null;
  }
}

/**
 * Run one Figma turn against Catalyst. Streams the reply for users who stay,
 * shows a progress bar + "you can leave" note, and does NOT block the chat.
 */
export async function runFigmaTurn({ component, message, context = [] }) {
  const host = catalystHost();
  const targetPath = extractTargetPath(message);
  // Narration streams into the migration panel's log, not the main thread, so it
  // never mixes with the (AO) chat. `streamed` keeps a local copy for finalize.
  let streamed = '';
  // Keep the user's request in the main thread so there's context; narration goes
  // to the panel. The final result is pushed to the thread by announceAndOpen.
  addMsg(component, { role: ROLE.USER, content: message });
  // Note: intentionally NOT setting component.thinking — a Catalyst run must not
  // block the chat input. The progress bar + Cancel drive its state instead.
  // Turn the bar on immediately (before the IMS round-trip) for instant feedback.
  /* eslint-disable no-underscore-dangle */
  component._resetCatalystLog?.();
  component._catalystActive = true;
  component._setCatalystActivity('Starting the migration…');
  /* eslint-enable no-underscore-dangle */
  component.requestUpdate();

  let token = null;
  try {
    token = await imsToken();
  } catch {
    token = null;
  }
  if (!token) {
    addMsg(component, { role: ROLE.ASSISTANT, content: '_Catalyst error: no IMS token_' });
    // eslint-disable-next-line no-underscore-dangle
    component._catalystActive = false;
    component.requestUpdate();
    return;
  }

  // Fast-fail if the backend is unreachable, so the user gets a clear message
  // in ~10s instead of waiting out a long stream timeout.
  try {
    await getHistory(host, token);
  } catch {
    addMsg(component, {
      role: ROLE.ASSISTANT, content: 'Migration service unavailable. Please try again, later.',
    });
    /* eslint-disable no-underscore-dangle */
    component._catalystActive = false;
    component._setCatalystProgress(null);
    /* eslint-enable no-underscore-dangle */
    component.requestUpdate();
    return;
  }

  setRunMarker(message);
  const controller = new AbortController();
  const flags = { dropped: false };
  let finalized = false;
  let stopPolling = () => {};
  let stopEvents = () => {};
  // Finalize once, from wherever the turn actually ends (stream done, settled
  // idle, Stop, or a dropped/timed-out stream). Result comes from streamed text,
  // falling back to the final assistant message in history — so a lost
  // connection doesn't lose the result; the run persists server-side.
  const finalize = async () => {
    if (finalized) return;
    finalized = true;
    stopPolling();
    stopEvents();
    controller.abort();
    let text = streamed;
    if (!extractResultLinks(text).daPath) {
      try {
        const hist = await getHistory(host, token);
        const last = ((hist && hist.history) || [])
          .filter((m) => m && m.role === 'assistant').pop();
        if (last && last.content) text = `${text}\n${last.content}`;
      } catch {
        // nothing more we can read
      }
    }
    /* --- feature: figma->catalyst (auto-preview) --- */
    announceAndOpen(component, { ...extractResultLinks(text), targetPath });
    /* --- end feature --- */
    clearRunMarker();
    /* eslint-disable no-underscore-dangle */
    component._catalystActive = false;
    component._setCatalystProgress(null);
    component._controller?.setBackgroundNote?.('');
    /* eslint-enable no-underscore-dangle */
    component.requestUpdate();
  };

  // History poll (questions, progress, settle detection) + live events stream.
  stopPolling = startQuestionPolling(host, token, component, finalize, flags);
  stopEvents = startEventStream(host, token, component);
  /* eslint-disable no-underscore-dangle */
  component._catalystActive = true;
  component._controller?.setBackgroundNote?.(
    'A Figma-to-EDS page migration is running in the background via Experience '
    + 'Catalyst, a separate system you do not control or observe. If the user asks '
    + 'about its progress, say it is still running and they will be notified when the '
    + 'page is ready. Do not claim you are performing or monitoring it yourself.',
  );
  component._catalystStop = () => {
    controller.abort();
    finalize();
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
        // Each SSE frame is a discrete status message; keep it as its own line in
        // the panel log (not glued into one run-on blob, not in the main thread).
        const text = chunk.trim();
        if (text) {
          streamed += (streamed ? '\n\n' : '') + text;
          // eslint-disable-next-line no-underscore-dangle
          component._appendCatalystLog(text);
        }
      },
    });
    await finalize();
  } catch (err) {
    if (err.name !== 'AbortError') {
      // Distinguish a mid-run stream drop (backend still reachable → keep
      // reconciling via history) from the backend being unreachable
      // (CORS/network → show a clear message instead of doing nothing).
      let reachable = false;
      try {
        await getHistory(host, token);
        reachable = true;
      } catch {
        reachable = false;
      }
      if (reachable) {
        flags.dropped = true;
      } else {
        addMsg(component, {
          role: ROLE.ASSISTANT, content: 'Migration service unavailable. Please try again, later.',
        });
        await finalize();
      }
    }
  }
}

/**
 * On chat load: if a Figma run was in flight for this room, re-attach — resume
 * the bar if it's still running, or surface the result if it finished while the
 * user was away. Enables "close the page / come back later".
 */
export async function resumeCatalystRun(component) {
  const marker = readRunMarker();
  if (!marker || marker.room !== roomKey()) return;
  const targetPath = extractTargetPath(marker.message);
  const host = catalystHost();
  let token = null;
  try {
    token = await imsToken();
  } catch {
    return;
  }
  if (!token) return;
  let hist = null;
  try {
    hist = await getHistory(host, token);
  } catch {
    return;
  }
  if (!hist) return;

  // Finished while away: surface the result once and clear the marker.
  if (!hist.isProcessing && !hist.pendingQuestion) {
    const last = ((hist.history) || [])
      .filter((m) => m && m.role === ROLE.ASSISTANT).pop();
    announceAndOpen(component, {
      ...extractResultLinks((last && last.content) || ''), targetPath,
    });
    clearRunMarker();
    return;
  }

  // Still running: re-attach the migration panel + monitor (no new POST).
  /* eslint-disable no-underscore-dangle */
  component._resetCatalystLog?.();
  component._appendCatalystLog?.('Resuming your Figma migration…');
  /* eslint-enable no-underscore-dangle */

  const controller = new AbortController();
  const flags = { dropped: true };
  let finalized = false;
  let stopPolling = () => {};
  let stopEvents = () => {};
  const finalize = async () => {
    if (finalized) return;
    finalized = true;
    stopPolling();
    stopEvents();
    controller.abort();
    let text = '';
    try {
      const h = await getHistory(host, token);
      const last = ((h && h.history) || [])
        .filter((m) => m && m.role === ROLE.ASSISTANT).pop();
      if (last && last.content) text = last.content;
    } catch {
      // ignore
    }
    announceAndOpen(component, { ...extractResultLinks(text), targetPath });
    clearRunMarker();
    /* eslint-disable no-underscore-dangle */
    component._catalystActive = false;
    component._setCatalystProgress(null);
    component._controller?.setBackgroundNote?.('');
    /* eslint-enable no-underscore-dangle */
    component.requestUpdate();
  };
  stopPolling = startQuestionPolling(host, token, component, finalize, flags);
  stopEvents = startEventStream(host, token, component);
  /* eslint-disable no-underscore-dangle */
  component._catalystActive = true;
  component._controller?.setBackgroundNote?.(
    'A Figma-to-EDS page migration is running in the background via Experience '
    + 'Catalyst, a separate system you do not control or observe. If the user asks '
    + 'about its progress, say it is still running and they will be notified when the '
    + 'page is ready. Do not claim you are performing or monitoring it yourself.',
  );
  component._catalystStop = () => {
    controller.abort();
    finalize();
  };
  /* eslint-enable no-underscore-dangle */
  component.requestUpdate();
}

/**
 * Continue an EMA conversation from the migration panel's own reply box. Sends the
 * reply to Catalyst, streams narration back into the panel log, and re-monitors —
 * so the main input box stays wired to AO and the two conversations never mix.
 * Also the recovery path when EMA asked a prose question and the run finalized early.
 */
export async function continueCatalystRun(component, message) {
  const host = catalystHost();
  const targetPath = extractTargetPath((readRunMarker() || {}).message || message);
  let token = null;
  try {
    token = await imsToken();
  } catch {
    token = null;
  }
  if (!token) {
    // eslint-disable-next-line no-underscore-dangle
    component._appendCatalystLog?.('Could not reach the migration (no token).');
    return;
  }

  let streamed = '';
  const controller = new AbortController();
  const flags = { dropped: false };
  let finalized = false;
  let stopPolling = () => {};
  let stopEvents = () => {};
  const finalize = async () => {
    if (finalized) return;
    finalized = true;
    stopPolling();
    stopEvents();
    controller.abort();
    let text = streamed;
    if (!extractResultLinks(text).daPath) {
      try {
        const hist = await getHistory(host, token);
        const last = ((hist && hist.history) || [])
          .filter((m) => m && m.role === ROLE.ASSISTANT).pop();
        if (last && last.content) text = `${text}\n${last.content}`;
      } catch {
        // nothing more to read
      }
    }
    announceAndOpen(component, { ...extractResultLinks(text), targetPath });
    /* eslint-disable no-underscore-dangle */
    component._catalystActive = false;
    component._setCatalystProgress(null);
    component._controller?.setBackgroundNote?.('');
    /* eslint-enable no-underscore-dangle */
    component.requestUpdate();
  };

  setRunMarker(message);
  stopPolling = startQuestionPolling(host, token, component, finalize, flags);
  stopEvents = startEventStream(host, token, component);
  /* eslint-disable no-underscore-dangle */
  component._catalystActive = true;
  component._setCatalystActivity('Sending your reply…');
  component._catalystStop = () => {
    controller.abort();
    finalize();
  };
  /* eslint-enable no-underscore-dangle */
  component.requestUpdate();

  try {
    await streamChat({
      host,
      token,
      message,
      signal: controller.signal,
      onChunk: (chunk) => {
        const text = chunk.trim();
        if (text) {
          streamed += (streamed ? '\n\n' : '') + text;
          // eslint-disable-next-line no-underscore-dangle
          component._appendCatalystLog(text);
        }
      },
    });
    await finalize();
  } catch (err) {
    if (err.name !== 'AbortError') {
      let reachable = false;
      try {
        await getHistory(host, token);
        reachable = true;
      } catch {
        reachable = false;
      }
      if (reachable) {
        flags.dropped = true;
      } else {
        // eslint-disable-next-line no-underscore-dangle
        component._appendCatalystLog('Migration service unavailable. Please try again, later.');
        await finalize();
      }
    }
  }
}
/* --- end feature: figma->catalyst ---------------------------------------- */
