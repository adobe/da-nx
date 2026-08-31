import { MESSAGE_TYPES } from '../../../../../utils/message-types.js';
import { findTextBlock } from '../dom-index.js';
import { findPictureForImageMarker } from './geometry.js';
import {
  clearOverlay,
  renderCommentMarkers,
  textHighlightThreadAtPoint,
} from './render.js';

function setupCommentClicks(ctx) {
  if (ctx.commentClickListener) return;
  ctx.commentClickListener = (event) => {
    const threadId = textHighlightThreadAtPoint(event.clientX, event.clientY);
    if (threadId) {
      ctx.port?.postMessage({ type: MESSAGE_TYPES.COMMENT_MARKER_CLICK, payload: { threadId } });
      return;
    }
    if (!ctx.selectedThreadId) return;
    if (event.target.closest('.qe-comment-box, .qe-comment-bubble')) return;
    ctx.port?.postMessage({ type: MESSAGE_TYPES.COMMENT_MARKER_CLEAR });
  };
  document.addEventListener('click', ctx.commentClickListener);
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
