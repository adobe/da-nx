import { MESSAGE_TYPES } from '../../../../utils/message-types.js';
import { parseIndex, positionBox } from './utils.js';
import {
  findTextBlock,
  findBlock,
  findImageAtProseIndex,
  pictureSrc,
  srcPathsMatch,
  safeQuerySelectorAll,
  walkProsePositions,
} from './dom-index.js';

const OVERLAY_ID = 'qe-comment-overlay';

function blockClassFromAnchor(anchorText) {
  return String(anchorText || '').replace(/^block:\s*/, '').trim().split(/\s+/)[0] || '';
}

function findBlockByRange(from, to, root) {
  const rangeEnd = typeof to === 'number' && to > from ? to : from + 1;
  let best = null;
  let bestIndex = Infinity;
  root.querySelectorAll('[data-block-index]').forEach((el) => {
    const idx = parseIndex(el.getAttribute('data-block-index'));
    if (idx == null || idx < from || idx >= rangeEnd) return;
    if (idx < bestIndex) {
      bestIndex = idx;
      best = el;
    }
  });
  return best;
}

export function findBlockForMarker(marker, root = document) {
  const byRange = findBlockByRange(marker.from, marker.to, root);
  if (byRange) return byRange;

  const name = blockClassFromAnchor(marker.anchorText);
  if (!name) return null;
  const candidates = safeQuerySelectorAll(root, `div.${CSS.escape(name)}`);
  return candidates.length === 1 ? candidates[0] : null;
}

function buildRangeAtContentStart(block, contentStart, from, to) {
  let startNode = null;
  let startOffset = 0;
  let endNode = null;
  let endOffset = 0;
  let foundStart = false;
  let foundEnd = false;

  walkProsePositions(block, contentStart, {
    onText(node, pos, len) {
      if (!foundStart && from >= pos && from <= pos + len) {
        startNode = node;
        startOffset = from - pos;
        foundStart = true;
      }
      if (!foundEnd && to > pos && to <= pos + len) {
        endNode = node;
        endOffset = to - pos;
        foundEnd = true;
      }
    },
    onAtomic(el, pos) {
      const endPos = pos + 1;
      if (!foundStart && from >= pos && from <= endPos) {
        startNode = el.parentNode;
        startOffset = Array.from(startNode.childNodes).indexOf(el);
        foundStart = true;
      }
      if (!foundEnd && to > pos && to <= endPos) {
        endNode = el.parentNode;
        endOffset = Array.from(endNode.childNodes).indexOf(el) + 1;
        foundEnd = true;
      }
    },
  });

  if (!startNode || !endNode) return null;
  const range = document.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}

export function mapProseRangeToDomRange(block, blockProseIndex, from, to) {
  if (to - from <= 0) return null;
  return buildRangeAtContentStart(block, blockProseIndex, from, to);
}

export function findPictureForImageMarker(marker, root = document) {
  const byIndex = findImageAtProseIndex(marker.from, root);
  if (byIndex) return byIndex;

  const src = marker.imageSrc;
  if (!src) return null;

  const block = findBlock(marker.from, root) || findBlockForMarker(marker, root);
  const pool = block
    ? [...block.querySelectorAll('picture')]
    : [...root.querySelectorAll('picture')];
  const matches = pool.filter((pic) => srcPathsMatch(src, pictureSrc(pic)));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const indexed = matches.filter((pic) => pic.hasAttribute('data-prose-index'));
    if (indexed.length === 1) return indexed[0];
    const { from } = marker;
    const near = matches
      .map((pic) => ({ pic, idx: parseIndex(pic.getAttribute('data-prose-index')) }))
      .filter(({ idx }) => idx != null && Math.abs(idx - from) <= 2)
      .sort((a, b) => Math.abs(a.idx - from) - Math.abs(b.idx - from));
    if (near.length) return near[0].pic;
  }
  return matches[0] ?? null;
}

