import { updateDocument } from './utils/document.js';
import { updateState, getEditor } from './utils/state.js';
import { moveBlockAt } from './utils/blocks.js';
import { handleImageReplace } from './utils/image.js';
import {
  handleCursorMove, handleUndoRedo, handlePreview,
  handleStoredMarks, handleSelectionChange,
} from './utils/handlers.js';

export function createControllerOnMessage(ctx) {
  return function onMessage(e) {
    ctx.suppressScrollSync = true;
    if (e.data.type === 'cursor-move') {
      handleCursorMove(e.data, ctx);
    } else if (e.data.type === 'reload') {
      updateDocument(ctx);
    } else if (e.data.type === 'image-replace') {
      handleImageReplace(e.data, ctx);
    } else if (e.data.type === 'get-editor') {
      getEditor(e.data, ctx);
    } else if (e.data.type === 'node-update') {
      updateState(e.data, ctx);
    } else if (e.data.type === 'history') {
      handleUndoRedo(e.data, ctx);
    } else if (e.data.type === 'preview') {
      handlePreview(ctx);
    } else if (e.data.type === 'move-block') {
      moveBlockAt(e.data, ctx);
    } else if (e.data.type === 'quick-edit-add-to-chat') {
      ctx.onAddToChat?.(e.data.payload);
    } else if (e.data.type === 'selection-change') {
      handleSelectionChange(e.data, ctx);
    } else if (e.data.type === 'stored-marks') {
      handleStoredMarks(e.data, ctx);
    }
    ctx.suppressScrollSync = false;
  };
}
