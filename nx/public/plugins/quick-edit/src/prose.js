import { getSchema } from 'https://da.live/blocks/edit/prose/schema.js';
import { EditorState } from 'https://da.live/deps/da-y-wrapper/dist/index.js';
import { CustomEditorView } from './custom-editor-view.js';
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

function handleTransaction(tr, ctx, editorView, element) {
  const numChanges = tr.steps.length;
  const currentCursorOffset = parseInt(element.getAttribute('data-prose-index'));
  const nodeType = element.getAttribute('data-prose-node-type');
  const oldLength = editorView.state.doc.content.size;
  const oldSelection = editorView.state.selection.from;
  const newState = editorView.state.apply(tr);
  editorView.updateState(newState);
  updateInstrumentation(newState.doc.content.size - oldLength, currentCursorOffset);

  if (ctx.remoteUpdate) { return; }
  
  if (numChanges > 0) {
    // Extract content from the paragraph wrapper and wrap back in the original node type
    const schema = editorView.state.schema;
    const content = [];
    
    // The guest editor wraps content in a paragraph, so extract from it
    const firstNode = newState.doc.firstChild;
    if (firstNode) {
      firstNode.forEach((child) => {
        content.push(child);
      });
    }
    
    // Get the original node's attributes if they exist
    const attrs = element.hasAttribute('data-prose-node-attrs') 
      ? JSON.parse(element.getAttribute('data-prose-node-attrs'))
      : null;
    
    const wrappedNode = schema.nodes[nodeType].create(attrs, content);
    
    ctx.port.postMessage({
      type: 'node-update',
      node: wrappedNode.toJSON(),
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
  
  // Create a doc that only contains the node's content (not the node itself)
  // This way the guest editor only manages the inline content
  const contentNodes = [];
  node.forEach((child) => {
    contentNodes.push(child);
  });
  
  // Wrap inline content in a paragraph for the guest editor
  // The doc node expects block content, not inline content
  const paragraph = schema.nodes.paragraph.create(null, contentNodes);
  const doc = schema.node('doc', null, [paragraph]);

  const editorState = EditorState.create({
    doc,
    schema,
    plugins: [createSimpleKeymap(ctx.port), createImageWrapperPlugin()],
  });

  const element = document.querySelector(`[data-prose-index="${cursorOffset}"]`);

  if (!element) {
    ctx.port.postMessage({
      type: 'reload',
    });
    return;
  }

  // Store the element type and attributes so we know what node to create when syncing back
  const nodeType = node.type.name;
  const nodeAttrs = node.attrs;
  
  // Mark this element as having an active editor
  element.classList.add('prosemirror-editor-host');
  element.setAttribute('data-prose-node-type', nodeType);
  if (nodeAttrs && Object.keys(nodeAttrs).length > 0) {
    element.setAttribute('data-prose-node-attrs', JSON.stringify(nodeAttrs));
  }

  // Clear the element's content but keep the element itself
  element.innerHTML = '';

  // Use custom editor view that renders directly to the element
  const editorView = new CustomEditorView(
    element, { 
      state: editorState,
      handleDOMEvents: { 
        focus, 
        keydown, 
        blur: (view, event) => blur(view, event, ctx) 
      },
      dispatchTransaction: (tr) => {
        handleTransaction(tr, ctx, editorView, element);
      }
    }
  );

  element.view = editorView;
  setupImageDropListeners(ctx, element);
  
  setRemoteCursors();
}

function updateEditor(element, state, ctx) {
  if (!element || !element.view) return;

  // Editor already exists, update it with a transaction
  const view = element.view;
  const schema = view.state.schema;
  const node = schema.nodeFromJSON(state);
  
  // Extract the content from the node
  const contentNodes = [];
  node.forEach((child) => {
    contentNodes.push(child);
  });
  
  // Wrap inline content in a paragraph for the guest editor
  const paragraph = schema.nodes.paragraph.create(null, contentNodes);
  
  // Create transaction to replace the entire document with the new paragraph
  const tr = view.state.tr.replaceWith(0, view.state.doc.content.size, paragraph);
  ctx.remoteUpdate = true;
  view.dispatch(tr);
  ctx.remoteUpdate = false;
  setupImageDropListeners(ctx, element);
}

export function setEditorState(cursorOffset, state, ctx) {
  const existingElement = document.querySelector(`.prosemirror-editor-host[data-prose-index="${cursorOffset}"]`);
  if (existingElement) {
    updateEditor(existingElement, state, ctx);
    return;
  }
  createEditor(cursorOffset, state, ctx);
}