function getOverlay(root = document) {
  let overlay = root.getElementById(OVERLAY_ID);
  if (!overlay) {
    overlay = root.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'qe-comment-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    root.body.append(overlay);
  }
  return overlay;
}

function clearOverlay(root = document) {
  const overlay = root.getElementById(OVERLAY_ID);
  overlay?.replaceChildren();
}

function attachMarkerClick(el, threadId, ctx) {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctx.port?.postMessage({ type: MESSAGE_TYPES.COMMENT_MARKER_CLICK, payload: { threadId } });
  });
}

export function adjustTextHighlightRect(rect) {
  const insetTop = Math.min(6, Math.max(0, (rect.height - 16) / 2));
  return {
    left: rect.left,
    top: rect.top + insetTop,
    width: rect.width,
    height: Math.max(4, rect.height - insetTop),
  };
}

function applyAuthorColor(el, color) {
  if (!color) return;
  el.classList.add('is-authored');
  el.style.setProperty('--da-comment-color', color);
}

function createTextHighlightBox({
  threadId, isActive, rect, overlay, color,
}) {
  const box = document.createElement('div');
  box.className = `qe-comment-box qe-comment-box-text${isActive ? ' is-active' : ''}`;
  box.dataset.commentThread = threadId;
  box.setAttribute('aria-hidden', 'true');
  applyAuthorColor(box, color);
  positionBox(box, rect);
  overlay.appendChild(box);
  return box;
}

function createVisualHighlightBox({
  className, rect, overlay, isActive = false, color,
}) {
  const box = document.createElement('div');
  box.className = `qe-comment-box ${className}${isActive ? ' is-active' : ''}`;
  box.setAttribute('aria-hidden', 'true');
  applyAuthorColor(box, color);
  positionBox(box, rect);
  overlay.appendChild(box);
  return box;
}

const MARKER_SIZE = 14;
const BUBBLE_SIZE = 36;

function markerDotPagePosition(rect, placement = 'top-left', size = MARKER_SIZE) {
  const scrollLeft = window.scrollX;
  const scrollTop = window.scrollY;
  if (placement === 'center') {
    return {
      left: rect.left + (rect.width / 2) - (size / 2) + scrollLeft,
      top: rect.top + (rect.height / 2) - (size / 2) + scrollTop,
    };
  }
  if (placement === 'top-right') {
    return {
      left: rect.right - size + scrollLeft,
      top: rect.top + scrollTop,
    };
  }
  if (placement === 'text-start') {
    // Sit just above the first line so the bubble never covers the text.
    return {
      left: rect.left + scrollLeft,
      top: rect.top - size + 2 + scrollTop,
    };
  }
  return {
    left: rect.left + scrollLeft,
    top: rect.top + scrollTop,
  };
}

// The initials bubble replaces the plain dot for every anchor type: a small
// teardrop chip tinted with the author's color, showing their initials.
function createMarkerBubble({
  threadId, isActive, rect, overlay, ctx, placement = 'top-left', color, textColor, initials,
}) {
  const bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.className = `qe-comment-bubble${isActive ? ' is-active' : ''}`;
  bubble.dataset.commentThread = threadId;
  bubble.setAttribute('aria-label', 'Open comment');
  bubble.textContent = initials || '';
  if (color) bubble.style.setProperty('--da-comment-color', color);
  if (textColor) bubble.style.color = textColor;
  attachMarkerClick(bubble, threadId, ctx);
  overlay.appendChild(bubble);
  const size = bubble.getBoundingClientRect().width || BUBBLE_SIZE;
  const { left, top } = markerDotPagePosition(rect, placement, size);
  // Page coordinates (see positionBox) so the marker scrolls with its content.
  bubble.style.left = `${Math.max(left, 4)}px`;
  bubble.style.top = `${Math.max(top, 4)}px`;
}

