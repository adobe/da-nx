import { aoContext } from './uploads.js';

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

// See docs/chat-ao-component.md#client-context for why this is reversible/reloadable.
export function extractSelectionContext(events) {
  const userMessage = (events ?? []).find((event) => event.type === 'user_message');
  const resources = userMessage?.client_context?.focused_resources ?? [];
  return resources
    .filter((resource) => resource.type !== 'document')
    .map((resource) => (resource.type === 'text-selection'
      ? { type: 'text', innerHTML: resource.name }
      : { type: resource.type, blockName: resource.name }));
}

function turnsToMessages(turns, artifacts = [], turnEventsList = []) {
  // Endpoint pages newest-first; reverse for creation order within a turn.
  const artifactsByTurn = new Map();
  [...artifacts].reverse().forEach((artifact) => {
    const list = artifactsByTurn.get(artifact.turn_id) ?? [];
    list.push(artifact);
    artifactsByTurn.set(artifact.turn_id, list);
  });

  const messages = [];
  (turns ?? []).forEach((turn, index) => {
    if (turn?.user_input) {
      const selectionContext = extractSelectionContext(turnEventsList[index]);
      messages.push({
        role: 'user',
        content: turn.user_input,
        ...(selectionContext.length && { selectionContext }),
      });
    }
    // tools_summary is declared but never actually written server-side — always [].
    if (turn?.tool_call_count > 0) {
      messages.push({
        role: 'assistant',
        toolCall: {
          toolCallId: `${turn.id}:summary`,
          status: 'summary',
          summaryText: `Used ${turn.tool_call_count} tool${turn.tool_call_count === 1 ? '' : 's'}`,
          turnId: turn.id,
        },
      });
    }
    // Artifacts come from a mid-turn tool call, so they precede final_response on the wire.
    (artifactsByTurn.get(turn?.id) ?? []).forEach((artifact) => {
      messages.push({ role: 'assistant', uiArtifact: toUiArtifact(artifact) });
    });
    if (turn?.final_response) messages.push({ role: 'assistant', content: turn.final_response });
  });
  return messages;
}

export function extractToolCalls(events) {
  const results = new Map();
  (events ?? []).forEach((event) => {
    if (event.type === 'tool_result') results.set(event.tool_call_id, event);
  });

  const calls = [];
  (events ?? []).forEach((event) => {
    if (event.type !== 'assistant_message') return;
    (event.tool_calls ?? []).forEach((call) => {
      const resultEvent = results.get(call.id);
      let args = {};
      try {
        args = JSON.parse(call.arguments ?? '{}');
      } catch {
        args = {};
      }
      calls.push({
        toolCallId: call.id,
        toolName: call.name,
        arguments: args,
        result: resultEvent?.display_result ?? resultEvent?.result,
        status: resultEvent?.status ?? 'running',
        durationS: resultEvent?.duration_s,
        ...(resultEvent?.metadata?.skill_title && { title: resultEvent.metadata.skill_title }),
      });
    });
  });
  return calls;
}

export async function fetchTurnEvents(turnId) {
  try {
    const { base, headers } = await aoContext();
    const resp = await fetch(`${base}/api/v1/events/turn/${turnId}`, { headers });
    if (!resp.ok) return [];
    const { events } = await resp.json();
    return events ?? [];
  } catch {
    return [];
  }
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
    const [artifacts, turnEventsList] = await Promise.all([
      fetchEpisodeArtifacts(episodeId),
      // See docs/chat-ao-component.md#client-context for why this is eager, not lazy.
      Promise.all((turns ?? []).map((turn) => fetchTurnEvents(turn.id))),
    ]);
    return turnsToMessages(turns, artifacts, turnEventsList);
  } catch {
    return [];
  }
}

// See docs/chat-ao-component.md#ao-wire-protocol-notes — best-effort, and a
// non-Temporal manifest 400s here (just means no speedup, nothing to catch for).
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
    // See docs/chat-ao-component.md#permission-requests for why this field
    // check is enough (pendingCalls is always present, only ever non-empty here).
    if (suspendedTurn?.pendingCalls?.length) {
      return {
        type: 'permission',
        turnId: suspendedTurn.turnId,
        calls: suspendedTurn.pendingCalls.map((c) => ({
          toolCallId: c.id, toolName: c.name, arguments: c.arguments,
        })),
      };
    }
    return null;
  } catch {
    return null;
  }
}
