/* eslint-disable import/prefer-default-export */

/**
 * Resolve the editable node the WYSIWYG (quick-edit) plugin should mount for a
 * given instrumented prose index.
 *
 * The controller stamps `data-prose-index` on the outermost editable block
 * (p / h1-6 / ol / ul) using `posAtDOM(el, 0)`. When that block is nested in a
 * table cell, resolving the index can land on the cell boundary; naively taking
 * `resolve(before(depth)).nodeAfter` then yields the enclosing `table_cell`.
 * A `table_cell` is not valid top-level `doc` content (`doc` is `block+`, and a
 * cell is only valid inside a `table_row`), so wrapping it in a fresh `doc`
 * throws `RangeError: Invalid content for node doc` and crashes the editor.
 *
 * This returns the block that actually corresponds to the instrumented index
 * (the paragraph/heading/list), never its table container.
 *
 * @param {import('prosemirror-model').Node} doc the ProseMirror document
 * @param {number} cursorOffset the instrumented prose index
 * @returns {{ node: import('prosemirror-model').Node, cursorOffset: number }}
 */
export function resolveEditableNode(doc, cursorOffset) {
  const $pos = doc.resolve(cursorOffset);
  const docMatch = doc.type.schema.nodes.doc.contentMatch;

  // The index sits at the boundary right before an editable block — e.g. inside
  // a table cell, immediately before its paragraph. The block we want is the
  // node directly after the index; keep the index as-is so the plugin can still
  // find the placeholder by `data-prose-index`.
  const after = $pos.nodeAfter;
  if (after && docMatch.matchType(after.type)) {
    return { node: after, cursorOffset };
  }

  // The index sits inside an editable block. Climb to the innermost ancestor
  // that is valid top-level `doc` content (a paragraph / heading / list) —
  // never a `table_cell` / `table_row`, which cannot be a child of `doc`.
  const { depth } = $pos;
  for (let d = depth; d >= 1; d -= 1) {
    const ancestor = $pos.node(d);
    if (docMatch.matchType(ancestor.type)) {
      return { node: ancestor, cursorOffset: $pos.before(d) + 1 };
    }
  }

  return { node: null, cursorOffset };
}
