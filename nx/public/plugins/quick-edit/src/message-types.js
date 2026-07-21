// Canonical postMessage `type` values for the quick-edit iframe <-> host boundary.
// da-live imports this file directly via getNx1() (forces nx/, never nx2/) — coordinate
// renames/moves with da-live's canvas quick-edit files.
export const MessageTypes = Object.freeze({
  // Host <-> iframe: handshake
  INIT: 'init',
  READY: 'ready',

  // Host -> iframe
  SET_BODY: 'set-body',
  SET_EDITOR_STATE: 'set-editor-state',
  SET_CURSORS: 'set-cursors',
  SET_SELECTED_NODE: 'set-selected-node',

  // Iframe -> host: ongoing
  CURSOR_MOVE: 'cursor-move',
  RELOAD: 'reload',
  GET_EDITOR: 'get-editor',
  NODE_UPDATE: 'node-update',
  NODE_SELECT: 'node-select',
  HISTORY: 'history',
  NEW_VERSION: 'new-version',
  SELECTION_CHANGE: 'selection-change',
  STORED_MARKS: 'stored-marks',
  PREVIEW: 'preview',

  // Iframe -> host today (the request); host -> iframe once the deprecated
  // UPDATE_IMAGE_SRC/IMAGE_ERROR replies below are retired in favor of replying
  // with this same type + a top-level `error` boolean — becomes bidirectional then.
  IMAGE_REPLACE: 'image-replace',

  // Host -> iframe: @deprecated replies to IMAGE_REPLACE
  UPDATE_IMAGE_SRC: 'update-image-src',
  IMAGE_ERROR: 'image-error',
});
