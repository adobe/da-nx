import { loadIms } from '../../../utils/ims.js';
import { getOrgId, resolveAoHttpBase } from './uploads.js';

async function aoContext() {
  const { accessToken, projectedProductContext } = await loadIms();
  return {
    base: resolveAoHttpBase(projectedProductContext),
    headers: {
      authorization: `Bearer ${accessToken?.token}`,
      'x-tenant-id': getOrgId(projectedProductContext),
    },
  };
}

// AO owns episode history durably — nothing to persist client-side.
export async function fetchEpisodes(limit) {
  try {
    const { base, headers } = await aoContext();
    const resp = await fetch(`${base}/api/v1/episodes?limit=${limit}`, { headers });
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
    const { base, headers } = await aoContext();
    const resp = await fetch(`${base}/api/v1/episodes/${episodeId}/turns?root_only=true`, { headers });
    if (!resp.ok) return [];
    const { turns } = await resp.json();
    return turnsToMessages(turns);
  } catch {
    return [];
  }
}

// Starts the durable session without submitting a turn. Best-effort: a
// manifest that isn't Temporal-mode 400s here, which just means no speedup.
export async function warmSession(episodeId) {
  try {
    const { base, headers } = await aoContext();
    await fetch(`${base}/api/v1/sessions`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ episodeId }),
    });
  } catch {
    // best-effort — see comment above
  }
}

export async function fetchEpisodeContext(episodeId) {
  try {
    const { base, headers } = await aoContext();
    const resp = await fetch(`${base}/api/v1/episodes/${episodeId}/context`, { headers });
    if (!resp.ok) return null;
    const { suspendedTurn } = await resp.json();
    if (suspendedTurn?.questionData) {
      return {
        type: 'question',
        turnId: suspendedTurn.turnId,
        context: suspendedTurn.questionData.context ?? null,
        questions: suspendedTurn.questionData.questions ?? [],
      };
    }
    if (suspendedTurn?.planData) {
      return {
        type: 'plan',
        turnId: suspendedTurn.turnId,
        planContent: suspendedTurn.planData.planContent ?? '',
        planFilePath: suspendedTurn.planData.planFilePath ?? null,
      };
    }
    return null;
  } catch {
    return null;
  }
}
