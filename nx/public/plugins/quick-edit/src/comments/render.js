import { MESSAGE_TYPES } from '../../../../../utils/message-types.js';
import { parseIndex, positionBox } from '../utils.js';
import { findTextBlock } from '../dom-index.js';
import {
  findBlockForMarker,
  findPictureForImageMarker,
  mapProseRangeToDomRange,
  adjustTextHighlightRect,
  markerDotPagePosition,
  imageHighlightElement,
} from './geometry.js';

export const OVERLAY_ID = 'qe-comment-overlay';

const BUBBLE_SIZE = 36;
const MARKER_RENDER_ORDER = { table: 0, image: 1, text: 2 };

export function getOverlay(root = document) {
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

export function clearOverlay(root = document) {
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

function createMarkerBubble({
  threadId, isActive, rect, overlay, ctx, placement = 'top-left', color, textColor, initials,
}) {
  const bubble = document.createElement('button');
  bubble.type = 'button';
  bubble.className = `qe-comment-bubble${isActive ? ' is-active' : ''}`;
  bubble.dataset.commentThread = threadId;
  bubble.tabIndex = -1;
  bubble.textContent = initials || '';
  if (color) bubble.style.setProperty('--da-comment-color', color);
  if (textColor) bubble.style.color = textColor;
  attachMarkerClick(bubble, threadId, ctx);
  overlay.appendChild(bubble);
  const size = bubble.getBoundingClientRect().width || BUBBLE_SIZE;
  const { left, top } = markerDotPagePosition(rect, placement, size);
  bubble.style.left = `${Math.max(left, 4)}px`;
  bubble.style.top = `${Math.max(top, 4)}px`;
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

export function sortMarkersForRender(markers) {
  return markers.slice().sort((a, b) => {
    const layerA = MARKER_RENDER_ORDER[a.anchorType] ?? 1;
    const layerB = MARKER_RENDER_ORDER[b.anchorType] ?? 1;
    return layerA - layerB;
  });
}

export function textHighlightThreadAtPoint(x, y, root = document) {
  const overlay = root.getElementById(OVERLAY_ID);
  if (!overlay) return null;
  const hit = [...overlay.querySelectorAll('.qe-comment-box-text[data-comment-thread]')]
    .find((box) => {
      const r = box.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    });
  return hit?.dataset.commentThread ?? null;
}

export function renderCommentMarkers(ctx, root = document) {
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
