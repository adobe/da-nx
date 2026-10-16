/* eslint-disable import/prefer-default-export */

import { EDITABLE_NODE_TYPES } from './editable-elements.js';

/**
 * Resolve the editable node the WYSIWYG (quick-edit) plugin should mount for a
 * given instrumented prose index.
 *
 * The controller stamps `data-prose-index` on the outermost editable block
 * (p / h1-6 / ol / ul / pre / blockquote) using `posAtDOM(el, 0)`. When that block is nested in a
 * table cell, resolving the index can land on the cell boundary; naively taking
 * `resolve(before(depth)).nodeAfter` then yields the enclosing `table_cell`.
 * A `table_cell` is not valid top-level `doc` content (`doc` is `block+`, and a
 * cell is only valid inside a `table_row`), so wrapping it in a fresh `doc`
 * throws `RangeError: Invalid content for node doc` and crashes the editor.
 *
 * This returns the block that actually corresponds to the instrumented index
 * (including any enclosing quote/list), never its table container.
 *
 * @param {import('prosemirror-model').Node} doc the ProseMirror document
 * @param {number} cursorOffset the instrumented prose index
 * @returns {{ node: import('prosemirror-model').Node, cursorOffset: number }}
 */
export function resolveEditableNode(doc, cursorOffset) {
  const $pos = doc.resolve(cursorOffset);
  const docMatch = doc.type.schema.nodes.doc.contentMatch;

  // Instrumentation only indexes the outermost editable. Resolving its first
  // child instead would replace the wrapper with that child on the first edit.
  for (let depth = 1; depth <= $pos.depth; depth += 1) {
    const ancestor = $pos.node(depth);
    if (EDITABLE_NODE_TYPES.has(ancestor.type.name)) {
      return { node: ancestor, cursorOffset: $pos.before(depth) + 1 };
    }
  }

  // The index sits at the boundary right before an editable block — e.g. inside
  // a table cell, immediately before its paragraph. The block we want is the
  // node directly after the index; keep the index as-is so the plugin can still
  // find the placeholder by `data-prose-index`.
  const after = $pos.nodeAfter;
  if (after && docMatch.matchType(after.type)) {
    return { node: after, cursorOffset };
  }

  return { node: null, cursorOffset };
}
