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

// The anchored block node spans the PM range [from, to). getInstrumentedHTML
// stamps data-block-index = posAtDOM(node, 0), i.e. the node's content-start
// (from + 1), which is the unique block index inside that range. Selecting the
// smallest in-range index returns the outermost (anchored) block when blocks
// are nested. Because the range comes from a Yjs relative position, this is an
// exact, per-instance match — duplicate block types are never confused.
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
  // Primary path: exact position match via the instrumented data-block-index.
  // This is unambiguous for duplicate blocks and requires no name heuristics.
  const byRange = findBlockByRange(marker.from, marker.to, root);
  if (byRange) return byRange;

  // Fallback for content that was not instrumented with a block index. Only
  // resolve when the block name is unambiguous — never guess between duplicates,
  // since marking the wrong instance is worse than drawing no marker.
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

// Map an exact PM range [from, to) to a DOM Range by walking the block's text
// from its content-start (data-prose-index === posAtDOM(element, 0)). This is
// the layout-mode equivalent of doc-mode's position-based decorations: it is
// fully deterministic and resolves to the exact characters at those PM offsets,
// never a text search or "best match". The block is already the correct one
// (selected by position), so this can never resolve to another instance.
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
    ctx.port?.postMessage({ type: MESSAGE_TYPES.COMMENT_MARKER_CLICK, threadId });
  });
}

/** Client rects include line-height leading; nudge highlights down onto the text body. */
export function adjustTextHighlightRect(rect) {
  const insetTop = Math.min(6, Math.max(0, (rect.height - 16) / 2));
  return {
    left: rect.left,
    top: rect.top + insetTop,
    width: rect.width,
    height: Math.max(4, rect.height - insetTop),
  };
}

// Text highlights are visual only (pointer-events: none in CSS) so the
// underlying text stays editable; the click target is resolved by hit-testing
// these rects in the document click handler (see setupCommentClicks).
// A commented element gets its author's color (toned down in CSS). Setting the
// custom property + is-authored class lets CSS derive the fill/border/outline
// from one color, falling back to the yellow theme when no color is provided.
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
  bubble.className = `qe-comment-bubble${isActive ? ' is-active' : ''}${placement === 'top-right' ? ' is-top-right' : ''}`;
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

// A <picture> is an inline container whose box includes line-box leading, which
// offsets the highlight from the rendered image. Measure the inner <img> (its
// exact replaced-content box) when it has real dimensions; fall back to the
// picture when the image has no layout box yet (e.g. not loaded).
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
  // Outline commented blocks/images only while selected — the initials bubble is
  // prominent enough to signal an annotation at rest. Images use the same
  // outline + corner marker as blocks.
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
  // Exact PM-position mapping only — no anchor-text search, so a comment never
  // jumps to a different instance of the same word (matches doc-mode behaviour).
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
  // One initials bubble per text comment, anchored just above the first line.
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

/** Block outlines are drawn first so nested text/image highlights stay clickable on top. */
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
      ctx.port?.postMessage({ type: MESSAGE_TYPES.COMMENT_MARKER_CLICK, threadId });
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
      // Defense in depth: one malformed marker must not abort the rest.
      // eslint-disable-next-line no-console
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

  clearTimeout(ctx.layoutStableTimer);
  ctx.layoutStableTimer = setTimeout(run, 400);
  ctx.layoutSettleTimers?.forEach(clearTimeout);
  ctx.layoutSettleTimers = [1600].map((delay) => setTimeout(run, delay));

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

    window.addEventListener('animationend', handler, true);
    window.addEventListener('transitionend', handler, true);
    setTimeout(() => {
      window.removeEventListener('animationend', handler, true);
      window.removeEventListener('transitionend', handler, true);
    }, 6000);
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

export function scrollToProseIndex(proseIndex, root = document) {
  const tableBlock = root.querySelector(`[data-block-index="${proseIndex}"]`);
  if (tableBlock) {
    tableBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const image = findPictureForImageMarker({ from: proseIndex, to: proseIndex + 1 }, root);
  if (image) {
    image.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  findTextBlock(proseIndex, root)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
