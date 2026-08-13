/* eslint-disable import/prefer-default-export */
import { getSchema } from 'https://da.live/deps/da-parser/dist/index.js';
import {
  EditorState, EditorView, TextSelection, Schema, DOMSerializer, DOMParser,
} from 'https://da.live/deps/da-y-wrapper/dist/index.js';
import {
  // showToolbar,
  hideToolbar,
  setCurrentEditorView,
  updateToolbarState,
  handleToolbarKeydown,
  positionToolbar,
} from './toolbar.js';
import { createSimpleKeymap } from './simple-keymap.js';
import { createImageWrapperPlugin } from './image-wrapper.js';
import { setupImageDropListeners } from './images.js';
import { setRemoteCursors } from './cursors.js';
import {
  isWrapperFreeType,
  decomposeBlockNode,
  composeBlockNode,
  toWrapperPos,
  blockSizeFromContentSize,
} from './inline-projection.js';
import { MESSAGE_TYPES } from '../../../../utils/message-types.js';

function marksEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((m, i) => m.eq(b[i]));
}

// Inline projection of the full da-parser schema: same marks + inline nodes, but a
// doc whose top node holds inline content directly. Lets an editor mount straight
// onto a <p>/<h2> (no wrapper), because the doc's DOM *is* the region element.
let inlineSchemaCache = null;
function getInlineSchema() {
  if (inlineSchemaCache) return inlineSchemaCache;
  const full = getSchema();
  const nodes = { doc: { content: 'inline*' } };
  full.spec.nodes.forEach((name, spec) => {
    if (name === 'doc') return;
    const groups = (spec.group || '').split(' ');
    if (name === 'text' || groups.includes('inline')) nodes[name] = spec;
  });
  inlineSchemaCache = new Schema({ nodes, marks: full.spec.marks });
  return inlineSchemaCache;
}

function updateInstrumentation(lengthDiff, offset) {
  const editableElements = document.querySelectorAll('[data-prose-index]');
  editableElements.forEach((element) => {
    const cursorValue = parseInt(element.getAttribute('data-prose-index'), 10);
    if (cursorValue > offset) {
      const newCursorValue = cursorValue + lengthDiff;
      element.setAttribute('data-prose-index', newCursorValue);
    }
    // update lengths where they're saved
    if (element.getAttribute('data-initial-length')) {
      element.setAttribute('data-initial-length', element.textContent.length);
    }
  });
}

// Serialize the editor's current content to the block node JSON the host expects.
// Inline editors re-wrap their inline content in the original block type/attrs;
// wrapper editors already have the block node as doc.firstChild.
function editorNodeJSON(view) {
  const meta = view.qeMeta;
  if (meta.mode === 'inline') {
    return composeBlockNode(meta.blockType, meta.blockAttrs, view.state.doc.toJSON().content || []);
  }
  return view.state.doc.firstChild.toJSON();
}

// nodeSize of the equivalent block, used for the data-prose-index shift math.
function editorBlockSize(state, meta) {
  if (meta.mode === 'inline') return blockSizeFromContentSize(state.doc.content.size);
  return state.doc.firstChild.nodeSize;
}

function handleTransaction(tr, ctx, editorView) {
  const meta = editorView.qeMeta;
  const numChanges = tr.steps.length;
  const currentCursorOffset = parseInt(meta.indexEl.getAttribute('data-prose-index'), 10);
  const oldBlockSize = editorBlockSize(editorView.state, meta);
  const oldSel = editorView.state.selection;
  const oldStoredMarks = editorView.state.storedMarks;
  const newState = editorView.state.apply(tr);
  editorView.updateState(newState);
  updateInstrumentation(editorBlockSize(newState, meta) - oldBlockSize, currentCursorOffset);

  if (ctx.remoteUpdate) { return; }

  // Inline positions drop the block open token; normalize to wrapper semantics so
  // the numbers posted to the host are identical to the legacy wrapper editor.
  const wrap = (pos) => (meta.mode === 'inline' ? toWrapperPos(pos) : pos);

  if (numChanges > 0) {
    ctx.port.postMessage({
      type: MESSAGE_TYPES.NODE_UPDATE,
      payload: { node: editorNodeJSON(editorView), cursorOffset: currentCursorOffset },
    });
  }

  const newSel = newState.selection;
  if (oldSel.anchor !== newSel.anchor || oldSel.head !== newSel.head) {
    const base = currentCursorOffset - 1;
    if (newSel.anchor !== newSel.head) {
      const coords = editorView.coordsAtPos(newSel.anchor);
      const anchor = base + wrap(newSel.anchor);
      const head = base + wrap(newSel.head);
      const anchorX = coords.left;
      const anchorY = coords.top;
      ctx.port.postMessage({
        type: MESSAGE_TYPES.SELECTION_CHANGE,
        payload: {
          anchor, head, anchorX, anchorY,
        },
      });
    } else {
      ctx.port.postMessage({
        type: MESSAGE_TYPES.CURSOR_MOVE,
        payload: { cursorOffset: base, textCursorOffset: wrap(newSel.from) },
      });
    }
  }

  // Notify the controller when stored marks change (e.g. Cmd+B keyboard shortcut).
  // This lets the da-nx toolbar reflect mark toggles immediately without waiting
  // for the next character to be typed.
  if (!marksEqual(oldStoredMarks, newState.storedMarks)) {
    const marks = newState.storedMarks ? newState.storedMarks.map((m) => m.toJSON()) : [];
    ctx.port.postMessage({ type: MESSAGE_TYPES.STORED_MARKS, payload: { marks } });
  }

  // Update toolbar button states and position
  updateToolbarState();
  positionToolbar();
}

