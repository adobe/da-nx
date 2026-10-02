import { MESSAGE_TYPES } from '../../../../utils/message-types.js';

const EMPTY_MAIN_DROP_HEIGHT = 240;
const INDEXED_SELECTOR = '[data-block-index], [data-prose-index], [data-image-index]';

function anchorFor(element) {
  const block = element.closest('[data-block-index]');
  if (block) {
    const index = Number(block.getAttribute('data-block-index'));
    return Number.isSafeInteger(index) && index > 0
      ? { element: block, kind: 'block', index } : null;
  }
  const text = element.closest('[data-prose-index]');
  if (text) {
    const index = Number(text.getAttribute('data-prose-index'));
    return Number.isSafeInteger(index) && index > 0
      ? { element: text, kind: 'text', index } : null;
  }
  const image = element.closest('[data-image-index]');
  if (image) {
    const index = Number(image.getAttribute('data-image-index'));
    return Number.isSafeInteger(index) && index >= 0
      ? { element: image.closest('picture') || image, kind: 'image', index } : null;
  }
  return null;
}

export function nearestTableDropAnchor(main, y, target) {
  const hovered = target?.closest?.(INDEXED_SELECTOR);
  const direct = hovered && main.contains(hovered) ? anchorFor(hovered) : null;
  if (direct) {
    const rect = direct.element.getBoundingClientRect();
    if (rect.width && rect.height) {
      return { ...direct, side: y < (rect.top + rect.bottom) / 2 ? 'before' : 'after' };
    }
  }

  const candidates = [...main.querySelectorAll(INDEXED_SELECTOR)];
  if (!candidates.length) return { element: main, kind: 'main', index: 0, side: 'before' };
  let nearest = null;
  let distance = Infinity;
  candidates.forEach((element) => {
    const anchor = anchorFor(element);
    if (!anchor || anchor.element !== element) return;
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const edge = y < (rect.top + rect.bottom) / 2 ? 'before' : 'after';
    const edgeY = edge === 'before' ? rect.top : rect.bottom;
    const delta = Math.abs(y - edgeY);
    if (delta < distance) {
      distance = delta;
      nearest = { ...anchor, side: edge };
    }
  });
  return nearest;
}

function dropMain(target, x, y) {
  const direct = target?.closest?.('main');
  if (direct) return direct;
  const main = document.querySelector('main');
  if (!main || main.querySelector(INDEXED_SELECTOR)) return null;
  const rect = main.getBoundingClientRect();
  return rect.width && !rect.height
    && x >= rect.left && x < rect.right
    && y >= rect.top && y < Math.min(window.innerHeight, rect.top + EMPTY_MAIN_DROP_HEIGHT)
    ? main : null;
}

let activeCtx = null;
let activeAnchor = null;
let listenersInstalled = false;

function removeIndicator() {
  document.getElementById('qe-table-drop-indicator')?.remove();
  activeAnchor = null;
}

function drawIndicator(anchor) {
  activeAnchor = anchor;
  let line = document.getElementById('qe-table-drop-indicator');
  if (!line) {
    line = document.createElement('div');
    line.id = 'qe-table-drop-indicator';
    line.setAttribute('aria-hidden', 'true');
    document.body.append(line);
  }
  const rect = anchor.element.getBoundingClientRect();
  line.style.left = `${rect.left}px`;
  line.style.top = `${anchor.side === 'before' ? rect.top : rect.bottom}px`;
  line.style.width = `${rect.width}px`;
}

function isHtmlDrag(event) {
  return !event.dataTransfer?.types.includes('Files')
    && event.dataTransfer?.types.includes('text/html');
}

function sendTableDrop(html, anchor) {
  if (!activeCtx || activeCtx.readOnly || !anchor || typeof html !== 'string' || !html.trim()) return false;
  const { kind, index, side } = anchor;
  activeCtx.port.postMessage({
    type: MESSAGE_TYPES.TABLE_DROP,
    payload: { html, anchor: { kind, index }, side },
  });
  return true;
}

export function handleRemoteTableDrag({ phase, x, y, html }) {
  if (phase === 'leave') {
    removeIndicator();
    return;
  }
  if (!activeCtx || activeCtx.readOnly || !['over', 'drop'].includes(phase)
    || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const target = document.elementFromPoint(x, y);
  const main = dropMain(target, x, y);
  const anchor = main && nearestTableDropAnchor(main, y, target);
  if (phase === 'drop') {
    removeIndicator();
    sendTableDrop(html, anchor);
  } else if (anchor) {
    drawIndicator(anchor);
  } else {
    removeIndicator();
  }
}

export function setupTableDropListeners(ctx) {
  activeCtx = ctx;
  if (listenersInstalled) return;
  listenersInstalled = true;

  document.addEventListener('dragover', (event) => {
    const main = dropMain(event.target, event.clientX, event.clientY);
    if (!activeCtx || activeCtx.readOnly || !main || !isHtmlDrag(event)) {
      removeIndicator();
      return;
    }
    const anchor = nearestTableDropAnchor(main, event.clientY, event.target);
    if (!anchor) {
      removeIndicator();
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    drawIndicator(anchor);
  }, true);

  document.addEventListener('drop', (event) => {
    const main = dropMain(event.target, event.clientX, event.clientY);
    const anchor = main && nearestTableDropAnchor(main, event.clientY, event.target);
    removeIndicator();
    if (!activeCtx || activeCtx.readOnly || !anchor || !isHtmlDrag(event)) return;
    const html = event.dataTransfer.getData('text/html');
    if (!html.trim()) return;
    event.preventDefault();
    event.stopPropagation();
    sendTableDrop(html, anchor);
  }, true);

  document.addEventListener('dragleave', (event) => {
    if (event.relatedTarget === null) removeIndicator();
  });
  document.addEventListener('dragend', removeIndicator);
  window.addEventListener('blur', removeIndicator);
  window.addEventListener('scroll', () => {
    if (activeAnchor?.element.isConnected) drawIndicator(activeAnchor);
    else removeIndicator();
  }, true);
}
