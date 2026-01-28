import { TextSelection, yUndo, yRedo } from "da-y-wrapper";
import { getInstrumentedHTML } from "./prose2aem.js?v=2";

export function updateDocument(ctx) {
  // Skip rerender if suppressed (e.g., during image updates)
  if (ctx.suppressRerender) return;
  const body = getInstrumentedHTML(window.view);
  ctx.port.postMessage({ type: "set-body", body });
}

export function updateCursors(ctx) {
  const body = getInstrumentedHTML(window.view);
  ctx.port.postMessage({ type: 'set-cursors', body });
}

export function updateState(data, ctx) {
  const node = window.view.state.schema.nodeFromJSON(data.node);
  const pos = window.view.state.doc.resolve(data.cursorOffset);
  const docPos = window.view.state.selection.from;
  
  // Calculate the range that covers the entire node
  const nodeStart = pos.before(pos.depth);
  const nodeEnd = pos.after(pos.depth);

  // Replace the entire node
  const tr = window.view.state.tr;
  tr.replaceWith(nodeStart, nodeEnd, node);
  
  // fix the selection
  tr.setSelection(TextSelection.create(tr.doc, docPos));

  ctx.suppressRerender = true;
  window.view.dispatch(tr);
  ctx.suppressRerender = false;
}

export function getEditor(data, ctx) {
  if (ctx.suppressRerender) { return; }
  const { cursorOffset } = data;

  const pos = window.view.state.doc.resolve(cursorOffset);
  const before = pos.before(pos.depth);
  const beforePos = window.view.state.doc.resolve(before);
  const nodeAtBefore = beforePos.nodeAfter;
  ctx.port.postMessage({ type: 'set-editor-state', editorState: nodeAtBefore.toJSON(), cursorOffset: before + 1 });
}

export function handleCursorMove({ cursorOffset, textCursorOffset }, ctx) {
  if (!window.view || !ctx.wsProvider) return;

  if (cursorOffset == null || textCursorOffset == null) {
    // Clear the cursor from awareness when no valid cursor position is provided
    window.view.hasFocus = () => false;
    ctx.wsProvider.awareness.setLocalStateField('cursor', null);
    return;
  }

  const { state } = window.view;
  const position = cursorOffset + textCursorOffset;

  try {
    // Ensure the position is valid within the document
    if (position < 0 || position > state.doc.content.size) {
      console.warn('Invalid cursor position:', position);
      return;
    }

    // TODO: this is a hack. The cursor plugin expects focus. We should write our own version of the cursor plugin long term.
    window.view.hasFocus = () => true;

    // Create a transaction to update the selection
    const tr = state.tr;

    // Set the selection to the calculated position
    tr.setSelection(TextSelection.create(state.doc, position));

    // Dispatch the transaction to update the editor state
    ctx.suppressRerender = true;
    window.view.dispatch(tr);
    ctx.suppressRerender = false;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Error moving cursor:", error);
  }
}

export function handleUndoRedo(data, ctx) {
  const { action } = data;
  if (action === 'undo') {
    yUndo(window.view.state);
  } else if (action === 'redo') {
    yRedo(window.view.state);
  }
}
