// Pure helpers for the "inline projection" quick-edit editor.
//
// Background: to mount a ProseMirror editor directly on the real page element
// (a <p>/<h2>) with NO wrapper div, the editor's document must have an inline
// top node (doc -> inline*) instead of the usual doc -> block -> inline. That
// projection drops the block's open/close tokens, which shifts every position by
// one and changes how we reconstruct the block node to send back to the host.
//
// These helpers are the numeric/JSON glue that keeps the host (da-live) seeing
// byte-identical NODE_UPDATE / CURSOR_MOVE / SELECTION_CHANGE numbers whether the
// region is edited via the inline projection or the legacy wrapper editor.
//
// This module intentionally has NO imports so it can be unit-tested in the
// sandboxed test runner (which blocks the external da.live dep URLs prose.js uses).

// Block node types we mount wrapper-free (inline projection). Everything else
// (lists, tables, blockquote, code_block, ...) keeps the legacy wrapper editor.
export const WRAPPER_FREE_TYPES = new Set(['paragraph', 'heading']);

export function isWrapperFreeType(type) {
  return WRAPPER_FREE_TYPES.has(type);
}

// Split a block node JSON (as received in SET_EDITOR_STATE) into the block
// identity we must restore later and the inline content the projection edits.
export function decomposeBlockNode(blockNodeJSON) {
  const { type = null, attrs = null, content = [] } = blockNodeJSON ?? {};
  return { blockType: type, blockAttrs: attrs, content };
}

// Rebuild the full block node JSON from edited inline content, restoring the
// original block type/attrs. This is what we post back in NODE_UPDATE so the host
// sees the exact shape the legacy wrapper editor would have produced.
export function composeBlockNode(blockType, blockAttrs, inlineContent = []) {
  // Match ProseMirror Node.toJSON key order (type, attrs, content) and its
  // omit-empty-content behaviour so inline and wrapper editors post identical shapes.
  const node = { type: blockType };
  if (blockAttrs != null) node.attrs = blockAttrs;
  if (inlineContent && inlineContent.length) node.content = inlineContent;
  return node;
}

// The inline doc has no block open token, so an inline position is one less than
// the equivalent position in the wrapper doc (doc > block > inline). Normalize an
// inline position back to wrapper semantics before posting it to the host.
export function toWrapperPos(inlinePos) {
  return inlinePos + 1;
}

// nodeSize of the equivalent block node = inline content size + 2 (open + close
// token). Used for the data-prose-index shift math after an edit.
export function blockSizeFromContentSize(contentSize) {
  return contentSize + 2;
}