let scrollRaf = null;
let scrollCtx = null;
let scrollBound = false;

function initScrollListener(win, ctx) {
  scrollCtx = ctx;
  if (scrollBound) return;
  scrollBound = true;
  win.addEventListener('scroll', () => {
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => {
      scrollRaf = null;
      // Inline editors are the .prosemirror-editor themselves; wrapper editors nest
      // .ProseMirror inside it. closest() resolves both.
      const focused = document.querySelector('.ProseMirror:focus');
      if (!focused) return;
      const editorParent = focused.closest('.prosemirror-editor');
      const view = editorParent?.view;
      if (!view) return;
      const { selection } = view.state;
      if (selection.anchor === selection.head) return;
      const wrap = (pos) => (view.qeMeta?.mode === 'inline' ? toWrapperPos(pos) : pos);
      const offset = parseInt(editorParent.getAttribute('data-prose-index'), 10);
      const base = offset - 1;
      const coords = view.coordsAtPos(selection.anchor);
      const anchor = base + wrap(selection.anchor);
      const head = base + wrap(selection.head);
      const anchorX = coords.left;
      const anchorY = coords.top;
      scrollCtx.port.postMessage({
        type: MESSAGE_TYPES.SELECTION_CHANGE,
        payload: {
          anchor, head, anchorX, anchorY,
        },
      });
    });
  }, { passive: true });
}

let blurClearTimeout = null;

function focus(view) {
  if (blurClearTimeout !== null) {
    clearTimeout(blurClearTimeout);
    blurClearTimeout = null;
  }
  // Coming back to a region that was scheduled to tear down: keep it.
  if (view.qeTeardown) {
    clearTimeout(view.qeTeardown);
    view.qeTeardown = null;
  }
  setCurrentEditorView(view);
  // showToolbar(view);
  return false;
}

// Destroy an inline editor and restore its element to plain page markup, so the
// page returns to byte-clean EDS output (only data-* metadata) once editing ends.
function teardownInlineEditor(view) {
  const meta = view.qeMeta;
  if (!meta || meta.mode !== 'inline') return;
  const el = meta.indexEl;
  const serializer = DOMSerializer.fromSchema(view.state.schema);
  const fragment = serializer.serializeFragment(view.state.doc.content);
  view.destroy();
  if (el.view === view) el.view = null;
  // Strip the marker + everything ProseMirror stamped, keep the element's own classes.
  el.className = el.className.split(/\s+/)
    .filter((c) => c && c !== 'prosemirror-editor' && !c.startsWith('ProseMirror'))
    .join(' ');
  if (!el.getAttribute('class')) el.removeAttribute('class');
  el.removeAttribute('contenteditable');
  el.removeAttribute('translate');
  el.textContent = '';
  el.appendChild(fragment);
}

function blur(view, event, ctx) {
  hideToolbar(view);
  setCurrentEditorView(null);
  blurClearTimeout = setTimeout(() => {
    ctx.port.postMessage({ type: MESSAGE_TYPES.CURSOR_MOVE });
    blurClearTimeout = null;
  }, 150);
  // On-demand teardown for inline editors (per-view timer; a re-focus cancels it).
  if (view.qeMeta?.mode === 'inline') {
    view.qeTeardown = setTimeout(() => {
      view.qeTeardown = null;
      teardownInlineEditor(view);
    }, 150);
  }
  return false; // Let other handlers run
}

