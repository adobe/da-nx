import { parseIcons, removeEditorArtifacts } from 'https://da.live/blocks/shared/prose-cleanup.js';
import { setRemoteCursors } from './cursors.js';
import { setupImageDropListeners } from './images.js';
import { MESSAGE_TYPES } from '../../../../utils/message-types.js';

const COPIED_ATTRS = ['data-prose-index', 'data-cursor-remote', 'data-cursor-remote-color'];
const INDEX_ATTRS = ['data-prose-index', 'data-image-index', 'data-block-index'];
const TRANSIENT_CLASSES = ['ProseMirror-selectednode', 'image-uploading', 'image-drop-target'];

const isActive = (view) => view.hasFocus() && document.hasFocus();

// Mirrors the attributes, so ones removed while decorating (e.g. a remote cursor that
// moved away) don't survive on the detached copy.
function copyAttrs(from, to, attrs = COPIED_ATTRS) {
  attrs.forEach((attr) => {
    if (from.hasAttribute(attr)) to.setAttribute(attr, from.getAttribute(attr));
    else to.removeAttribute(attr);
  });
}

export function toStaticElement(editorParent) {
  const el = editorParent.view?.dom.firstElementChild?.cloneNode(true);
  if (!el) return null;
  removeEditorArtifacts(el);
  el.querySelectorAll('[contenteditable]').forEach((node) => node.removeAttribute('contenteditable'));
  el.querySelectorAll(TRANSIENT_CLASSES.map((name) => `.${name}`).join(', '))
    .forEach((node) => node.classList.remove(...TRANSIENT_CLASSES));
  parseIcons(el);
  copyAttrs(editorParent, el);
  return el;
}

// Uploads started on an image inside the editor would otherwise finish on the
// destroyed editor DOM; move them to the matching image of the static element.
function adoptPendingUploads(editorParent, el, ctx) {
  ctx.pendingImageReplacements?.forEach((pending) => {
    if (!editorParent.contains(pending.img)) return;
    const index = pending.img.getAttribute('data-image-index');
    const img = index && el.querySelector(`img[data-image-index="${index}"]`);
    if (!img) return;
    pending.img = img;
    pending.picture = img.closest('picture');
    pending.picture?.classList.add('image-uploading');
  });
}

async function decorate(el, ctx) {
  try {
    const decorated = await ctx.reload(document, { type: 'element', el });
    return decorated instanceof Element ? decorated : el;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[quick-edit] reloading the edited element failed', error);
    return el;
  }
}

// Host edits wait for a short pause; a collaborator's edits settle at most this long after
// the first one, so continuous remote typing is still decorated without one per keystroke.
const SETTLE_DELAYS = { local: 500, remote: 3000 };

function cancelScheduledSettle(editorParent) {
  clearTimeout(editorParent.settleTimer);
  editorParent.settleTimer = null;
}

// The site's `reloadBlocks` opt-in: block names, or a predicate receiving the block element.
export function getReloadBlock(editorParent, { reloadBlocks } = {}) {
  if (!reloadBlocks) return null;
  const block = editorParent.closest('[data-block-index]');
  if (!block) return null;
  const matches = typeof reloadBlocks === 'function'
    ? reloadBlocks(block)
    : [...reloadBlocks].includes(block.classList[0]);
  return matches ? block : null;
}

// The block's undecorated source lives in the host, which answers with a block-scoped SET_BODY.
function requestBlockReload(block, ctx) {
  const blockIndex = Number(block.getAttribute('data-block-index'));
  if (!Number.isSafeInteger(blockIndex) || !ctx.port) return false;
  ctx.port.postMessage({ type: MESSAGE_TYPES.RELOAD, payload: { blockIndex } });
  return true;
}

// Swaps an inactive inline editor for page-decorated static DOM (buttons, icons, ...).
export async function settleEditor(editorParent, ctx) {
  // Without partialReload (e.g. a site loader calling loadPage) a single element can't be
  // decorated, so static markup would only lose things like `:icon:` text; keep the editor.
  if (!ctx.partialReload || !editorParent?.isConnected) return;
  cancelScheduledSettle(editorParent);
  const { view } = editorParent;
  if (!view || isActive(view)) return;
  const block = getReloadBlock(editorParent, ctx);
  if (block && requestBlockReload(block, ctx)) return;
  const token = {};
  editorParent.settleToken = token;
  const { doc } = view.state;
  const el = toStaticElement(editorParent);
  if (!el) return;
  // Keep the live nodes keyed by their pre-decoration indices, even if those indices shift.
  const indexedDescendants = INDEX_ATTRS.map((attr) => ({
    attr,
    nodes: new Map([...view.dom.querySelectorAll(`[${attr}]`)]
      .map((node) => [node.getAttribute(attr), node])),
  }));
  const decorated = await decorate(el, ctx);
  const stale = editorParent.settleToken !== token || view.state.doc !== doc;
  if (stale || !editorParent.isConnected || isActive(view)) return;
  copyAttrs(editorParent, decorated);
  indexedDescendants.forEach(({ attr, nodes }) => {
    decorated.querySelectorAll(`[${attr}]`).forEach((node) => {
      const live = nodes.get(node.getAttribute(attr));
      if (live) {
        copyAttrs(live, node, attr === 'data-image-index'
          ? [attr, 'data-image-version'] : [attr]);
      }
    });
  });
  adoptPendingUploads(editorParent, decorated, ctx);
  editorParent.replaceWith(decorated);
  view.destroy();
  // Listeners don't survive cloning, so images in the static element need new ones.
  if (!ctx.readOnly) setupImageDropListeners(ctx, decorated);
  setRemoteCursors();
}

// Content is already shown; only the decorate is deferred. A remote edit never postpones a
// pending settle, while a local edit restarts it.
export function scheduleSettle(editorParent, ctx, origin) {
  if (!ctx.partialReload) return;
  const remote = origin === 'remote';
  if (remote && editorParent.settleTimer) return;
  cancelScheduledSettle(editorParent);
  editorParent.settleTimer = setTimeout(() => {
    editorParent.settleTimer = null;
    settleEditor(editorParent, ctx);
  }, remote ? SETTLE_DELAYS.remote : SETTLE_DELAYS.local);
}

// Editors with a scheduled settle are still being edited from the host; they settle on their own.
export function settleOtherEditors(current, ctx) {
  document.querySelectorAll('.prosemirror-editor').forEach((editorParent) => {
    if (editorParent !== current && !editorParent.settleTimer) settleEditor(editorParent, ctx);
  });
}
