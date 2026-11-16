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

const isBusy = (ctx) => ctx.reloadRequested || ctx.pendingNodeUpdateId != null
  || ctx.documentVersion === undefined;

function imageTarget(element) {
  const picture = element.closest('picture');
  const img = picture?.querySelector('img');
  const proseIndex = img && imageSelectPayload(img)?.proseIndex;
  const imageVersion = img?.getAttribute('data-image-version');
  if (!Number.isSafeInteger(proseIndex) || !imageVersion) return null;
  return { picture, target: { proseIndex, imageVersion, originalSrc: img.src } };
}

// The host owns cross-iframe drags (extensions, assets rail) and asks where a point lands:
// html goes between blocks, images only onto existing images.
export function handleDropTarget(payload, ctx) {
  ctx.clearDrop?.();
  const {
    phase, kind, x, y, requestId,
  } = payload;
  const main = document.querySelector('main');
  const element = Number.isFinite(x) && Number.isFinite(y) && document.elementFromPoint(x, y);
  const busy = isBusy(ctx);
  let target = null;
  if (!ctx.readOnly && !busy && ['hover', 'resolve'].includes(phase)
    && element && main?.contains(element)) {
    if (kind === 'image') {
      const image = imageTarget(element);
      target = image?.target ?? null;
      if (image && phase === 'hover') ctx.showImageDrop?.(image.picture);
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
      payload: {
        requestId,
        documentVersion: ctx.documentVersion,
        target,
        ...(busy && !ctx.readOnly && { reason: 'busy' }),
      },
    });
  }
}

export function setupDropListeners(ctx) {
  let indicator;
  let picture;
  const clear = () => {
    indicator?.remove();
    indicator = undefined;
    picture?.classList.remove('image-drop-target');
    picture = undefined;
  };
  ctx.clearDrop = clear;
  ctx.showImageDrop = (element) => {
    clear();
    picture = element;
    picture.classList.add('image-drop-target');
  };
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
  // Native drops from outside the browser are only accepted on images (see images.js);
  // refuse the rest so the browser does not navigate the preview to the dropped item.
  const refuse = (event) => {
    if (event.defaultPrevented || event.target.closest?.('.prosemirror-editor')) return;
    event.preventDefault();
    if (event.type === 'dragover') event.dataTransfer.dropEffect = 'none';
  };
  const listeners = [
    [document, 'dragover', refuse],
    [document, 'drop', refuse],
    [window, 'blur', clear],
    [window, 'scroll', clear, true],
  ];
  listeners.forEach(([target, type, listener, capture]) => {
    target.addEventListener(type, listener, capture);
  });
  ctx.destroyDrop = () => {
    clear();
    listeners.forEach(([target, type, listener, capture]) => {
      target.removeEventListener(type, listener, capture);
    });
  };
}
