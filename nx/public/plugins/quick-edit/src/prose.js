import { getSchema } from 'https://main--da-live--adobe.aem.live/blocks/edit/prose/schema.js';
import { EditorState, EditorView } from 'https://main--da-live--adobe.aem.live/deps/da-y-wrapper/dist/index.js';
import { showToolbar, hideToolbar, setCurrentEditorView, updateToolbarState, handleToolbarKeydown, positionToolbar } from './toolbar.js';
import { createSimpleKeymap } from './simple-keymap.js';
import { createImageWrapperPlugin } from './image-wrapper.js';
import { setupImageDropListeners } from './images.js';
import { setRemoteCursors } from './cursors.js';

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
  const currentCursorOffset = parseInt(editorParent.getAttribute('data-prose-index'));
  const oldLength = editorView.state.doc.firstChild.nodeSize;
  const oldSelection = editorView.state.selection.from;
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

  // Check if selection changed
  const newSelection = newState.selection.from;
  if (oldSelection !== newSelection) {
    ctx.port.postMessage({
      type: 'cursor-move',
      cursorOffset: currentCursorOffset - 1,
      textCursorOffset: newSelection,
    });
  }
  
  // Update toolbar button states and position
  updateToolbarState();
  positionToolbar();
}

function focus(view, event) {
  setCurrentEditorView(view);
  showToolbar(view);
  return false;
}

function blur(view, event, ctx) {
  hideToolbar(view);
  setCurrentEditorView(null);
  ctx.port.postMessage({
    type: 'cursor-move',
  });
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
    ctx.port.postMessage({
      type: 'reload',
    });
    return;
  }

  if (element.getAttribute('data-cursor-remote')) {
    editorParent.setAttribute('data-cursor-remote', element.getAttribute('data-cursor-remote'));
    editorParent.setAttribute('data-cursor-remote-color', element.getAttribute('data-cursor-remote-color'));
  }

  const editorView = new EditorView(
    editorParent, { 
      state: editorState,
      handleDOMEvents: { 
        focus, 
        keydown, 
        blur: (view, event) => blur(view, event, ctx) 
      },
      dispatchTransaction: (tr) => {
        handleTransaction(tr, ctx, editorView, editorParent);
      }
    }
  );

  element.replaceWith(editorParent);
  editorParent.view = editorView;
  setupImageDropListeners(ctx, editorParent);
  
  setRemoteCursors();
}

function updateEditor(editorEl, state, ctx) {
  if (!editorEl) return;

  // Editor already exists, update it with a transaction
  const view = editorEl;
  const schema = view.state.schema;
  const node = schema.nodeFromJSON(state);
  
  // Create transaction to replace the root node (first child of doc)
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, node);
  ctx.remoteUpdate = true;
  view.dispatch(tr);
  ctx.remoteUpdate = false;
  setupImageDropListeners(ctx, editorEl.parentElement);
}

export function setEditorState(cursorOffset, state, ctx) {
  const existingEditorParent = document.querySelector(`.prosemirror-editor[data-prose-index="${cursorOffset}"]`);
  if (existingEditorParent) {
    const editorEl = existingEditorParent.view;
    updateEditor(editorEl, state, ctx);
  }
  createEditor(cursorOffset, state, ctx);
}