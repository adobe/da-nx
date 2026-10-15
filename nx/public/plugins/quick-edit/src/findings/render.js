import { MESSAGE_TYPES } from '../../../../../utils/message-types.js';
import {
  elementContainsAnchor,
  findBlock,
  findElementByAnchorText,
  findTextBlock,
  normalizeAnchorText,
} from '../dom-index.js';
import { clearOverlayById, getOverlayById, visibleRect } from '../overlay.js';
import { parseIndex, positionBox } from '../utils.js';
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

// Decorated EDS blocks drop data-prose-index from links/buttons, so the nearest-lower index
// can be a neighbouring element. When the host sends anchorText, verify the candidate holds
// that text and otherwise search for the element that does: block first, then the document.
// A nearest-lower guess that can't be verified is dropped (null) rather than mis-highlighted.
function findTextMarkerElement(marker, root) {
  const candidate = findTextBlock(marker.from, root);
  const anchor = normalizeAnchorText(marker.anchorText);
  if (!anchor) return candidate;

  const exact = !!candidate && parseIndex(candidate.getAttribute('data-prose-index')) === marker.from;
  if (exact && elementContainsAnchor(candidate, anchor)) return candidate;

  const block = findBlock(marker.from, root);
  const scopes = [block, root.querySelector?.('main') ?? root.body ?? root];
  const found = scopes.reduce((hit, scope) => hit
    ?? findElementByAnchorText({ anchorText: anchor, scope, after: candidate }), null);
  return found ?? (exact ? candidate : null);
}

export function findFindingElement(marker, root = document) {
  if (marker.anchorType === 'table') return findBlockForMarker(marker, root);
  if (marker.anchorType === 'image') {
    const picture = findPictureForImageMarker(marker, root);
    return picture ? imageHighlightElement(picture) : null;
  }
  return findTextMarkerElement(marker, root);
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
