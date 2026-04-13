/* eslint-disable import/prefer-default-export */
import { getSchema } from 'https://da.live/deps/da-parser/dist/index.js';
import { EditorState, EditorView, TextSelection } from 'https://da.live/deps/da-y-wrapper/dist/index.js';
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

function marksEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  return a.every((m, i) => m.eq(b[i]));
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

function handleTransaction(tr, ctx, editorView, editorParent) {
  const numChanges = tr.steps.length;
  const currentCursorOffset = parseInt(editorParent.getAttribute('data-prose-index'), 10);
  const oldLength = editorView.state.doc.firstChild.nodeSize;
  const oldSel = editorView.state.selection;
  const oldStoredMarks = editorView.state.storedMarks;
  const newState = editorView.state.apply(tr);
  editorView.updateState(newState);
  updateInstrumentation(newState.doc.firstChild.nodeSize - oldLength, currentCursorOffset);

  if (ctx.remoteUpdate) { return; }

  if (numChanges > 0) {
    const editedEl = newState.doc.firstChild;
    ctx.port.postMessage({
      type: 'node-update',
      node: editedEl.toJSON(),
      cursorOffset: currentCursorOffset,
    });
  }

  const newSel = newState.selection;
  if (oldSel.anchor !== newSel.anchor || oldSel.head !== newSel.head) {
    const base = currentCursorOffset - 1;
    if (newSel.anchor !== newSel.head) {
      ctx.port.postMessage({
        type: 'selection-change',
        anchor: base + newSel.anchor,
        head: base + newSel.head,
      });
    } else {
      ctx.port.postMessage({
        type: 'cursor-move',
        cursorOffset: base,
        textCursorOffset: newSel.from,
      });
    }
  }

  // Notify the controller when stored marks change (e.g. Cmd+B keyboard shortcut).
  // This lets the da-nx toolbar reflect mark toggles immediately without waiting
  // for the next character to be typed.
  if (!marksEqual(oldStoredMarks, newState.storedMarks)) {
    ctx.port.postMessage({
      type: 'stored-marks',
      marks: newState.storedMarks ? newState.storedMarks.map((m) => m.toJSON()) : [],
    });
  }

  // Update toolbar button states and position
  updateToolbarState();
  positionToolbar();
}

let blurClearTimeout = null;

function focus(view) {
  if (blurClearTimeout !== null) {
    clearTimeout(blurClearTimeout);
    blurClearTimeout = null;
  }
  setCurrentEditorView(view);
  // showToolbar(view);
  return false;
}

function blur(view, event, ctx) {
  hideToolbar(view);
  setCurrentEditorView(null);
  blurClearTimeout = setTimeout(() => {
    ctx.port.postMessage({ type: 'cursor-move' });
    blurClearTimeout = null;
  }, 150);
  return false; // Let other handlers run
}

function keydown(view, event) {
  return handleToolbarKeydown(event);
}

function createEditor(cursorOffset, state, ctx) {
  const schema = getSchema();
  const node = schema.nodeFromJSON(state);
  const doc = schema.node('doc', null, [node]);

  const editorState = EditorState.create({
    doc,
    schema,
    plugins: [createSimpleKeymap(ctx.port), createImageWrapperPlugin()],
  });

  const editorParent = document.createElement('div');
  editorParent.setAttribute('data-prose-index', cursorOffset);
  editorParent.classList.add('prosemirror-editor');

  const element = document.querySelector(`[data-prose-index="${cursorOffset}"]`);

  if (!element) {
    ctx.port.postMessage({ type: 'reload' });
    return;
  }

  if (element.getAttribute('data-cursor-remote')) {
    editorParent.setAttribute('data-cursor-remote', element.getAttribute('data-cursor-remote'));
    editorParent.setAttribute('data-cursor-remote-color', element.getAttribute('data-cursor-remote-color'));
  }

  const editorView = new EditorView(editorParent, {
    state: editorState,
    handleDOMEvents: {
      focus,
      keydown,
      blur: (view, event) => blur(view, event, ctx),
    },
    dispatchTransaction: (tr) => {
      handleTransaction(tr, ctx, editorView, editorParent);
    },
  });

  element.replaceWith(editorParent);
  editorParent.view = editorView;
  setupImageDropListeners(ctx, editorParent);
  setRemoteCursors();

  if (blurClearTimeout !== null) {
    clearTimeout(blurClearTimeout);
    blurClearTimeout = null;
    setCurrentEditorView(editorView);
    editorView.focus();
  }
}

function updateEditor(editorEl, state, ctx) {
  if (!editorEl) return;

  // Editor already exists, update it with a transaction
  const view = editorEl;
  const { schema } = view.state;
  const node = schema.nodeFromJSON(state);

  // Save selection to restore after the content replacement.
  // Marks don't change node structure, so positions are identical in the new doc.
  const { anchor, head } = view.state.selection;

  // Create transaction to replace the root node (first child of doc)
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, node);
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
  setupImageDropListeners(ctx, editorEl.parentElement);

  if (blurClearTimeout !== null) {
    clearTimeout(blurClearTimeout);
    blurClearTimeout = null;
    setCurrentEditorView(view);
    view.focus();
  }
}

export function setEditorState(cursorOffset, state, ctx) {
  const existingEditorParent = document.querySelector(`.prosemirror-editor[data-prose-index="${cursorOffset}"]`);
  if (existingEditorParent) {
    updateEditor(existingEditorParent.view, state, ctx);
    return;
  }
  createEditor(cursorOffset, state, ctx);
}
