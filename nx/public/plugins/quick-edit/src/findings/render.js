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
// Figma "One element with multiple failures": a 3px outline with a 1.8px white ring inside it,
// and 28.8px corner buttons sitting 2.4px above the outline's outer edge.
const OUTLINE_WIDTH = 3;
const RING_WIDTH = 1.8;
const OUTLINE_EXTENT = OUTLINE_WIDTH + RING_WIDTH;
const BADGE_SIZE = 28.8;
const BADGE_GAP = 2.4;
const ICON_SIZE = 19.2;
const VIEWPORT_MARGIN = 2;
const EDGES = ['top', 'right', 'bottom', 'left'];

const CLOSE_CIRCLE_PATH = 'M11.06 10L13.28 7.78C13.57 7.487 13.57 7.013 13.28 6.72C12.99 6.427 12.51 6.427 12.22 6.72L10 8.939L7.78 6.72C7.49 6.427 7.01 6.427 6.72 6.72C6.43 7.013 6.43 7.487 6.72 7.78L8.94 10L6.72 12.22C6.43 12.513 6.43 12.987 6.72 13.28C6.87 13.427 7.06 13.5 7.25 13.5C7.44 13.5 7.63 13.427 7.78 13.28L10 11.061L12.22 13.28C12.37 13.427 12.56 13.5 12.75 13.5C12.94 13.5 13.13 13.427 13.28 13.28C13.57 12.987 13.57 12.513 13.28 12.22L11.06 10ZM10 18.75C5.17 18.75 1.25 14.825 1.25 10C1.25 5.175 5.17 1.25 10 1.25C14.83 1.25 18.75 5.175 18.75 10C18.75 14.825 14.83 18.75 10 18.75ZM10 2.75C6 2.75 2.75 6.002 2.75 10C2.75 13.998 6 17.25 10 17.25C14 17.25 17.25 13.998 17.25 10C17.25 6.002 14 2.75 10 2.75Z';
const INFO_CIRCLE_PATH = 'M10 18.75C5.177 18.75 1.25 14.825 1.25 10C1.25 5.175 5.177 1.25 10 1.25C14.833 1.25 18.75 5.175 18.75 10C18.75 14.825 14.833 18.75 10 18.75ZM10 2.75C6.01 2.75 2.75 6.002 2.75 10C2.75 13.998 6.01 17.25 10 17.25C14 17.25 17.25 13.998 17.25 10C17.25 6.002 14 2.75 10 2.75ZM10 5.26C10.229 5.252 10.458 5.334 10.625 5.49C10.958 5.854 10.958 6.41 10.625 6.775C10.458 6.934 10.24 7.019 10 7.01C9.771 7.02 9.542 6.93 9.375 6.763C9.208 6.595 9.125 6.369 9.125 6.135C9.115 5.9 9.198 5.67 9.354 5.496C9.531 5.331 9.76 5.246 10 5.26ZM10 15.062C9.594 15.062 9.25 14.727 9.25 14.312V9.478C9.25 9.063 9.594 8.728 10 8.728C10.417 8.728 10.75 9.063 10.75 9.478V14.312C10.75 14.727 10.417 15.062 10 15.062Z';

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
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', `${ICON_SIZE}`);
  svg.setAttribute('height', `${ICON_SIZE}`);
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

function badgeTop(rect) {
  const top = rect.top + window.scrollY - OUTLINE_EXTENT - BADGE_GAP - BADGE_SIZE;
  return Math.max(top, VIEWPORT_MARGIN);
}

function createBadge({ marker, rect, ctx }) {
  const badge = createButton({
    className: 'qe-finding-badge', label: 'Evaluation finding', id: marker.id, ctx,
  });
  if (typeof marker.badge === 'string' && marker.badge) {
    badge.textContent = marker.badge;
  } else {
    badge.append(createSvg(`<path fill="currentColor" d="${CLOSE_CIRCLE_PATH}"/>`));
  }
  badge.style.left = `${Math.max(rect.left + window.scrollX - OUTLINE_EXTENT, VIEWPORT_MARGIN)}px`;
  badge.style.top = `${badgeTop(rect)}px`;
  return badge;
}

function createInfo({ marker, rect, ctx }) {
  const info = createButton({
    className: 'qe-finding-info', label: 'Show finding details', id: marker.id, ctx,
  });
  info.append(createSvg(`<path fill="currentColor" d="${INFO_CIRCLE_PATH}"/>`));
  const maxLeft = document.documentElement.clientWidth + window.scrollX
    - BADGE_SIZE - VIEWPORT_MARGIN;
  const left = rect.right + window.scrollX + OUTLINE_EXTENT - BADGE_SIZE;
  info.style.left = `${Math.max(Math.min(left, maxLeft), VIEWPORT_MARGIN)}px`;
  info.style.top = `${badgeTop(rect)}px`;
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
