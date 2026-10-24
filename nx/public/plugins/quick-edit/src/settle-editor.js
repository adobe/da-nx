import { parseIcons, removeEditorArtifacts } from 'https://da.live/blocks/shared/prose-cleanup.js';
import { setRemoteCursors } from './cursors.js';
import { setupImageDropListeners } from './images.js';

const COPIED_ATTRS = ['data-prose-index', 'data-cursor-remote', 'data-cursor-remote-color'];
const TRANSIENT_CLASSES = ['ProseMirror-selectednode', 'image-uploading', 'image-drop-target'];

const isActive = (view) => view.hasFocus() && document.hasFocus();

// Mirrors the attributes, so ones removed while decorating (e.g. a remote cursor that
// moved away) don't survive on the detached copy.
function copyAttrs(from, to) {
  COPIED_ATTRS.forEach((attr) => {
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

// Swaps an inactive inline editor for page-decorated static DOM (buttons, icons, ...).
export async function settleEditor(editorParent, ctx) {
  // Without partialReload (e.g. a site loader calling loadPage) a single element can't be
  // decorated, so static markup would only lose things like `:icon:` text; keep the editor.
  if (!ctx.partialReload || !editorParent?.isConnected) return;
  cancelScheduledSettle(editorParent);
  const { view } = editorParent;
  if (!view || isActive(view)) return;
  const token = {};
  editorParent.settleToken = token;
  const { doc } = view.state;
  const el = toStaticElement(editorParent);
  if (!el) return;
  const decorated = await decorate(el, ctx);
  const stale = editorParent.settleToken !== token || view.state.doc !== doc;
  if (stale || !editorParent.isConnected || isActive(view)) return;
  copyAttrs(editorParent, decorated);
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
