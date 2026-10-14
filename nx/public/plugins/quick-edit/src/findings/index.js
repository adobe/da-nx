import { MESSAGE_TYPES } from '../../../../../utils/message-types.js';
import { runAfterLoad, watchLayout } from '../overlay.js';
import { clearFindingOverlay, renderFindingMarkers } from './render.js';

const watchedContexts = new WeakSet();

function roundedRect(rect) {
  if (!rect) return null;
  return {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function reportLayout(ctx, drawn) {
  const rect = roundedRect(drawn.rect);
  const key = `${drawn.id}|${rect ? `${rect.top},${rect.left},${rect.width},${rect.height}` : 'null'}`;
  if (ctx.findingLayoutKey === key) return;
  ctx.findingLayoutKey = key;
  ctx.port?.postMessage({
    type: MESSAGE_TYPES.FINDING_MARKER_LAYOUT,
    payload: { id: drawn.id, rect },
  });
}

function scrollIntoViewCentered(element) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
}

function hasSelectedFinding(ctx) {
  return !!ctx.findingMarkers?.some((m) => m?.id != null && m.id === ctx.selectedFindingId);
}

function render(ctx, root) {
  const drawn = renderFindingMarkers(ctx, root);
  if (!drawn) return;
  reportLayout(ctx, drawn);
  if (ctx.findingPendingScroll && drawn.element) {
    ctx.findingPendingScroll = false;
    scrollIntoViewCentered(drawn.element);
  }
}

export function applyFindingMarkers(ctx, root = document) {
  if (!hasSelectedFinding(ctx)) {
    clearFindingOverlay(root);
    ctx.findingLayoutKey = null;
    ctx.findingPendingScroll = false;
    return;
  }
  if (!watchedContexts.has(ctx)) {
    watchedContexts.add(ctx);
    watchLayout(() => {
      if (hasSelectedFinding(ctx)) render(ctx, root);
    }, root);
  }
  render(ctx, root);
  runAfterLoad(() => {
    if (hasSelectedFinding(ctx)) render(ctx, root);
  });
}

export function setFindingMarkers(payload, ctx) {
  ctx.findingMarkers = Array.isArray(payload?.markers) ? payload.markers : [];
  ctx.selectedFindingId = payload?.selectedId ?? null;
  ctx.findingPendingScroll = !!payload?.scrollIntoView;
  ctx.findingLayoutKey = null;
  applyFindingMarkers(ctx);
}
