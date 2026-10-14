import { MESSAGE_TYPES } from '../../../../../utils/message-types.js';
import { findTextBlock } from '../dom-index.js';
import { clearOverlayById, getOverlayById, visibleRect } from '../overlay.js';
import { positionBox } from '../utils.js';
import {
  findBlockForMarker,
  findPictureForImageMarker,
  imageHighlightElement,
} from '../comments/geometry.js';

export const FINDING_OVERLAY_ID = 'qe-finding-overlay';

const SVG_NS = 'http://www.w3.org/2000/svg';
const BADGE_SIZE = 24;
const BADGE_OVERHANG = BADGE_SIZE / 2;
const VIEWPORT_MARGIN = 2;
const EDGES = ['top', 'right', 'bottom', 'left'];

const SPARKLE_PATH = 'M8 1.5l1.6 4.4 4.4 1.6-4.4 1.6L8 13.5l-1.6-4.4L2 7.5l4.4-1.6z';

export function getFindingOverlay(root = document) {
  return getOverlayById({ id: FINDING_OVERLAY_ID, className: FINDING_OVERLAY_ID, root });
}

export function clearFindingOverlay(root = document) {
  clearOverlayById(FINDING_OVERLAY_ID, root);
}

export function findFindingElement(marker, root = document) {
  if (marker.anchorType === 'table') return findBlockForMarker(marker, root);
  if (marker.anchorType === 'image') {
    const picture = findPictureForImageMarker(marker, root);
    return picture ? imageHighlightElement(picture) : null;
  }
  return findTextBlock(marker.from, root);
}

function createSvg(content) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = content;
  return svg;
}

function attachClick(el, id, ctx) {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    ctx.port?.postMessage({ type: MESSAGE_TYPES.FINDING_MARKER_CLICK, payload: { id } });
  });
}

function createButton({ className, label, id, ctx }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.findingId = id;
  button.tabIndex = -1;
  button.setAttribute('aria-label', label);
  attachClick(button, id, ctx);
  return button;
}

function createBox({ id, rect, ctx }) {
  const box = document.createElement('div');
  box.className = 'qe-finding-box';
  box.dataset.findingId = id;
  positionBox(box, rect);
  EDGES.forEach((edge) => {
    const strip = document.createElement('div');
    strip.className = `qe-finding-edge qe-finding-edge-${edge}`;
    attachClick(strip, id, ctx);
    box.append(strip);
  });
  return box;
}

function createBadge({ marker, rect, ctx }) {
  const badge = createButton({
    className: 'qe-finding-badge', label: 'Evaluation finding', id: marker.id, ctx,
  });
  if (typeof marker.badge === 'string' && marker.badge) {
    badge.textContent = marker.badge;
  } else {
    badge.append(createSvg(`<path fill="currentColor" d="${SPARKLE_PATH}"/>`));
  }
  badge.style.left = `${Math.max(rect.left + window.scrollX - BADGE_OVERHANG, VIEWPORT_MARGIN)}px`;
  badge.style.top = `${Math.max(rect.top + window.scrollY - BADGE_OVERHANG, VIEWPORT_MARGIN)}px`;
  return badge;
}

function createInfo({ marker, rect, ctx }) {
  const info = createButton({
    className: 'qe-finding-info', label: 'Show finding details', id: marker.id, ctx,
  });
  info.append(createSvg('<circle cx="8" cy="4.6" r="1.1" fill="currentColor"/><rect x="7" y="6.8" width="2" height="5.4" rx="1" fill="currentColor"/>'));
  const maxLeft = document.documentElement.clientWidth + window.scrollX
    - BADGE_SIZE - VIEWPORT_MARGIN;
  const left = rect.right + window.scrollX - BADGE_OVERHANG;
  info.style.left = `${Math.max(Math.min(left, maxLeft), VIEWPORT_MARGIN)}px`;
  info.style.top = `${Math.max(rect.top + window.scrollY - BADGE_OVERHANG, VIEWPORT_MARGIN)}px`;
  return info;
}

function drawMarker({ marker, root, overlay, ctx }) {
  const element = findFindingElement(marker, root);
  if (!element) return null;
  const rect = visibleRect(element);
  if (!rect.width && !rect.height) return null;
  overlay.append(
    createBox({ id: marker.id, rect, ctx }),
    createBadge({ marker, rect, ctx }),
    createInfo({ marker, rect, ctx }),
  );
  return { element, rect };
}

// v1 draws only the selected marker. Returns what was drawn for it so the caller can report
// layout: { id, element, rect } (element/rect null when it can't be located), or null when
// there is nothing selected.
export function renderFindingMarkers(ctx, root = document) {
  clearFindingOverlay(root);
  const markers = ctx.findingMarkers || [];
  const marker = markers.find((m) => m?.id != null && m.id === ctx.selectedFindingId);
  if (!marker) return null;
  const overlay = getFindingOverlay(root);
  try {
    const drawn = drawMarker({ marker, root, overlay, ctx });
    return { id: marker.id, element: drawn?.element ?? null, rect: drawn?.rect ?? null };
  } catch (err) {
    console.warn('[findings] failed to draw marker', marker.id, err);
    return { id: marker.id, element: null, rect: null };
  }
}
