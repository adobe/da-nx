import { TextSelection, yUndo, yRedo } from 'da-y-wrapper';
import { getInstrumentedHTML, extractCursors } from './prose2aem.js';
import { MESSAGE_TYPES } from '../../../utils/message-types.js';

export function updateDocument(ctx) {
  // Skip rerender if suppressed (e.g., during image updates)
  if (ctx.suppressRerender) return;
  const body = getInstrumentedHTML(window.view);
  // @deprecated top-level `body` — prefer payload.body (kept so the quick-edit iframe
  // script in da-nx keeps working until it migrates).
  ctx.port.postMessage({ type: MESSAGE_TYPES.SET_BODY, body, payload: { body } });
}

export function updateCursors(ctx) {
  const cursors = extractCursors(window.view);
  // @deprecated top-level `cursors` — prefer payload.cursors.
  ctx.port.postMessage({ type: MESSAGE_TYPES.SET_CURSORS, cursors, payload: { cursors } });
}

export function updateState(data, ctx) {
  const node = window.view.state.schema.nodeFromJSON(data.node);
  const pos = window.view.state.doc.resolve(data.cursorOffset);
  const docPos = window.view.state.selection.from;

  // Calculate the range that covers the entire node
  const nodeStart = pos.before(pos.depth);
  const nodeEnd = pos.after(pos.depth);

  // Replace the entire node
  const { tr } = window.view.state;
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
  const editorState = nodeAtBefore.toJSON();
  const newCursorOffset = before + 1;
  // @deprecated top-level editorState/cursorOffset — prefer payload.editorState/cursorOffset.
  ctx.port.postMessage({
    type: MESSAGE_TYPES.SET_EDITOR_STATE,
    editorState,
    cursorOffset: newCursorOffset,
    payload: { editorState, cursorOffset: newCursorOffset },
  });
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
      // eslint-disable-next-line no-console
      console.warn('Invalid cursor position:', position);
      return;
    }

    // TODO: this is a hack. The cursor plugin expects focus.
    // We should write our own version of the cursor plugin long term.
    window.view.hasFocus = () => true;

    // Create a transaction to update the selection
    const { tr } = state;

    // Set the selection to the calculated position
    tr.setSelection(TextSelection.create(state.doc, position));

    // Dispatch the transaction to update the editor state
    ctx.suppressRerender = true;
    window.view.dispatch(tr);
    ctx.suppressRerender = false;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error moving cursor:', error);
  }
}

export function handleUndoRedo(data) {
  const { action } = data;
  if (action === 'undo') {
    yUndo(window.view.state);
  } else if (action === 'redo') {
    yRedo(window.view.state);
  }
}
