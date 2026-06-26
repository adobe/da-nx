const OVERLAY_ID = 'qe-comment-overlay';
const ATOMIC_TAGS = new Set(['br', 'img', 'picture']);

function parseIndex(value) {
  const idx = parseInt(value, 10);
  return Number.isNaN(idx) ? null : idx;
}

// Block names come from author-authored document content, so they are not
// guaranteed to be valid CSS class selectors (e.g. a name starting with a
// digit). Escape them and swallow selector errors so a single exotic name
// can never throw and abort marker rendering.
function safeQuerySelectorAll(root, selector) {
  try {
    return [...root.querySelectorAll(selector)];
  } catch {
    return [];
  }
}

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

export function findTextBlock(from, root = document) {
  let best = null;
  let bestIndex = -1;
  root.querySelectorAll('[data-prose-index]').forEach((el) => {
    const idx = parseIndex(el.getAttribute('data-prose-index'));
    if (idx == null || idx > from) return;
    if (idx > bestIndex) {
      bestIndex = idx;
      best = el;
    }
  });
  return best;
}

export function findBlock(from, root = document) {
  const exact = root.querySelector(`[data-block-index="${from}"]`);
  if (exact) return exact;
  let best = null;
  let bestIndex = -1;
  root.querySelectorAll('[data-block-index]').forEach((el) => {
    const idx = parseIndex(el.getAttribute('data-block-index'));
    if (idx == null || idx > from) return;
    if (idx > bestIndex) {
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

// Safety net: re-apply data-block-index to any block that lost it during
// loadPage() decoration. A no-op when the attributes are already intact.
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
      // Source blocks are visited in document order and each live block is
      // claimed once, so duplicate block types map to their indices in order.
      live = safeQuerySelectorAll(liveRoot, `div.${CSS.escape(name)}`)
        .find((el) => !claimed.has(el));
    }
    if (live) {
      live.setAttribute('data-block-index', index);
      claimed.add(live);
    }
  });
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
    if (el.id === OVERLAY_ID || el.closest(`#${OVERLAY_ID}`)) return;
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

function findImageAtProseIndex(from, root = document) {
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
    ctx.port?.postMessage({ type: 'comment-marker-click', threadId });
  });
}

function positionBox(box, rect) {
  // Boxes are position: absolute in document space, so convert the viewport
  // rect to page coordinates. This keeps them anchored to content through
  // scrolling even when a transformed ancestor would break position: fixed.
  box.style.left = `${rect.left + window.scrollX}px`;
  box.style.top = `${rect.top + window.scrollY}px`;
  box.style.width = `${Math.max(rect.width, 1)}px`;
  box.style.height = `${Math.max(rect.height, 1)}px`;
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
function createTextHighlightBox({ threadId, isActive, rect, overlay }) {
  const box = document.createElement('div');
  box.className = `qe-comment-box qe-comment-box-text${isActive ? ' is-active' : ''}`;
  box.dataset.commentThread = threadId;
  box.setAttribute('aria-hidden', 'true');
  positionBox(box, rect);
  overlay.appendChild(box);
  return box;
}

function createVisualHighlightBox({ className, rect, overlay }) {
  const box = document.createElement('div');
  box.className = `qe-comment-box ${className} is-active`;
  box.setAttribute('aria-hidden', 'true');
  positionBox(box, rect);
  overlay.appendChild(box);
  return box;
}

function createMarkerDot({ threadId, isActive, rect, overlay, ctx }) {
  const dot = document.createElement('button');
  dot.type = 'button';
  dot.className = `qe-comment-marker${isActive ? ' is-active' : ''}`;
  dot.dataset.commentThread = threadId;
  dot.setAttribute('aria-label', 'Open comment');
  // Page coordinates (see positionBox) so the marker scrolls with its content.
  dot.style.left = `${Math.max(rect.left + window.scrollX, 4)}px`;
  dot.style.top = `${Math.max(rect.top + window.scrollY, 4)}px`;
  attachMarkerClick(dot, threadId, ctx);
  overlay.appendChild(dot);
}

// A <picture> is an inline container whose box includes line-box leading, which
// offsets the highlight from the rendered image. Measure the inner <img> (its
// exact replaced-content box) when it has real dimensions; fall back to the
// picture when the image has no layout box yet (e.g. not loaded).
function imageHighlightElement(image) {
  if (image.tagName !== 'PICTURE') return image;
  const img = image.querySelector('img');
  if (!img) return image;
  const rect = img.getBoundingClientRect();
  return rect.width || rect.height ? img : image;
}

function drawAnchorMarker({ marker, element, overlay, ctx }) {
  const rect = element.getBoundingClientRect();
  if (!rect.width && !rect.height) return;
  const isActive = marker.threadId === ctx.selectedThreadId;
  if (isActive) {
    // Images use the same outline + corner marker as blocks.
    createVisualHighlightBox({ className: 'qe-comment-box-anchor-block', rect, overlay });
  }
  createMarkerDot({ threadId: marker.threadId, isActive, rect, overlay, ctx });
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
    });
  });
}

function drawMarker(marker, root, overlay, ctx) {
  if (marker.anchorType === 'table') {
    const block = findBlockForMarker(marker, root);
    if (!block) return;
    drawAnchorMarker({ marker, element: block, overlay, ctx });
    return;
  }

  if (marker.anchorType === 'image') {
    const image = findImageAtProseIndex(marker.from, root);
    if (!image) return;
    drawAnchorMarker({ marker, element: imageHighlightElement(image), overlay, ctx });
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
    // Text highlights don't intercept the pointer (so the text stays editable),
    // so resolve a clicked text comment by hit-testing the highlight rects. The
    // same click still falls through to place the caret in the editable text.
    const threadId = textHighlightThreadAtPoint(event.clientX, event.clientY);
    if (threadId) {
      ctx.port?.postMessage({ type: 'comment-marker-click', threadId });
      return;
    }
    if (!ctx.selectedThreadId) return;
    if (event.target.closest('.qe-comment-box, .qe-comment-marker')) return;
    ctx.port?.postMessage({ type: 'comment-marker-clear' });
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

  // Staggered passes catch layout that settles after first paint (web fonts,
  // lazy images, and reveal animations — including JS-driven ones that emit no
  // transitionend/animationend event).
  clearTimeout(ctx.layoutStableTimer);
  ctx.layoutStableTimer = setTimeout(run, 150);
  ctx.layoutSettleTimers?.forEach(clearTimeout);
  ctx.layoutSettleTimers = [400, 900, 1600].map((delay) => setTimeout(run, delay));

  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  fontsReady.then(() => {
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
    // Reveal animations (fade/slide-in on blocks/sections) shift element
    // positions after markers are first placed, so highlights land in the wrong
    // spot until a scroll triggers a reposition. Reposition when those finish.
    // Only listen for an initial settle window to avoid reacting to ongoing
    // hover/UI transitions for the life of the page.
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
  const image = findImageAtProseIndex(proseIndex, root);
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
    ctx.port?.postMessage({ type: 'comment-shortcut' });
  };
  document.addEventListener('keydown', ctx.commentShortcutListener);
}
