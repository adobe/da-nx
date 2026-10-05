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
export function renderArtifactNode(node, fallbackText, ctx = {}) {
  const renderFn = renderers.get(node?.type);
  if (!renderFn) return renderFallback(fallbackText || `Unsupported content (${node?.type}).`);
  // AO nests children either at the node level or hoisted into props — support both.
  const children = node.children ?? node.props?.children ?? [];
  try {
    return renderFn({ ...node.props, children }, { ...ctx, fallbackText });
  } catch {
    return renderFallback(fallbackText);
  }
}

// Container renderers (Row, Column, Card, ...) use this to render their own children.
export function renderChildren(children, ctx) {
  return (children ?? []).map((child) => renderArtifactNode(child, ctx?.fallbackText, ctx));
}
