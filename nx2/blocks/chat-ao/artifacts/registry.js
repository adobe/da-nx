import { html } from 'da-lit';

const renderers = new Map();

export function registerArtifact(type, renderFn) {
  renderers.set(type, renderFn);
}

export function renderFallback(fallbackText) {
  return html`<p class="ui-artifact-fallback">${fallbackText || 'Unsupported content.'}</p>`;
}

// LLM-authored props aren't guaranteed to match a renderer's expectations, so
// an unknown type or a throwing renderer both degrade to text_fallback.
export function renderArtifactNode(node, fallbackText, ctx) {
  const renderFn = renderers.get(node?.type);
  if (!renderFn) return renderFallback(fallbackText || `Unsupported content (${node?.type}).`);
  try {
    return renderFn(node.props ?? {}, ctx);
  } catch {
    return renderFallback(fallbackText);
  }
}