function imageHighlightElement(image) {
  if (image.tagName !== 'PICTURE') return image;
  const img = image.querySelector('img');
  if (!img) return image;
  const imgRect = img.getBoundingClientRect();
  if (imgRect.width || imgRect.height) return img;
  const pictureRect = image.getBoundingClientRect();
  if (pictureRect.width || pictureRect.height) return image;
  return img;
}

function drawAnchorMarker({ marker, element, overlay, ctx, markerPlacement = 'top-left' }) {
  let rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    let parent = element.parentElement;
    while (parent && !rect.width && !rect.height) {
      rect = parent.getBoundingClientRect();
      parent = parent.parentElement;
    }
  }
  if (!rect.width && !rect.height) return;
  const isActive = marker.threadId === ctx.selectedThreadId;

  if (isActive) {
    createVisualHighlightBox({
      className: 'qe-comment-box-anchor-block', rect, overlay, isActive, color: marker.highlightColor,
    });
  }
  createMarkerBubble({
    threadId: marker.threadId,
    isActive,
    rect,
    overlay,
    ctx,
    placement: markerPlacement,
    color: marker.color,
    textColor: marker.textColor,
    initials: marker.initials,
  });
}

function drawTextHighlight({ marker, block, overlay, ctx }) {
  const blockIndex = parseIndex(block.getAttribute('data-prose-index'));
  if (blockIndex == null) return;
  const range = mapProseRangeToDomRange(block, blockIndex, marker.from, marker.to);
  if (!range) return;
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 || rect.height > 0);
  if (!rects.length) return;
  const isActive = marker.threadId === ctx.selectedThreadId;

  rects.forEach((rect) => {
    createTextHighlightBox({
      threadId: marker.threadId,
      isActive,
      rect: adjustTextHighlightRect(rect),
      overlay,
      color: marker.highlightColor,
    });
  });

  createMarkerBubble({
    threadId: marker.threadId,
    isActive,
    rect: rects[0],
    overlay,
    ctx,
    placement: 'text-start',
    color: marker.color,
    textColor: marker.textColor,
    initials: marker.initials,
  });
}

function drawMarker(marker, root, overlay, ctx) {
  if (marker.anchorType === 'table') {
    const block = findBlockForMarker(marker, root);
    if (!block) return;
    drawAnchorMarker({
      marker, element: block, overlay, ctx, markerPlacement: 'top-right',
    });
    return;
  }

  if (marker.anchorType === 'image') {
    const image = findPictureForImageMarker(marker, root);
    if (!image) return;
    drawAnchorMarker({
      marker,
      element: imageHighlightElement(image),
      overlay,
      ctx,
      markerPlacement: 'center',
    });
    return;
  }
  const block = findTextBlock(marker.from, root);
  if (!block) return;
  drawTextHighlight({ marker, block, overlay, ctx });
}

const MARKER_RENDER_ORDER = { table: 0, image: 1, text: 2 };

export function sortMarkersForRender(markers) {
  return markers.slice().sort((a, b) => {
    const layerA = MARKER_RENDER_ORDER[a.anchorType] ?? 1;
    const layerB = MARKER_RENDER_ORDER[b.anchorType] ?? 1;
    return layerA - layerB;
  });
}

