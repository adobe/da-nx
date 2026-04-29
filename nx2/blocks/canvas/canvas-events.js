// TODO: overall eventing cleanup needed —
//   - CANVAS_UNDO/CANVAS_REDO could be replaced by a direct `commands` ref on the mount root
//   - postMessage port protocol types could move to their own file (quick-edit-port.js)
//   - establish and document that DOM events here are only for meta-level concerns
//     (panels, view mode, lifecycle) so editorial commands never accumulate here

// DOM CustomEvents — dispatched and consumed within the canvas block

/** canvas.js → nx-editor-doc, nx-editor-wysiwyg: editor view changed or re-activated.
 *  detail: { view: 'layout' | 'content' | 'split' } */
export const CANVAS_EDITOR_ACTIVE = 'nx-canvas-editor-active';

/** nx-canvas-header, command-defs → canvas.js: open a side panel.
 *  detail: { position: 'before' | 'after' } */
export const CANVAS_OPEN_PANEL = 'nx-canvas-open-panel';

/** nx-canvas-header → canvas.js: user switched editor view.
 *  detail: { view: 'layout' | 'content' | 'split' } */
export const CANVAS_EDITOR_VIEW = 'nx-canvas-editor-view';

/** nx-canvas-header → canvas.js: user triggered undo. */
export const CANVAS_UNDO = 'nx-canvas-undo';

/** nx-canvas-header → canvas.js: user triggered redo. */
export const CANVAS_REDO = 'nx-canvas-redo';

/** nx-editor-doc → canvas.js: undo/redo stack availability changed.
 *  detail: { canUndo: boolean, canRedo: boolean } */
export const EDITOR_UNDO_STATE = 'nx-editor-undo-state';

/** nx-editor-wysiwyg → nx-editor-doc: wysiwyg iframe port is ready.
 *  detail: { port: MessagePort, iframe: HTMLIFrameElement } */
export const WYSIWYG_PORT_READY = 'nx-wysiwyg-port-ready';

/** nx-editor-doc → canvas: collaborative user list changed.
 *  detail: { users: CollabUser[] } */
export const COLLAB_USERS = 'da-collab-users';

// Quick-edit port protocol — canvas → wysiwyg iframe

/** Send serialized AEM HTML body to the wysiwyg iframe. { type, body: string } */
export const PORT_SET_BODY = 'set-body';

/** Send remote cursor positions to the wysiwyg iframe. { type, cursors } */
export const PORT_SET_CURSORS = 'set-cursors';

/** Send ProseMirror editor state for the active block. { type, editorState, cursorOffset } */
export const PORT_SET_EDITOR_STATE = 'set-editor-state';

// Quick-edit port protocol — wysiwyg iframe → canvas

/** Cursor moved inside the iframe; sync PM selection. { type, cursorOffset, textCursorOffset } */
export const PORT_CURSOR_MOVE = 'cursor-move';

/** Iframe requests a full document reload from the canvas. { type } */
export const PORT_RELOAD = 'reload';

/** Iframe requests an image replace operation. { type, … } */
export const PORT_IMAGE_REPLACE = 'image-replace';

/** Iframe requests the current ProseMirror editor state. { type, … } */
export const PORT_GET_EDITOR = 'get-editor';

/** Iframe pushes a node-level state update. { type, … } */
export const PORT_NODE_UPDATE = 'node-update';

/** Iframe triggers undo or redo. { type, action: 'undo' | 'redo' } */
export const PORT_HISTORY = 'history';

/** Iframe reports a text selection range. { type, anchor, head, anchorX, anchorY } */
export const PORT_SELECTION_CHANGE = 'selection-change';

/** Iframe requests a scroll-to for an outline selection.
 *  { type, sectionIndex: number, blockFlatIndex: number } */
export const PORT_OUTLINE_SCROLL = 'outline-scroll';
