import { toUiArtifact } from '../utils/episodes.js';

// Dev-only switch, see docs/evaluation-findings.md#dev-fixture-switch.
export const EVAL_FIXTURE_PARAM = 'nx-eval-fixture';

const injected = new WeakSet();

export function sanitizeFixtureName(raw) {
  return (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.-]+/, '');
}

export async function loadEvalFixture({
  search = window.location.search,
  baseUrl = import.meta.url,
} = {}) {
  const name = sanitizeFixtureName(new URLSearchParams(search).get(EVAL_FIXTURE_PARAM));
  if (!name) return undefined;
  try {
    const resp = await fetch(new URL(`./fixtures/${name}.artifact.json`, baseUrl).href);
    if (!resp.ok) throw new Error(`${resp.status}`);
    return await resp.json();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[nx-eval-fixture] could not load fixture "${name}":`, e.message);
    return undefined;
  }
}

// Appends the fixture once to the controller's current messages, without contacting AO.
export async function injectEvalFixture(controller, options) {
  if (!controller || injected.has(controller)) return;
  injected.add(controller);
  const artifact = await loadEvalFixture(options);
  if (!artifact) return;
  // A failed episode load can leave the spinner on, which hides the message list.
  controller.appendMessage({ role: 'assistant', uiArtifact: toUiArtifact(artifact) }, {
    stopLoading: true,
  });
}

// The rejection of loadEpisodes still propagates (and is reported) as before.
export async function loadEpisodesThenInject(controller, options) {
  try {
    await controller.loadEpisodes();
  } finally {
    await injectEvalFixture(controller, options);
  }
}
