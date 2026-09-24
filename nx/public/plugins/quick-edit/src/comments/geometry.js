import { parseIndex } from '../utils.js';
import {
  findBlock,
  findImageAtProseIndex,
  pictureSrc,
  srcPathsMatch,
  safeQuerySelectorAll,
  walkProsePositions,
} from '../dom-index.js';

export const MARKER_SIZE = 14;

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

export function adjustTextHighlightRect(rect) {
  const insetTop = Math.min(6, Math.max(0, (rect.height - 16) / 2));
  return {
    left: rect.left,
    top: rect.top + insetTop,
    width: rect.width,
    height: Math.max(4, rect.height - insetTop),
  };
}

export function markerDotPagePosition(rect, placement = 'top-left', size = MARKER_SIZE) {
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

export function imageHighlightElement(image) {
  if (image.tagName !== 'PICTURE') return image;
  const img = image.querySelector('img');
  if (!img) return image;
  const imgRect = img.getBoundingClientRect();
  if (imgRect.width || imgRect.height) return img;
  const pictureRect = image.getBoundingClientRect();
  if (pictureRect.width || pictureRect.height) return image;
  return img;
}
