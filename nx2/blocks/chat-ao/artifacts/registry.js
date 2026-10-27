import { html, nothing } from 'da-lit';

const renderers = new Map();

// Keys on a flat A2UI record that describe the tree, not the component's own fields.
const STRUCTURAL_KEYS = new Set(['id', 'component', 'child', 'children']);

export function registerArtifact(type, renderFn) {
  renderers.set(type, renderFn);
}

export function renderFallback(fallbackText) {
  return html`<p class="ui-artifact-fallback">${fallbackText || 'Unsupported content.'}</p>`;
}

// A flat A2UI record (`{ id, component, ...fields }`) as opposed to the legacy
// nested `{ type, props, children: [nodes] }` shape older artifacts still carry.
export function isFlatRecord(node) {
  return typeof node?.component === 'string';
}

function flatChildRefs(node) {
  if (Array.isArray(node.children)) return node.children;
  if (node.child !== undefined && node.child !== null) return [node.child];
  return [];
}

function flatFields(node) {
  return Object.fromEntries(Object.entries(node).filter(([key]) => !STRUCTURAL_KEYS.has(key)));
}

// LLM-authored props aren't guaranteed to match a renderer's expectations, so
// an unknown type or a throwing renderer both degrade to text_fallback.
export function renderArtifactNode(node, fallbackText, ctx = {}) {
  const flat = isFlatRecord(node);
  const type = flat ? node.component : node?.type;
  const renderFn = renderers.get(type);
  if (!renderFn) return renderFallback(fallbackText || `Unsupported content (${type}).`);
  // Flat records reference children by id; legacy nodes nest them either at
  // the node level or hoisted into props — support both.
  const children = flat ? flatChildRefs(node) : node.children ?? node.props?.children ?? [];
  const props = flat ? flatFields(node) : node.props;
  try {
    return renderFn({ ...props, children }, { ...ctx, fallbackText });
  } catch {
    return renderFallback(fallbackText);
  }
}

// Container renderers (Row, Column, Card, ...) use this to render their own children.
// A child is either a nested legacy node or the id of a flat record in ctx.recordsById.
export function renderChildren(children, ctx) {
  return (children ?? []).map((child) => {
    if (typeof child !== 'string') return renderArtifactNode(child, ctx?.fallbackText, ctx);
    const record = ctx?.recordsById?.get(child);
    if (!record) return nothing;
    return renderArtifactNode(record, ctx?.fallbackText, ctx);
  });
}
