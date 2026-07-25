import { parseIndex } from './utils.js';

const ATOMIC_TAGS = new Set(['br', 'img', 'picture']);

export const OVERLAY_SELECTOR = '#qe-selection-overlay, #qe-comment-overlay';

export function safeQuerySelectorAll(root, selector) {
  try {
    return [...root.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

function findNearestIndexed(attr, from, root) {
  const exact = root.querySelector(`[${attr}="${from}"]`);
  if (exact) return exact;
  let best = null;
  let bestIndex = -1;
  root.querySelectorAll(`[${attr}]`).forEach((el) => {
    const idx = parseIndex(el.getAttribute(attr));
    if (idx == null || idx > from) return;
    if (idx > bestIndex) {
      bestIndex = idx;
      best = el;
    }
  });
  return best;
}

export function findTextBlock(from, root = document) {
  return findNearestIndexed('data-prose-index', from, root);
}

export function findBlock(from, root = document) {
  return findNearestIndexed('data-block-index', from, root);
}

export function restoreBlockIndices(sourceRoot, liveRoot = document) {
  const sourceBlocks = [...sourceRoot.querySelectorAll('[data-block-index]')];
  if (!sourceBlocks.length) return;
  const claimed = new Set();
  sourceBlocks.forEach((src) => {
    const index = src.getAttribute('data-block-index');
    const name = src.classList?.[0];
    if (!index) return;
    let live = liveRoot.querySelector(`[data-block-index="${index}"]`);
    if (!live && name) {
      live = safeQuerySelectorAll(liveRoot, `div.${CSS.escape(name)}`)
        .find((el) => !claimed.has(el));
    }
    if (live) {
      live.setAttribute('data-block-index', index);
      claimed.add(live);
    }
  });
}

export function pictureSrc(picture) {
  if (picture?.tagName === 'IMG') return picture.getAttribute('src') || '';
  return picture?.querySelector?.('img')?.getAttribute('src')
    || picture?.querySelector?.('source')?.getAttribute('srcset')
    || '';
}

function normalizeSrc(src) {
  if (!src) return '';
  const bare = String(src).split('?')[0].split('#')[0];
  try {
    return new URL(bare, window.location.href).pathname;
  } catch {
    return bare;
  }
}

export function srcPathsMatch(a, b) {
  const left = normalizeSrc(a);
  const right = normalizeSrc(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const leftName = left.split('/').pop();
  const rightName = right.split('/').pop();
  return Boolean(leftName && leftName === rightName)
    || left.endsWith(right)
    || right.endsWith(left);
}

function isAtomicInline(el) {
  if (!el?.tagName) return false;
  return ATOMIC_TAGS.has(el.tagName.toLowerCase());
}

function walkProsePositions(root, startPos, callbacks) {
  let pos = startPos;

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;
      callbacks.onText?.(node, pos, len);
      pos += len;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    if (el.closest(OVERLAY_SELECTOR)) return;
    if (isAtomicInline(el)) {
      callbacks.onAtomic?.(el, pos);
      pos += 1;
      return;
    }
    Array.from(el.childNodes).forEach((child) => walk(child));
  }

  walk(root);
  return pos;
}

export function findImageAtProseIndex(from, root = document) {
  const direct = root.querySelector(`picture[data-prose-index="${from}"]`);
  if (direct) return direct;

  const block = findTextBlock(from, root);
  if (!block) return null;
  const blockIndex = parseIndex(block.getAttribute('data-prose-index'));
  if (blockIndex == null) return null;

  for (const contentStart of [blockIndex, blockIndex - 1, blockIndex + 1]) {
    let found = null;
    walkProsePositions(block, contentStart, {
      onAtomic(el, pos) {
        if (pos === from) {
          const tag = el.tagName.toLowerCase();
          found = tag === 'picture' ? el : el.closest('picture') || el;
        }
      },
    });
    if (found) return found;
  }
  return null;
}