function keydown(view, event) {
  return handleToolbarKeydown(event);
}

// Place the caret from the click that triggered this editor (parent round-trip:
// coords were captured on mousedown, the editor arrives async via SET_EDITOR_STATE).
function placePendingCaret(view, ctx, cursorOffset) {
  const pending = ctx.pendingCaret;
  if (!pending || pending.cursorOffset !== cursorOffset) return;
  ctx.pendingCaret = null;
  const at = view.posAtCoords({ left: pending.clientX, top: pending.clientY });
  const pos = at ? at.pos : view.state.selection.from;
  try {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
  } catch {
    // Invalid position right after mount — leave the default selection.
  }
  view.focus();
}

// Refocus after a remote re-render replaced the editor while it was focused.
function refocusAfterRemote(view) {
  if (blurClearTimeout === null) return;
  clearTimeout(blurClearTimeout);
  blurClearTimeout = null;
  setCurrentEditorView(view);
  view.focus();
}

function createInlineEditor(cursorOffset, state, ctx, element) {
  const schema = getInlineSchema();
  const { blockType, blockAttrs, content } = decomposeBlockNode(state);
  const doc = schema.nodeFromJSON({ type: 'doc', content });

  const editorState = EditorState.create({
    doc,
    schema,
    plugins: [createSimpleKeymap(ctx.port), createImageWrapperPlugin()],
  });

  // Mount directly on the real element — no wrapper div. The marker class lets the
  // existing selection/scroll code find it just like the legacy wrapper.
  element.classList.add('prosemirror-editor');

  const editorView = new EditorView({ mount: element }, {
    state: editorState,
    editable: () => !ctx.readOnly,
    handleDOMEvents: {
      focus,
      keydown,
      blur: (view, event) => blur(view, event, ctx),
    },
    dispatchTransaction: (tr) => {
      handleTransaction(tr, ctx, editorView);
    },
  });
  editorView.qeMeta = {
    mode: 'inline', indexEl: element, blockType, blockAttrs,
  };
  element.view = editorView;
  if (!ctx.readOnly) setupImageDropListeners(ctx, element);
  setRemoteCursors();
  initScrollListener(element.ownerDocument.defaultView, ctx);

  placePendingCaret(editorView, ctx, cursorOffset);
  refocusAfterRemote(editorView);
}

function createWrappedEditor(cursorOffset, state, ctx, element) {
  const schema = getSchema();
  const node = schema.nodeFromJSON(state);
  let doc;
  try {
    doc = schema.node('doc', null, [node]);
  } catch {
    // Not a valid top-level block (e.g. a table cell from clicking text inside a
    // block). Block-internal inline editing isn't supported via this path yet — bail
    // out rather than throw, leaving the region as plain markup.
    return;
  }

  const editorState = EditorState.create({
    doc,
    schema,
    plugins: [createSimpleKeymap(ctx.port), createImageWrapperPlugin()],
  });

  const editorParent = document.createElement('div');
  editorParent.setAttribute('data-prose-index', cursorOffset);
  editorParent.classList.add('prosemirror-editor');

  if (element.getAttribute('data-cursor-remote')) {
    editorParent.setAttribute('data-cursor-remote', element.getAttribute('data-cursor-remote'));
    editorParent.setAttribute('data-cursor-remote-color', element.getAttribute('data-cursor-remote-color'));
  }

  const editorView = new EditorView(editorParent, {
    state: editorState,
    editable: () => !ctx.readOnly,
    handleDOMEvents: {
      focus,
      keydown,
      blur: (view, event) => blur(view, event, ctx),
    },
    dispatchTransaction: (tr) => {
      handleTransaction(tr, ctx, editorView);
    },
  });
  editorView.qeMeta = { mode: 'wrapped', indexEl: editorParent };

  element.replaceWith(editorParent);
  editorParent.view = editorView;
  if (!ctx.readOnly) setupImageDropListeners(ctx, editorParent);
  setRemoteCursors();
  initScrollListener(editorParent.ownerDocument.defaultView, ctx);

  placePendingCaret(editorView, ctx, cursorOffset);
  refocusAfterRemote(editorView);
}

