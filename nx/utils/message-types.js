// Canonical postMessage `type` values for the quick-edit iframe <-> host boundary.
// Shared by nx/public/plugins/quick-edit/ and nx/blocks/quick-edit-portal/. da-live
// re-exports this same object from blocks/canvas/utils/quick-edit-messages.js (forces
// nx/, never nx2/) — coordinate renames/moves with that file.
// Payload shape is documented per-key below; see docs/quick-edit-events.md for narrative
// context (why a message exists, which host implementations wire it up).
export const MESSAGE_TYPES = Object.freeze({
  // Host <-> iframe: handshake
  INIT: 'init', // { config: { mountpoint }, location: { pathname } }
  READY: 'ready', // no payload

  // Host -> iframe
  SET_BODY: 'set-body', // { body: string }
  SET_EDITOR_STATE: 'set-editor-state', // { editorState: PM node JSON, cursorOffset: number }
  SET_CURSORS: 'set-cursors', // { cursors: [{ proseIndex, remote, color }] }
  SET_SELECTED_NODE: 'set-selected-node', // { node: { anchorType, proseIndex, ... } | null, scrollIntoView }

  // Iframe -> host: ongoing
  CURSOR_MOVE: 'cursor-move', // { cursorOffset?, textCursorOffset? } — absent = clear remote cursor
  RELOAD: 'reload', // no payload
  GET_EDITOR: 'get-editor', // { cursorOffset: number }
  NODE_UPDATE: 'node-update', // { node: PM node JSON, cursorOffset: number }
  NODE_SELECT: 'node-select', // { node: { anchorType, proseIndex, src?, blockIndex? } | null }
  HISTORY: 'history', // { action: 'undo' | 'redo' }
  NEW_VERSION: 'new-version', // no payload
  SELECTION_CHANGE: 'selection-change', // { anchor, head, anchorX, anchorY }
  STORED_MARKS: 'stored-marks', // { marks: PM Mark.toJSON()[] }
  PREVIEW: 'preview', // request: no payload; reply: { ok: boolean, error?: string }

  // Iframe -> host (request): { cursorOffset, imageData, fileName, mimeType, originalSrc }
  // Host -> iframe (reply): { originalSrc, newSrc } | { originalSrc, error }
  IMAGE_REPLACE: 'image-replace',
});
