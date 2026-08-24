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

export function toUiArtifact(artifact) {
  return {
    id: artifact.id,
    components: artifact.a2ui_surface?.components ?? [],
    textFallback: artifact.text_fallback,
    title: artifact.display_hints?.title,
  };
}

function turnsToMessages(turns, artifacts = []) {
  // Endpoint pages newest-first; reverse for creation order within a turn.
  const artifactsByTurn = new Map();
  [...artifacts].reverse().forEach((artifact) => {
    const list = artifactsByTurn.get(artifact.turn_id) ?? [];
    list.push(artifact);
    artifactsByTurn.set(artifact.turn_id, list);
  });

  const messages = [];
  (turns ?? []).forEach((turn) => {
    if (turn?.user_input) messages.push({ role: 'user', content: turn.user_input });
    // Artifacts come from a mid-turn tool call, so they precede final_response on the wire.
    (artifactsByTurn.get(turn?.id) ?? []).forEach((artifact) => {
      messages.push({ role: 'assistant', uiArtifact: toUiArtifact(artifact) });
    });
    if (turn?.final_response) messages.push({ role: 'assistant', content: turn.final_response });
  });
  return messages;
}

const MAX_ARTIFACT_FETCH_PAGES = 200;

// Artifacts live outside the turn/event log, so history needs this separate fetch.
export async function fetchEpisodeArtifacts(episodeId) {
  try {
    const { base, headers } = await aoContext();
    const artifacts = [];
    let beforeArtifactId;
    for (let page = 0; page < MAX_ARTIFACT_FETCH_PAGES; page += 1) {
      const query = beforeArtifactId ? `?before_artifact_id=${beforeArtifactId}` : '';
      // eslint-disable-next-line no-await-in-loop
      const resp = await fetch(`${base}/api/v1/episodes/${episodeId}/artifacts${query}`, { headers });
      if (!resp.ok) break;
      // eslint-disable-next-line no-await-in-loop
      const { artifacts: pageArtifacts = [], has_more: hasMore } = await resp.json();
      artifacts.push(...pageArtifacts);
      if (!hasMore || !pageArtifacts.length) break;
      beforeArtifactId = pageArtifacts.at(-1).id;
    }
    return artifacts;
  } catch {
    return [];
  }
}

// root_only drops sub-agent turns — chat history only cares about the main thread.
export async function fetchEpisodeMessages(episodeId) {
  try {
    const { base, headers } = await aoContext();
    const resp = await fetch(`${base}/api/v1/episodes/${episodeId}/turns?root_only=true`, { headers });
    if (!resp.ok) return [];
    const { turns } = await resp.json();
    const artifacts = await fetchEpisodeArtifacts(episodeId);
    return turnsToMessages(turns, artifacts);
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
