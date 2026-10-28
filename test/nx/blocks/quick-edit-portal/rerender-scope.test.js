import { expect } from '@esm-bundle/chai';
import { Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';
import { getRerenderScope } from '../../../../nx/blocks/quick-edit-portal/src/rerender-scope.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*', toDOM: () => ['p', 0] },
    horizontal_rule: { group: 'block', toDOM: () => ['hr'] },
    text: { group: 'inline' },
    ...tableNodes({ tableGroup: 'block', cellContent: 'block+' }),
  },
  marks: {},
});

const p = (text) => schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
const hr = () => schema.nodes.horizontal_rule.create();
const table = (name, ...rows) => schema.nodes.table.create(null, [name, ...rows].map(
  (text) => schema.nodes.table_row.create(null, [schema.nodes.table_cell.create(null, p(text))]),
));
const doc = (...nodes) => schema.nodes.doc.create(null, nodes);
const body = (sections, blocksPerSection = []) => `<main>${sections.map((_, i) => `<div>${
  Array.from({ length: blocksPerSection[i] ?? 0 }, (__, j) => `<div data-block-index="${i}${j}"></div>`).join('')
}</div>`).join('')}</main>`;

describe('portal getRerenderScope', () => {
  it('renders the page without a baseline', () => {
    expect(getRerenderScope({ doc: doc(p('a')), body: body([1]) })).to.deep.equal({ type: 'page' });
  });

  it('scopes a change at the start of a section to that section', () => {
    const previousDoc = doc(p('a'), hr(), p('b'), p('c'));
    const next = doc(p('a'), hr(), p('b changed'), p('c'));
    expect(getRerenderScope({ previousDoc, doc: next, body: body([1, 1]) }))
      .to.deep.equal({ type: 'section', sectionIndex: 1 });
  });

  it('only scopes to a block when the body carries block markers', () => {
    const previousDoc = doc(p('a'), hr(), table('cards', 'one'));
    const next = doc(p('a'), hr(), table('cards', 'one', 'two'));
    expect(getRerenderScope({ previousDoc, doc: next, body: body([1, 1], [0, 1]) }))
      .to.deep.equal({ type: 'block', sectionIndex: 1, blockIndex: 0 });
    expect(getRerenderScope({ previousDoc, doc: next, body: body([1, 1]) }))
      .to.deep.equal({ type: 'section', sectionIndex: 1 });
  });

  it('renders the page for page metadata and multi-section changes', () => {
    expect(getRerenderScope({
      previousDoc: doc(p('a'), table('metadata', 'x')),
      doc: doc(p('a'), table('metadata', 'y')),
      body: body([1]),
    })).to.deep.equal({ type: 'page' });
    expect(getRerenderScope({
      previousDoc: doc(p('a'), hr(), p('b')),
      doc: doc(p('a2'), hr(), p('b2')),
      body: body([1, 1]),
    })).to.deep.equal({ type: 'page' });
  });

  it('reports added and removed sections', () => {
    const two = doc(p('a'), hr(), p('c'));
    const three = doc(p('a'), hr(), p('b'), hr(), p('c'));
    expect(getRerenderScope({ previousDoc: two, doc: three, body: body([1, 1, 1]) }))
      .to.deep.equal({ type: 'section-added', sectionIndex: 1 });
    expect(getRerenderScope({ previousDoc: three, doc: two, body: body([1, 1]) }))
      .to.deep.equal({ type: 'section-removed', sectionIndex: 1 });
  });
});
