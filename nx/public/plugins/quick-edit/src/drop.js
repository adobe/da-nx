import { MESSAGE_TYPES } from '../../../../utils/message-types.js';
import { imageSelectPayload } from './selection.js';

const INDEXED = '[data-block-index], [data-prose-index], [data-image-index]';

function getAnchor(element) {
  const block = element.closest('[data-block-index]');
  const text = element.closest('[data-prose-index]');
  const image = element.closest('[data-image-index]');
  const target = block || text || image;
  if (!target) return null;
  const kind = block ? 'block' : (text && 'text') || 'image';
  const index = Number(target.getAttribute(`data-${kind === 'text' ? 'prose' : kind}-index`));
  if (!Number.isSafeInteger(index) || index < (kind === 'image' ? 0 : 1)) return null;
  return { element: kind === 'image' ? target.closest('picture') || target : target, kind, index };
}

export function findDropAnchor({ main, target, y }) {
  const hovered = target?.closest?.(INDEXED);
  const direct = hovered && main.contains(hovered) && getAnchor(hovered);
  const candidates = direct ? [direct] : [...main.querySelectorAll(INDEXED)]
    .map(getAnchor).filter(Boolean);
  if (!candidates.length) return { element: main, kind: 'main', index: 0, side: 'before' };
  return candidates.reduce((nearest, anchor) => {
    const rect = anchor.element.getBoundingClientRect();
    if (!rect.width || !rect.height) return nearest;
    const side = y < (rect.top + rect.bottom) / 2 ? 'before' : 'after';
    const distance = Math.abs(y - (side === 'before' ? rect.top : rect.bottom));
    return !nearest || distance < nearest.distance ? { ...anchor, side, distance } : nearest;
  }, null);
}

export function handleDropTarget(payload, ctx) {
  ctx.clearDrop?.();
  ctx.bridgeDropTarget?.classList.remove('image-drop-target');
  ctx.bridgeDropTarget = undefined;
  const { phase, kind, x, y, requestId } = payload;
  let target = null;
  const main = document.querySelector('main');
  const element = Number.isFinite(x) && Number.isFinite(y) && document.elementFromPoint(x, y);
  if (!ctx.readOnly && !ctx.reloadRequested && ctx.pendingNodeUpdateId == null
    && ['hover', 'resolve'].includes(phase) && element && main?.contains(element)) {
    if (kind === 'image') {
      const picture = element.closest('picture');
      const img = picture?.querySelector('img');
      const proseIndex = img && imageSelectPayload(img)?.proseIndex;
      const imageVersion = img?.getAttribute('data-image-version');
      if (Number.isSafeInteger(proseIndex) && imageVersion) {
        target = { proseIndex, imageVersion, originalSrc: img.src };
        if (phase === 'hover') {
          ctx.bridgeDropTarget = picture;
          picture.classList.add('image-drop-target');
        }
      }
    } else if (kind === 'html') {
      const anchor = findDropAnchor({ main, target: element, y });
      if (anchor) {
        target = { anchor: { kind: anchor.kind, index: anchor.index }, side: anchor.side };
        if (phase === 'hover') ctx.showDrop?.(anchor);
      }
    }
  }
  if (phase === 'resolve' && typeof requestId === 'string') {
    ctx.port.postMessage({
      type: MESSAGE_TYPES.DROP_TARGET,
      payload: { requestId, documentVersion: ctx.documentVersion, target },
    });
  }
}

export function setupDropListeners(ctx) {
  let indicator;
  const clear = () => {
    indicator?.remove();
    indicator = undefined;
  };
  ctx.clearDrop = clear;
  ctx.showDrop = (anchor) => {
    clear();
    const bounds = anchor.element.getBoundingClientRect();
    indicator = document.createElement('div');
    indicator.id = 'qe-drop-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    Object.assign(indicator.style, {
      left: `${bounds.left}px`,
      top: `${anchor.side === 'before' ? bounds.top : bounds.bottom}px`,
      width: `${bounds.width}px`,
    });
    document.body.append(indicator);
  };
  const onDrag = (event) => {
    clear();
    const types = event.dataTransfer?.types;
    if (ctx.readOnly || !types?.includes('text/html')
      || types.includes('Files') || types.includes('collectionviewdata')) return;
    const { target, clientY: y } = event;
    const main = document.querySelector('main');
    if (!main?.contains(target)) return;
    if (target.closest?.('.prosemirror-editor')) return;
    const anchor = findDropAnchor({ main, target, y });
    if (!anchor) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
    if (event.type === 'drop') {
      const html = event.dataTransfer.getData('text/html');
      if (!html.trim()) return;
      ctx.port.postMessage({
        type: MESSAGE_TYPES.HTML_DROP,
        payload: { html, anchor: { kind: anchor.kind, index: anchor.index }, side: anchor.side },
      });
      return;
    }
    ctx.showDrop(anchor);
  };
  const onLeave = (event) => {
    if (!event.relatedTarget || !document.querySelector('main')?.contains(event.relatedTarget)) clear();
  };
  const listeners = [
    [document, 'dragover', onDrag, true],
    [document, 'drop', onDrag, true],
    [document, 'dragend', clear],
    [document, 'dragleave', onLeave],
    [window, 'blur', clear],
    [window, 'scroll', clear, true],
  ];
  listeners.forEach(([target, type, listener, capture]) => {
    target.addEventListener(type, listener, capture);
  });
  ctx.destroyDrop = () => {
    clear();
    ctx.bridgeDropTarget?.classList.remove('image-drop-target');
    listeners.forEach(([target, type, listener, capture]) => {
      target.removeEventListener(type, listener, capture);
    });
  };
}
