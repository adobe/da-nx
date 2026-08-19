import { loadIms } from '../../../utils/ims.js';
import { AO_HTTP_BASE } from '../ao-constants.js';
import { getOrgId } from './uploads.js';

async function authHeaders() {
  const { accessToken, projectedProductContext } = await loadIms();
  return {
    authorization: `Bearer ${accessToken?.token}`,
    'x-tenant-id': getOrgId(projectedProductContext),
  };
}

// AO durably owns episode/turn history — there's nothing to persist client-side,
// just pull the recent list. Most-recent-first, per AO's own ordering.
export async function fetchEpisodes(limit) {
  try {
    const resp = await fetch(`${AO_HTTP_BASE}/api/v1/episodes?limit=${limit}`, { headers: await authHeaders() });
    if (!resp.ok) return [];
    const { episodes } = await resp.json();
    return episodes ?? [];
  } catch {
    return [];
  }
}

function turnsToMessages(turns) {
  const messages = [];
  (turns ?? []).forEach((turn) => {
    if (turn?.user_input) messages.push({ role: 'user', content: turn.user_input });
    if (turn?.final_response) messages.push({ role: 'assistant', content: turn.final_response });
  });
  return messages;
}

// root_only drops sub-agent turns — chat history only cares about the main thread.
export async function fetchEpisodeMessages(episodeId) {
  try {
    const resp = await fetch(`${AO_HTTP_BASE}/api/v1/episodes/${episodeId}/turns?root_only=true`, {
      headers: await authHeaders(),
    });
    if (!resp.ok) return [];
    const { turns } = await resp.json();
    return turnsToMessages(turns);
  } catch {
    return [];
  }
}

// Wakes an existing episode's backend session ahead of the user actually
// sending anything — POST /api/v1/sessions starts the durable session
// without submitting a turn, so by the time sendMessage's own WS connects,
// the slow part (orchestrator cold start) is already done. Best-effort: a
// manifest that isn't running in Temporal mode 400s here, which just means
// no speedup, not an error worth surfacing.
export async function warmSession(episodeId) {
  try {
    await fetch(`${AO_HTTP_BASE}/api/v1/sessions`, {
      method: 'POST',
      headers: { ...(await authHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify({ episodeId }),
    });
  } catch {
    // best-effort — see comment above
  }
}

export async function fetchEpisodeContext(episodeId) {
  try {
    const resp = await fetch(`${AO_HTTP_BASE}/api/v1/episodes/${episodeId}/context`, {
      headers: await authHeaders(),
    });
    if (!resp.ok) return null;
    const { suspendedTurn } = await resp.json();
    if (!suspendedTurn?.questionData) return null;
    return {
      turnId: suspendedTurn.turnId,
      context: suspendedTurn.questionData.context ?? null,
      questions: suspendedTurn.questionData.questions ?? [],
    };
  } catch {
    return null;
  }
}
