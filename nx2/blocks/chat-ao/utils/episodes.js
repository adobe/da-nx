import { loadIms } from '../../../utils/ims.js';
import { env } from '../../../scripts/nx.js';
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
    const base = AO_HTTP_BASE[env] ?? AO_HTTP_BASE.stage;
    const resp = await fetch(`${base}/api/v1/episodes?limit=${limit}`, { headers: await authHeaders() });
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
    const base = AO_HTTP_BASE[env] ?? AO_HTTP_BASE.stage;
    const resp = await fetch(`${base}/api/v1/episodes/${episodeId}/turns?root_only=true`, {
      headers: await authHeaders(),
    });
    if (!resp.ok) return [];
    const { turns } = await resp.json();
    return turnsToMessages(turns);
  } catch {
    return [];
  }
}
