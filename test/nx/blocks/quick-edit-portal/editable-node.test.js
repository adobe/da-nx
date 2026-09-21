import { expect } from '@esm-bundle/chai';
import { Schema } from 'prosemirror-model';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { tableNodes } from 'prosemirror-tables';
import { resolveEditableNode } from '../../../../nx/blocks/quick-edit-portal/src/editable-node.js';

// A faithful subset of da-parser's schema: `doc` is `block+`, tables use the
// same `tableNodes({ tableGroup: 'block', cellContent: 'block+' })` recipe.
// This is what makes a `table_cell` invalid as a direct child of `doc`.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    heading: {
      group: 'block',
      content: 'inline*',
      parseDOM: [{ tag: 'h2' }],
      toDOM: () => ['h2', 0],
    },
    text: { group: 'inline' },
    ...tableNodes({ tableGroup: 'block', cellContent: 'block+' }),
  },
  marks: {},
});

function p(text) {
  return schema.node('paragraph', null, text ? [schema.text(text)] : []);
}

function cellTableDoc(cellText) {
  return schema.node('doc', null, [
    schema.node('table', null, [
      schema.node('table_row', null, [
        schema.node('table_cell', null, [p(cellText)]),
      ]),
    ]),
  ]);
}

function mountDoc(doc) {
  const mount = document.createElement('div');
  document.body.append(mount);
  return new EditorView(mount, { state: EditorState.create({ doc, schema }) });
}

// The position immediately before a node of `typeName` — this is the boundary
// value the controller stamps as `data-prose-index` when the WYSIWYG editable
// element sits at the start of its parent (a table cell). Feeding this offset
// deterministically reproduces the "Invalid content for node doc" crash.
function posBefore(doc, typeName) {
  let found = null;
  doc.descendants((node, pos) => {
    if (found !== null) return false;
    if (node.type.name !== typeName) return true;
    found = pos;
    return false;
  });
  return found;
}

describe('quick-edit-portal resolveEditableNode', () => {
  let view;
  afterEach(() => {
    view?.destroy();
    document.body.innerHTML = '';
    view = null;
  });

  it('resolves to the paragraph, not the table_cell, at the cell-content boundary', () => {
    const cellText = 'Intuit Enterprise Suite is a comprehensive business suite';
    const doc = cellTableDoc(cellText);
    // Boundary before the cell's paragraph — the offset that crashed prod.
    const cursorOffset = posBefore(doc, 'paragraph');
    const { node } = resolveEditableNode(doc, cursorOffset);

    expect(node.type.name).to.equal('paragraph');
    expect(node.textContent).to.equal(cellText);
    expect(!!schema.nodes.doc.contentMatch.matchType(node.type)).to.equal(true);
  });

  it('the resolved cell node can be wrapped in a doc without throwing', () => {
    const doc = cellTableDoc('Yes, comprehensive support is included');
    const cursorOffset = posBefore(doc, 'paragraph');
    const { node } = resolveEditableNode(doc, cursorOffset);

    // This is exactly what the WYSIWYG plugin does; a table_cell here throws
    // "RangeError: Invalid content for node doc".
    expect(() => schema.node('doc', null, [node])).to.not.throw();
  });

  it('preserves the instrumented index at the cell-content boundary', () => {
    const doc = cellTableDoc('cell text');
    const cursorOffset = posBefore(doc, 'paragraph');
    const { cursorOffset: newCursorOffset } = resolveEditableNode(doc, cursorOffset);

    // The plugin locates the placeholder by the returned index; it must equal
    // the stamped `data-prose-index` or the editor reloads in a loop.
    expect(newCursorOffset).to.equal(cursorOffset);
  });

  it('resolves a cell paragraph via a real posAtDOM index', () => {
    const cellText = 'support included';
    view = mountDoc(cellTableDoc(cellText));
    const el = view.dom.querySelector('td p, th p');
    const cursorOffset = view.posAtDOM(el, 0);
    const { node } = resolveEditableNode(view.state.doc, cursorOffset);

    expect(node.type.name).to.equal('paragraph');
    expect(node.textContent).to.equal(cellText);
  });

  it('resolves each block of a multi-block cell (heading + paragraph) to itself', () => {
    // Mirrors the crashing "cards" block: a table cell holding a heading and a
    // paragraph. Each is separately instrumented; neither must resolve to the
    // enclosing `table_cell(heading(...), paragraph(...))`.
    const doc = schema.node('doc', null, [
      schema.node('table', null, [
        schema.node('table_row', null, [
          schema.node('table_cell', null, [
            schema.node('heading', null, [schema.text('Advantage Banking')]),
            p('$11.95 monthly fee, waived with RBC Vantage.'),
          ]),
        ]),
      ]),
    ]);

    const headingIndex = posBefore(doc, 'heading');
    const headingResult = resolveEditableNode(doc, headingIndex);
    expect(headingResult.node.type.name).to.equal('heading');
    expect(headingResult.node.textContent).to.equal('Advantage Banking');

    const paragraphIndex = posBefore(doc, 'paragraph');
    const paragraphResult = resolveEditableNode(doc, paragraphIndex);
    expect(paragraphResult.node.type.name).to.equal('paragraph');
    expect(paragraphResult.node.textContent).to.equal('$11.95 monthly fee, waived with RBC Vantage.');

    // Both are valid `doc` children and neither is the cell.
    [headingResult, paragraphResult].forEach(({ node }) => {
      expect(node.type.name).to.not.equal('table_cell');
      expect(() => schema.node('doc', null, [node])).to.not.throw();
    });
  });

  it('still resolves a top-level paragraph to itself and preserves its index', () => {
    view = mountDoc(schema.node('doc', null, [p('a plain top-level paragraph')]));
    const el = view.dom.querySelector('p');
    const cursorOffset = view.posAtDOM(el, 0);
    const { node, cursorOffset: newCursorOffset } = resolveEditableNode(
      view.state.doc,
      cursorOffset,
    );

    expect(node.type.name).to.equal('paragraph');
    expect(node.textContent).to.equal('a plain top-level paragraph');
    expect(newCursorOffset).to.equal(cursorOffset);
  });
});
