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

function findNearestIndexed(attr, from, root, exclude) {
  const suffix = exclude ? `:not(${exclude})` : '';
  const exact = root.querySelector(`[${attr}="${from}"]${suffix}`);
  if (exact) return exact;
  let best = null;
  let bestIndex = -1;
  root.querySelectorAll(`[${attr}]${suffix}`).forEach((el) => {
    const idx = parseIndex(el.getAttribute(attr));
    if (idx == null || idx > from) return;
    if (idx > bestIndex) {
      bestIndex = idx;
      best = el;
    }
  });
  return best;
}

// exclude keeps an already-open editor out of the nearest-match fallback, so a
// drifted cursorOffset can't resolve to and replace a different block's editor.
export function findTextBlock(from, root = document, exclude = null) {
  return findNearestIndexed('data-prose-index', from, root, exclude);
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
      // Authored variant = classes after the block name, read from source HTML so it
      // excludes classes added by decoration.
      const variant = [...(src.classList || [])].slice(1).join(', ');
      if (variant) live.setAttribute('data-block-variant', variant);
      else live.removeAttribute('data-block-variant');
      claimed.add(live);
    }
  });
}

export function restoreImageIndices(sourceRoot, liveRoot = document) {
  const sourceImages = sourceRoot.querySelectorAll('main img[data-image-index]');
  const scopes = new Set([...sourceImages]
    .map((img) => img.parentElement?.closest('[data-prose-index], [data-block-index]'))
    .filter(Boolean));

  scopes.forEach((sourceScope) => {
    const attr = sourceScope.hasAttribute('data-prose-index') ? 'data-prose-index' : 'data-block-index';
    const index = sourceScope.getAttribute(attr);
    if (parseIndex(index) == null) return;
    const liveScope = liveRoot.querySelector(`[${attr}="${index}"]`);
    if (!liveScope) return;
    const inScope = (img, scope) => img.parentElement?.closest('[data-prose-index], [data-block-index]') === scope;
    const originals = [...sourceScope.querySelectorAll('img[data-image-index]')]
      .filter((img) => inScope(img, sourceScope));
    const rendered = [...liveScope.querySelectorAll('img')]
      .filter((img) => inScope(img, liveScope));
    if (originals.length !== rendered.length) return;
    if (rendered.some((img, i) => img.hasAttribute('data-image-index')
      && img.getAttribute('data-image-index') !== originals[i].getAttribute('data-image-index'))) return;
    if (rendered.some((img, i) => img.hasAttribute('data-image-version')
      && img.getAttribute('data-image-version') !== originals[i].getAttribute('data-image-version'))) return;
    originals.forEach((img, i) => {
      rendered[i].setAttribute('data-image-index', img.getAttribute('data-image-index'));
      const version = img.getAttribute('data-image-version');
      if (version) rendered[i].setAttribute('data-image-version', version);
      else rendered[i].removeAttribute('data-image-version');
    });
  });
}

export function syncImageIndices(view, editorParent, offset, oldSize = 0, lengthDiff = 0) {
  const base = offset - 1;
  if (lengthDiff) {
    document.querySelectorAll('img[data-image-index]').forEach((img) => {
      if (editorParent.contains(img)) return;
      const index = parseIndex(img.getAttribute('data-image-index'));
      if (index != null && index >= base + oldSize) {
        img.setAttribute('data-image-index', index + lengthDiff);
      }
    });
  }

  view.dom.querySelectorAll('img').forEach((img) => {
    try {
      const pos = view.posAtDOM(img, 0);
      if (view.state.doc.nodeAt(pos)?.type.name === 'image') {
        img.setAttribute('data-image-index', base + pos);
        const version = editorParent.getAttribute('data-image-version');
        if (version) img.setAttribute('data-image-version', version);
        else img.removeAttribute('data-image-version');
      } else {
        img.removeAttribute('data-image-index');
        img.removeAttribute('data-image-version');
      }
    } catch (error) {
      img.removeAttribute('data-image-index');
      img.removeAttribute('data-image-version');
      // eslint-disable-next-line no-console
      console.warn('Could not index edited image:', error);
    }
  });
}

export function setImageVersion(version, root = document) {
  if (typeof version !== 'string' || !version) {
    throw new Error('Image document version is missing');
  }
  root.querySelectorAll('img[data-image-index], .prosemirror-editor').forEach((el) => {
    el.setAttribute('data-image-version', version);
  });
}

export function applyImageVersionAck({ imageVersion, nodeUpdateId }, ctx, root = document) {
  if (nodeUpdateId == null || nodeUpdateId !== ctx.pendingNodeUpdateId) return false;
  setImageVersion(imageVersion, root);
  ctx.pendingNodeUpdateId = null;
  return true;
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

export function walkProsePositions(root, startPos, callbacks) {
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