function textHighlightThreadAtPoint(x, y, root = document) {
  const overlay = root.getElementById(OVERLAY_ID);
  if (!overlay) return null;
  const hit = [...overlay.querySelectorAll('.qe-comment-box-text[data-comment-thread]')]
    .find((box) => {
      const r = box.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  return hit?.dataset.commentThread ?? null;
}

function setupCommentClicks(ctx) {
  if (ctx.commentClickListener) return;
  ctx.commentClickListener = (event) => {
    const threadId = textHighlightThreadAtPoint(event.clientX, event.clientY);
    if (threadId) {
      ctx.port?.postMessage({ type: MESSAGE_TYPES.COMMENT_MARKER_CLICK, payload: { threadId } });
      return;
    }
    if (!ctx.selectedThreadId) return;
    if (event.target.closest('.qe-comment-box, .qe-comment-marker, .qe-comment-bubble')) return;
    ctx.port?.postMessage({ type: MESSAGE_TYPES.COMMENT_MARKER_CLEAR });
  };
  document.addEventListener('click', ctx.commentClickListener);
}

function renderCommentMarkers(ctx, root = document) {
  clearOverlay(root);
  const markers = ctx.commentMarkers || [];
  if (!markers.length) return;
  const overlay = getOverlay(root);
  sortMarkersForRender(markers).forEach((marker) => {
    try {
      drawMarker(marker, root, overlay, ctx);
    } catch (err) {
      console.warn('[comments] failed to draw marker', marker?.threadId, err);
    }
  });
}

let repositionScheduled = false;
const overlayListenerContexts = new WeakSet();

export function scheduleCommentMarkerLayout(ctx, root = document) {
  if (!ctx.commentMarkers?.length) return;

  const run = () => {
    if (ctx.commentMarkers?.length) renderCommentMarkers(ctx, root);
  };

  document.fonts?.ready?.then(() => {
    requestAnimationFrame(() => requestAnimationFrame(run));
  });

  if (document.readyState !== 'complete') {
    window.addEventListener('load', run, { once: true });
  }
}

export function applyCommentMarkers(ctx, root = document) {
  if (!ctx.commentMarkers?.length) {
    clearOverlay(root);
    return;
  }
  if (!overlayListenerContexts.has(ctx)) {
    overlayListenerContexts.add(ctx);
    setupCommentClicks(ctx);
    const handler = () => {
      if (repositionScheduled) return;
      repositionScheduled = true;
      requestAnimationFrame(() => {
        repositionScheduled = false;
        if (ctx.commentMarkers?.length) renderCommentMarkers(ctx, root);
      });
    };
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    if (typeof ResizeObserver !== 'undefined') {
      ctx.commentResizeObserver = new ResizeObserver(handler);
      ctx.commentResizeObserver.observe(root.documentElement);
      const main = root.querySelector('main');
      if (main) ctx.commentResizeObserver.observe(main);
    }
  }
  renderCommentMarkers(ctx, root);
  scheduleCommentMarkerLayout(ctx, root);
}

function normalizeMarkers(data) {
  if (Array.isArray(data?.markers)) return data.markers;
  if (Array.isArray(data)) return data;
  return [];
}

export function setCommentMarkers(data, ctx) {
  ctx.commentMarkers = normalizeMarkers(data);
  if (data && !Array.isArray(data) && 'selectedThreadId' in data) {
    ctx.selectedThreadId = data.selectedThreadId;
  }
  applyCommentMarkers(ctx);
}

let scrollRetryTimer = null;

function findScrollTarget(proseIndex, root) {
  return root.querySelector(`[data-block-index="${proseIndex}"]`)
    || findPictureForImageMarker({ from: proseIndex, to: proseIndex + 1 }, root)
    || findTextBlock(proseIndex, root);
}

export function scrollToProseIndex(proseIndex, root = document) {
  if (scrollRetryTimer) {
    clearInterval(scrollRetryTimer);
    scrollRetryTimer = null;
  }

  const target = findScrollTarget(proseIndex, root);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  let attempts = 0;
  scrollRetryTimer = setInterval(() => {
    attempts += 1;
    const el = findScrollTarget(proseIndex, root);
    if (el || attempts >= 20) {
      clearInterval(scrollRetryTimer);
      scrollRetryTimer = null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 100);
}

export function setupCommentShortcut(ctx) {
  if (ctx.commentShortcutListener) return;
  ctx.commentShortcutListener = (event) => {
    const isShortcut = (event.metaKey || event.ctrlKey) && event.altKey && event.code === 'KeyM';
    if (!isShortcut) return;
    event.preventDefault();
    ctx.port?.postMessage({ type: MESSAGE_TYPES.COMMENT_SHORTCUT });
  };
  document.addEventListener('keydown', ctx.commentShortcutListener);
}