function updateEditor(view, state, ctx) {
  if (!view) return;
  const meta = view.qeMeta;

  // Save selection to restore after the content replacement.
  // Marks don't change node structure, so positions are identical in the new doc.
  const { anchor, head } = view.state.selection;

  let tr;
  if (meta?.mode === 'inline') {
    // Remote update carries a full block node; project its inline content back in.
    const { content } = decomposeBlockNode(state);
    const nodes = (content || []).map((c) => view.state.schema.nodeFromJSON(c));
    tr = view.state.tr.replaceWith(0, view.state.doc.content.size, nodes);
  } else {
    const node = view.state.schema.nodeFromJSON(state);
    tr = view.state.tr.replaceWith(0, view.state.doc.content.size, node);
  }

  const newSize = tr.doc.content.size;
  try {
    const a = Math.min(anchor, newSize);
    const h = Math.min(head, newSize);
    tr.setSelection(TextSelection.create(tr.doc, a, h));
  } catch {
    // If positions are invalid in new doc, leave selection as-is
  }
  ctx.remoteUpdate = true;
  view.dispatch(tr);
  ctx.remoteUpdate = false;
  if (!ctx.readOnly) setupImageDropListeners(ctx, meta?.indexEl ?? view.dom);

  refocusAfterRemote(view);
}

// Update a non-editor region's rendered content in place from a host-pushed block
// node, without mounting an editor. Keeps the layout view in sync with edits made
// elsewhere (e.g. the doc editor in split view) while staying on-demand.
function renderPlainRegion(element, state) {
  const schema = getSchema();
  let node;
  try {
    node = schema.nodeFromJSON(state);
  } catch {
    return;
  }
  // Shift the data-prose-index of following regions by this region's size change —
  // the region isn't a live editor, so handleTransaction's updateInstrumentation never
  // runs for it. Measure the old block size by parsing the current DOM, mirroring the
  // delta the wrapper editor's updateEditor path used to produce (new nodeSize - old).
  const offset = parseInt(element.getAttribute('data-prose-index'), 10);
  const oldBlockSize = DOMParser.fromSchema(schema).parse(element).content.size;

  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(node.content);
  element.textContent = '';
  element.appendChild(fragment);

  if (!Number.isNaN(offset)) updateInstrumentation(node.nodeSize - oldBlockSize, offset);
}

export function setEditorState(cursorOffset, state, ctx) {
  const existing = document.querySelector(`.prosemirror-editor[data-prose-index="${cursorOffset}"]`);
  if (existing?.view) {
    updateEditor(existing.view, state, ctx);
    return;
  }

  const element = document.querySelector(`[data-prose-index="${cursorOffset}"]`);
  if (!element) {
    ctx.port.postMessage({ type: MESSAGE_TYPES.RELOAD });
    return;
  }

  // A matching pending caret means the user clicked this region → mount an editor
  // on demand. Otherwise the state was pushed by the host (e.g. a split-view doc
  // edit): sync the rendered content in place without mounting an editor, so the
  // layout view stays current and regions never silently become editors.
  if (ctx.pendingCaret?.cursorOffset === cursorOffset) {
    if (isWrapperFreeType(state?.type)) {
      createInlineEditor(cursorOffset, state, ctx, element);
    } else {
      createWrappedEditor(cursorOffset, state, ctx, element);
    }
    return;
  }

  renderPlainRegion(element, state);
}

// On-demand editing: instead of eagerly turning every region into an editor on
// SET_BODY, mount an editor only when the user clicks a text region. Idle regions
// stay as plain instrumented markup. Blocks/images are handled by selection.js.
export function setupOnDemandEditing(ctx) {
  if (ctx.onDemandBound) return;
  ctx.onDemandBound = true;
  document.addEventListener('mousedown', (e) => {
    if (ctx.readOnly || e.button !== 0) return;
    if (e.target.closest?.('picture')) return;
    const el = e.target.closest?.('[data-prose-index]');
    if (!el) return;
    // Already an editor: cancel any pending teardown and let PM place the caret.
    if (el.view) {
      if (el.view.qeTeardown) {
        clearTimeout(el.view.qeTeardown);
        el.view.qeTeardown = null;
      }
      return;
    }
    const cursorOffset = parseInt(el.getAttribute('data-prose-index'), 10);
    if (Number.isNaN(cursorOffset)) return;
    ctx.pendingCaret = { cursorOffset, clientX: e.clientX, clientY: e.clientY };
    ctx.port.postMessage({ type: MESSAGE_TYPES.GET_EDITOR, payload: { cursorOffset } });
  }, true);
}
