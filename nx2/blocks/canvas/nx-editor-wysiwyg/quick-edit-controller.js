import { updateDocument } from '../editor-utils/document.js';
import { updateState, getEditor } from '../editor-utils/state.js';
import {
  showSelectionToolbar,
  hideSelectionToolbar,
} from '../editor-utils/selection-toolbar.js';
import { handleImageReplace } from './utils/image.js';
import {
  handleCursorMove, handleUndoRedo,
} from './utils/handlers.js';

function getWysiwygIframe() {
  return document.querySelector('nx-editor-wysiwyg')?.shadowRoot?.querySelector('iframe');
}

function handleSelectionChange(data) {
  const { anchor, head, anchorX, anchorY } = data;
  if (anchor === head) {
    hideSelectionToolbar();
    return;
  }

  const iframe = getWysiwygIframe();
  if (!iframe) return;

  const iframeRect = iframe.getBoundingClientRect();
  const x = iframeRect.left + anchorX;
  const y = iframeRect.top + anchorY - 64;
  showSelectionToolbar({ x, y });
}

export function createControllerOnMessage(ctx) {
  return function onMessage(e) {
    if (e.data.type === 'cursor-move') {
      hideSelectionToolbar();
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
    } else if (e.data.type === 'selection-change') {
      handleSelectionChange(e.data, ctx);
    }
  };
}
